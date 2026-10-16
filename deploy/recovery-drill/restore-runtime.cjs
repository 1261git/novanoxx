const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),{spawn,spawnSync}=require('node:child_process'),{pipeline}=require('node:stream/promises'),{Client}=require('pg');
const core=require('../../backup-pg-readonly.cjs'),pack=require('../../backup-offsite-package.cjs');
const quote=s=>'"'+s.replaceAll('"','""')+'"',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}
function binary(bin,name){return path.join(bin,name+(process.platform==='win32'?'.exe':''));}
async function restore({root,packageRoot,indexAnchor,privateKey,bin,appRoot,synthetic=false}){
 if(fs.readdirSync(root).length)throw Error('FRESH_OWNED_TARGET_REQUIRED');
 const report={version:1,status:'RESTORING',startedAt:new Date().toISOString(),realExternalProviderActions:false,synthetic};let candidate,pgStarted=false,website;
 const config={host:'127.0.0.1',port:await freePort(),user:'postgres',database:'postgres',password:crypto.randomBytes(32).toString('base64url'),options:'-c timezone=UTC'};
 function command(name,args,env={}){const r=spawnSync(binary(bin,name),args,{encoding:'utf8',windowsHide:true,timeout:60000,stdio:name==='pg_ctl'?'ignore':undefined,maxBuffer:8*1048576,env:{...process.env,...env}});if(r.error||r.status!==0){fs.writeFileSync(path.join(root,'private-'+name+'-'+Date.now()+'.log'),r.stderr||'FAILED',{flag:'wx',mode:0o600});throw Error('OWNED_COMMAND_FAILED_'+name.toUpperCase());}return r.stdout;}
 async function stop(){if(website&&website.exitCode===null&&website.signalCode===null){website.kill();await new Promise(resolve=>website.once('exit',resolve));}if(pgStarted){command('pg_ctl',['-D',path.join(root,'pg-data'),'-m','fast','-w','stop']);pgStarted=false;}}
 try{
  const reconstructed=path.join(root,'capture'),filesRoot=path.join(root,'files');fs.mkdirSync(reconstructed,{mode:0o700});fs.mkdirSync(filesRoot,{mode:0o700});
  candidate=await pack.restorePackage({packageRoot,indexAnchor,privateKey,destination:reconstructed});
  const manifest=JSON.parse(fs.readFileSync(path.join(candidate.root,'manifest.json')));
  if(synthetic?manifest.scope!=='SYNTHETIC_OFFSITE_FIXTURE_ONLY':manifest.source.service!=='srv-db5aqunlk1mc739bi0m0'||manifest.source.database!=='novanoxx_jk4i'||manifest.scope!=='OPERATING_READONLY_CANDIDATE_RESTORE_NOT_VERIFIED')throw Error('SOURCE_BINDING_REQUIRED');
  async function decrypt(artifact,record,target){const d=crypto.createDecipheriv('aes-256-gcm',candidate.key,Buffer.from(record.iv,'hex'));d.setAuthTag(Buffer.from(record.tag,'hex'));await pipeline(fs.createReadStream(path.join(candidate.root,artifact)),d,fs.createWriteStream(target,{flags:'wx',mode:0o600}));}
  const dump=path.join(root,'database.dump');await decrypt('database.enc',manifest.database,dump);
  for(const f of manifest.files){if(!f.name||f.name.includes('\\')||f.name.includes(':')||f.name.split('/').some(s=>!s||s==='..'||s==='.'))throw Error('FILE_PATH_REFUSED');const target=path.join(filesRoot,...f.name.split('/'));if(!target.startsWith(filesRoot+path.sep))throw Error('FILE_PATH_REFUSED');fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});await decrypt(f.artifact,f,target);const bytes=fs.readFileSync(target);if(bytes.length!==f.bytes||sha(bytes)!==f.sha)throw Error('FILE_HASH_MISMATCH');}
  report.capturedAt=manifest.freeze?.observedAt||manifest.createdAt;report.files=manifest.files.length;report.fileBytes=manifest.files.reduce((s,f)=>s+f.bytes,0);report.fileHashesMatch=true;
  if(/\b(SUBSCRIPTION|FOREIGN SERVER|USER MAPPING|EVENT TRIGGER)\b/.test(command('pg_restore',['--list',dump])))throw Error('EXTERNAL_ARCHIVE_SIDE_EFFECT_REFUSED');
  const passwordFile=path.join(root,'pg-password');fs.writeFileSync(passwordFile,config.password,{flag:'wx',mode:0o600});
  command('initdb',['-D',path.join(root,'pg-data'),'-U','postgres','--pwfile',passwordFile,'-A','scram-sha-256','--encoding=UTF8','--locale=C','--no-instructions']);
  command('pg_ctl',['-D',path.join(root,'pg-data'),'-l',path.join(root,'private-pg.log'),'-o','-h 127.0.0.1 -p '+config.port+' -c timezone=UTC -c shared_buffers=32MB -c max_connections=20'+(process.platform==='linux'?' -k '+root:''),'-w','start']);pgStarted=true;
  const database='nnx_drill_'+crypto.randomBytes(6).toString('hex'),admin=new Client(config);await admin.connect();
  try{for(const r of manifest.catalog.roles.filter(r=>!r.rolname.startsWith('pg_')&&r.rolname!=='postgres')){if(!/^[a-z][a-z0-9_]*$/.test(r.rolname))throw Error('ROLE_NAME_REFUSED');const flags=[['rolsuper','SUPERUSER'],['rolinherit','INHERIT'],['rolcreaterole','CREATEROLE'],['rolcreatedb','CREATEDB'],['rolcanlogin','LOGIN'],['rolreplication','REPLICATION'],['rolbypassrls','BYPASSRLS']].map(([k,f])=>(r[k]?'':'NO')+f);await admin.query('CREATE ROLE '+quote(r.rolname)+' '+flags.join(' '));}
   for(const m of manifest.catalog.memberships){if(m.grantor!=='postgres')throw Error('MEMBERSHIP_GRANTOR_REVIEW_REQUIRED');await admin.query('GRANT '+quote(m.role)+' TO '+quote(m.member)+' WITH ADMIN '+(m.admin_option?'TRUE':'FALSE')+', INHERIT '+(m.inherit_option?'TRUE':'FALSE')+', SET '+(m.set_option?'TRUE':'FALSE'));}
   await admin.query('CREATE DATABASE '+quote(database)+' OWNER "novanoxx" TEMPLATE template0');
  }finally{await admin.end();}
  config.database=database;if(Object.keys(await core.fingerprint(config)).length)throw Error('TARGET_DATABASE_NOT_EMPTY');
  command('pg_restore',['-h','127.0.0.1','-p',String(config.port),'-U','postgres','-d',database,'--single-transaction','--exit-on-error',dump],{PGPASSWORD:config.password,PGOPTIONS:'-c timezone=UTC -c statement_timeout=60000 -c lock_timeout=10000'});
  async function compare(){const fingerprints=await core.fingerprint(config),catalog=await core.catalog(config);if(JSON.stringify(fingerprints)!==JSON.stringify(manifest.fingerprint))throw Error('ROW_HASH_MISMATCH');const checks=Object.fromEntries(Object.keys(manifest.catalog).map(k=>[k,JSON.stringify(catalog[k])===JSON.stringify(manifest.catalog[k])]));if(Object.values(checks).some(v=>!v))throw Error('CATALOG_MISMATCH');return {tables:Object.keys(fingerprints).length,rows:Object.values(fingerprints).reduce((s,r)=>s+r.count,0),catalogChecks:checks,rowFingerprintMatches:true};}
  Object.assign(report,await compare());
  const appPassword=crypto.randomBytes(32).toString('base64url'),c=new Client(config);await c.connect();try{await c.query('ALTER ROLE "novanoxx" PASSWORD '+"'"+appPassword+"'");}finally{await c.end();}
  const appPort=await freePort(),origin='http://127.0.0.1:'+appPort;
  const safeEnv=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','NODE_PATH','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(safeEnv,{HOST:'127.0.0.1',PORT:String(appPort),PUBLIC_BASE_URL:origin,NODE_ENV:'development',DATABASE_BACKEND:'postgres',DATABASE_URL:'postgresql://novanoxx:'+appPassword+'@127.0.0.1:'+config.port+'/'+database,DATA_DIR:filesRoot,MIGRATE_SQLITE:'0',NNX_BACKUP_AUTOMATION:'0'});
  const fd=fs.openSync(path.join(root,'private-app.log'),'wx',0o600);website=spawn(process.execPath,[path.join(appRoot,'server.cjs')],{cwd:appRoot,env:safeEnv,windowsHide:true,stdio:['ignore',fd,fd]});fs.closeSync(fd);
  const deadline=Date.now()+30000;let health;while(Date.now()<deadline){if(website.exitCode!==null)throw Error('WEBSITE_START_FAILED');try{health=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)});if(health.ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}if(!health?.ok)throw Error('WEBSITE_HEALTH_FAILED');
  report.homeHTTP=(await fetch(origin)).status;report.catalogHTTP=(await fetch(origin+'/api/catalog')).status;report.anonymousUser=(await(await fetch(origin+'/api/auth/me')).json()).user===null;
  if(report.homeHTTP!==200||report.catalogHTTP!==200||!report.anonymousUser)throw Error('WEBSITE_VERIFICATION_FAILED');Object.assign(report,await compare());
  report.status='RESTORED_AND_LOCALLY_VERIFIED_EXTERNAL_PROBE_PENDING';report.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(root,'private-owned-target.json'),JSON.stringify({config,appPassword,captureAnchor:candidate.anchor}),{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
  return {report,origin,stop};
 }catch(e){await stop();report.status='FAILED_NEW_TARGET_PRESERVED';report.errorCode=/^[A-Z0-9_]+$/.test(e.message)?e.message:'RESTORE_FAILED';fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});throw Error(report.errorCode);}
 finally{candidate?.key.fill(0);}
}
async function resume({root,bin,appRoot}){
 if(fs.existsSync(path.join(root,'failure.json')))throw Error('FAILED_TARGET_PRESERVED');
 const owned=JSON.parse(fs.readFileSync(path.join(root,'private-owned-target.json'))),report=JSON.parse(fs.readFileSync(path.join(root,'report.json'))),manifestBytes=fs.readFileSync(path.join(root,'capture/manifest.json')),manifest=JSON.parse(manifestBytes),config=owned.config;
 if(report.status!=='RESTORED_AND_LOCALLY_VERIFIED_EXTERNAL_PROBE_PENDING'||sha(manifestBytes)!==owned.captureAnchor||config.host!=='127.0.0.1'||config.user!=='postgres'||!/^nnx_drill_[a-f0-9]{12}$/.test(config.database)||!Number.isSafeInteger(config.port)||config.port<1024||config.port>65535||!/^[A-Za-z0-9_-]{43}$/.test(owned.appPassword))throw Error('RESUME_BINDING_REQUIRED');
 function command(name,args){const r=spawnSync(binary(bin,name),args,{windowsHide:true,timeout:60000,stdio:'ignore'});if(r.error||r.status!==0)throw Error('OWNED_RESUME_COMMAND_FAILED');}
 let started=false,website;async function stop(){if(website&&website.exitCode===null&&website.signalCode===null){website.kill();await new Promise(r=>website.once('exit',r));}if(started){command('pg_ctl',['-D',path.join(root,'pg-data'),'-m','fast','-w','stop']);started=false;}}
 try{command('pg_ctl',['-D',path.join(root,'pg-data'),'-l',path.join(root,'private-pg.log'),'-o','-h 127.0.0.1 -p '+config.port+' -c timezone=UTC -c shared_buffers=32MB -c max_connections=20'+(process.platform==='linux'?' -k '+root:''),'-w','start']);started=true;
  async function compare(){if(JSON.stringify(await core.fingerprint(config))!==JSON.stringify(manifest.fingerprint)||JSON.stringify(await core.catalog(config))!==JSON.stringify(manifest.catalog))throw Error('RESUME_DATA_MISMATCH');for(const f of manifest.files){if(f.name.split('/').some(x=>!x||x==='..'||x==='.')||f.name.includes('\\')||f.name.includes(':'))throw Error('RESUME_FILE_PATH_REFUSED');const bytes=fs.readFileSync(path.join(root,'files',...f.name.split('/')));if(bytes.length!==f.bytes||sha(bytes)!==f.sha)throw Error('RESUME_FILE_HASH_MISMATCH');}}await compare();
  const port=await freePort(),origin='http://127.0.0.1:'+port,safe=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','NODE_PATH','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));Object.assign(safe,{HOST:'127.0.0.1',PORT:String(port),PUBLIC_BASE_URL:origin,NODE_ENV:'development',DATABASE_BACKEND:'postgres',DATABASE_URL:'postgresql://novanoxx:'+owned.appPassword+'@127.0.0.1:'+config.port+'/'+config.database,DATA_DIR:path.join(root,'files'),MIGRATE_SQLITE:'0',NNX_BACKUP_AUTOMATION:'0'});
  const fd=fs.openSync(path.join(root,'private-resumed-app-'+Date.now()+'.log'),'wx',0o600);website=spawn(process.execPath,[path.join(appRoot,'server.cjs')],{cwd:appRoot,env:safe,windowsHide:true,stdio:['ignore',fd,fd]});fs.closeSync(fd);
  let healthy=false;for(let i=0;i<100;i++){if(website.exitCode!==null)throw Error('RESUME_APP_FAILED');try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)})).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!healthy)throw Error('RESUME_HEALTH_FAILED');await compare();
  return {origin,report:{...report,resumedAt:new Date().toISOString(),resumeRowsCatalogMatch:true},stop};
 }catch(e){await stop();throw e;}
}
module.exports={restore,resume,freePort,binary};
