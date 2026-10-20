// Explicit production READ-ONLY export. No restore, migration, role or business writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{pipeline}=require('node:stream/promises'),{Client}=require('pg');
const sourceService='srv-db5aqunlk1mc739bi0m0',sourceHost='dpg-db5ps6navr4c739lilj0-a',sourceDatabase='novanoxx_jk4i',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function settings(env){
 if(env.NNX_PRODUCTION_BACKUP_READ_ONLY!=='1'||env.NNX_WRITERS_FROZEN_CONFIRMED!=='1'||env.RENDER_SERVICE_ID!==sourceService)throw Error('OPERATING_READONLY_SCOPE_REQUIRED');
 const url=new URL(env.DATABASE_URL||'');
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!==sourceHost||decodeURIComponent(url.pathname.slice(1))!==sourceDatabase||!env.NNX_EXPECTED_MAIN_USER||decodeURIComponent(url.username)!==env.NNX_EXPECTED_MAIN_USER||Number(url.port||5432)!==5432)throw Error('OPERATING_DATABASE_BINDING_REQUIRED');
 return {host:url.hostname,port:5432,database:sourceDatabase,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),options:'-c default_transaction_read_only=on'};
}
async function files(root,excluded,signal){
 const result=[];async function walk(dir){for(const name of fs.readdirSync(dir).sort()){
  signal?.throwIfAborted();const file=path.join(dir,name);if(file===excluded)continue;const s=fs.lstatSync(file);
  if(s.isSymbolicLink())throw Error('OPERATING_SYMLINK_DENIED');
  if(s.isDirectory())await walk(file);else if(s.isFile()){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file,{signal}))h.update(b);result.push({name:path.relative(root,file).replaceAll('\\','/'),bytes:s.size,sha:h.digest('hex')});}else throw Error('OPERATING_SPECIAL_FILE_DENIED');
 }}await walk(root);return result.sort((a,b)=>a.name.localeCompare(b.name));
}
async function encrypt(input,dest,key,signal){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);await pipeline(input,cipher,fs.createWriteStream(dest,{flags:'wx',mode:0o600}),{signal});return {iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex')};
}
async function capture(env=process.env){
 const config=settings(env);
 if(process.platform!=='linux'||fs.realpathSync(env.DATA_DIR||'/data')!=='/data')throw Error('OPERATING_VOLUME_REQUIRED');
 // Refuse missing/wrong PG client before closing admission or reading a key.
 const runtime=require('./backup-pg18-runtime.cjs').check();let freeze,key,root,child;
 try{
  freeze=await (env.NNX_BACKUP_GATE_SOCKET?require('./backup-gate-proof.cjs'):require('./operating-freeze-proof.cjs')).production({env,config});
  const keyFile=fs.realpathSync(env.NNX_BACKUP_KEY_FILE||'');if(keyFile.startsWith('/data/'))throw Error('BACKUP_KEY_MUST_BE_SEPARATE');
  const raw=fs.readFileSync(keyFile);key=raw.length===32?raw:Buffer.from(raw.toString().trim(),'base64');if(key!==raw)raw.fill(0);if(key.length!==32)throw Error('BACKUP_KEY_REQUIRED');
  const store='/data/.private-nnx-backups';fs.mkdirSync(store,{recursive:true,mode:0o700});
  if(fs.lstatSync(store).isSymbolicLink())throw Error('OPERATING_SYMLINK_DENIED');fs.chmodSync(store,0o700);
  root=fs.mkdtempSync(path.join(store,'bundle-'));const core=require('./backup-pg-readonly.cjs');
  const beforeFiles=await files('/data',store,freeze.signal),before=await core.fingerprint(config),catalog=await core.catalog(config),client=new Client(config);await client.connect();let size;
  try{await client.query('BEGIN READ ONLY');size=Number((await client.query('SELECT pg_database_size(current_database()) AS n')).rows[0].n);await client.query('COMMIT');}finally{await client.end();}
  const fileBytes=beforeFiles.reduce((a,row)=>a+row.bytes,0),captureLimit=env.NNX_BACKUP_CAPTURE_MAX_BYTES===undefined?null:Number(env.NNX_BACKUP_CAPTURE_MAX_BYTES);
  if(captureLimit!==null&&(!Number.isSafeInteger(captureLimit)||captureLimit<1||captureLimit>512*1048576||fileBytes+size*2+4*1048576>captureLimit))throw Error('BACKUP_CAPTURE_POLICY_LIMIT');
  const stat=fs.statfsSync(store);if(Number(stat.bavail)*Number(stat.bsize)<fileBytes+size*3+512*1048576)throw Error('BACKUP_SPACE_LOW');
  await freeze.assert();
  child=spawn(runtime.binary,['-h',config.host,'-p','5432','-U',config.user,'-d',config.database,'-Fc','--exclude-table-data=public.engine_discovery_events','--exclude-table-data=public.visitor_browser_daily'],{env:{PATH:'/usr/bin:/bin',LANG:'C',PGPASSWORD:config.password,PGCONNECT_TIMEOUT:'10',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=10000'},stdio:['ignore','pipe','ignore'],signal:freeze.signal});
  const done=new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('OPERATING_DUMP_FAILED')));child.once('close',code=>code===0?resolve():reject(Error('OPERATING_DUMP_FAILED')));});done.catch(()=>{});
  const database=await encrypt(child.stdout,path.join(root,'database.enc'),key,freeze.signal);await done;const entries=[];
  for(const [index,row]of beforeFiles.entries()){const artifact='file-'+index+'.enc';entries.push({...row,artifact,...await encrypt(fs.createReadStream(path.join('/data',row.name),{signal:freeze.signal}),path.join(root,artifact),key,freeze.signal)});}
  if(JSON.stringify(await files('/data',store,freeze.signal))!==JSON.stringify(beforeFiles)||JSON.stringify(await core.fingerprint(config))!==JSON.stringify(before)||JSON.stringify(await core.catalog(config))!==JSON.stringify(catalog))throw Error('OPERATING_SOURCE_CHANGED');
  await freeze.assert();
  const manifest={version:1,scope:'OPERATING_READONLY_CANDIDATE_RESTORE_NOT_VERIFIED',createdAt:new Date().toISOString(),source:{service:sourceService,host:sourceHost,database:sourceDatabase},freeze:freeze.summary,runtime,database,discoveryRawExcluded:true,visitorBrowserRowsExcluded:true,files:entries,fingerprint:before,catalog,offsiteCopy:'REQUIRED_NOT_PERFORMED',restore:'REQUIRED_IN_NEW_TARGET_NOT_PERFORMED'};
  const bytes=Buffer.from(JSON.stringify(manifest));fs.writeFileSync(path.join(root,'manifest.json'),bytes,{flag:'wx',mode:0o600});
  // A lease lost during final commit leaves FAILED.json, which packaging refuses.
  await freeze.assert();return {root,anchor:sha(bytes),files:entries.length,tables:Object.keys(before).length,status:manifest.scope};
 }catch(error){if(root)fs.writeFileSync(path.join(root,'FAILED.json'),JSON.stringify({status:'FAILED',code:error.code||error.message}),{flag:'wx',mode:0o600});throw error;}
 finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');key?.fill(0);await freeze?.close?.();}
}
module.exports={settings,capture};
if(require.main===module)capture().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Operating read-only backup refused or failed. Existing records retained.');process.exitCode=1;});
