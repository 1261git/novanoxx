const {parentPort,workerData}=require('node:worker_threads');
const {serialize}=require('node:v8');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const translate=require('./sql-dialect.cjs');
let client,pglite=false,initializationError;
const quote=name=>'"'+name.replaceAll('"','""')+'"';
function canonical(rows){return JSON.stringify(rows.map(row=>Object.fromEntries(Object.keys(row).sort().map(key=>[key,Buffer.isBuffer(row[key])||row[key] instanceof Uint8Array?{binary:Buffer.from(row[key]).toString('base64')}:row[key]]))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))}
function digest(rows){return crypto.createHash('sha256').update(canonical(rows)).digest('hex')}
async function query(sql,params){if(pglite&&!params?.length){const results=await client.exec(sql);return results.at(-1)||{rows:[],rowCount:0};}return params?.length?client.query(sql,params.map(value=>value instanceof Uint8Array?Buffer.from(value):value)):client.query(sql)}
async function migrate(source){
 const {DatabaseSync,backup}=require('node:sqlite');
 if(!fs.existsSync(source))throw Error('Existing SQLite database required for migration');
 const directory=path.join(path.dirname(source),'backups');fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const snapshot=path.join(directory,'before-postgres-'+Date.now()+'.sqlite');
 const live=new DatabaseSync(source,{readOnly:true});try{await backup(live,snapshot)}finally{live.close()}
 const old=new DatabaseSync(snapshot,{readOnly:true});
 try{
  if(old.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('SQLite backup failed integrity check');
  const tables=old.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const existing=await query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'nnx_migrations'");
  if(existing.rows.length)throw Error('PostgreSQL is not empty; migration refused');
  await query('BEGIN');
  try{
   await query('SELECT pg_advisory_xact_lock(771102026)');
   const manifest={version:1,createdAt:new Date().toISOString(),tables:{}};
   for(const table of tables){
    if(!/^[a-z_]+$/.test(table.name))throw Error('Unexpected SQLite table');
    await query(translate(table.sql));
    const rows=old.prepare('SELECT * FROM '+quote(table.name)).all();
    for(const row of rows){const columns=Object.keys(row),parameters=columns.map((_,index)=>'$'+(index+1)).join(',');await query('INSERT INTO '+quote(table.name)+'('+columns.map(quote).join(',')+') VALUES('+parameters+')',columns.map(name=>row[name]));}
    const copied=(await query('SELECT * FROM '+quote(table.name))).rows;
    if(digest(rows)!==digest(copied))throw Error('Migration verification failed: '+table.name);
    manifest.tables[table.name]={count:rows.length,sha256:digest(rows)};
    if(/AUTOINCREMENT/.test(table.sql)){const name=table.name==='catalog_links'?'public_id':'id';await query('SELECT setval(pg_get_serial_sequence($1,$2),COALESCE((SELECT MAX('+quote(name)+') FROM '+quote(table.name)+'),1),(SELECT COUNT(*)>0 FROM '+quote(table.name)+'))',[table.name,name]);}
   }
   await query('CREATE TABLE nnx_migrations(version TEXT PRIMARY KEY,completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),manifest TEXT NOT NULL)');
   await query('INSERT INTO nnx_migrations(version,manifest) VALUES($1,$2)',['sqlite-v1',JSON.stringify(manifest)]);
   fs.writeFileSync(snapshot+'.manifest.json',JSON.stringify(manifest,null,2),{mode:0o600});await query('COMMIT');
   console.log('PostgreSQL migration verified: '+tables.length+' tables; SQLite backup retained');console.log('Migration row counts: '+JSON.stringify(Object.fromEntries(Object.entries(manifest.tables).map(([name,entry])=>[name,entry.count]))));
  }catch(error){await query('ROLLBACK');throw error}
 }finally{old.close()}
}
const ready=(async()=>{
 if(workerData.pglite){const {PGlite}=require('@electric-sql/pglite');client=new PGlite(workerData.pglitePath);pglite=true;await client.waitReady;}
 else{const pg=require('pg');require('./pg-types.cjs')(pg);const url=workerData.url||process.env.DATABASE_URL;if(!url)throw Error('DATABASE_URL missing');client=new pg.Client({connectionString:url,connectionTimeoutMillis:15000,statement_timeout:20000,application_name:'novanoxx'});await client.connect();}
 if(workerData.migrateSource){const found=await query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='nnx_migrations'");if(!found.rows.length)await migrate(workerData.migrateSource);else{const completed=await query("SELECT version FROM nnx_migrations WHERE version='sqlite-v1'");if(!completed.rows.length)throw Error('Unknown migration state');}}
})().catch(error=>{initializationError=error});
let queue=Promise.resolve();
parentPort.on('message',message=>{queue=queue.then(async()=>{
 const {request,memory}=message;const header=new Int32Array(memory,0,2);let response;
 try{
  await ready;if(initializationError)throw initializationError;
  if(request.operation==='ready')response={value:true};
  else if(request.operation==='close'){await (pglite?client.close():client.end());response={value:true};}
  else{
   let sql=request.sql,result;
   if(/sqlite_master/.test(sql)){const match=/name='([a-z_]+)'/.exec(sql);result=await query("SELECT tablename AS name FROM pg_tables WHERE schemaname='public' AND tablename=$1",[match?.[1]||'']);if(/COUNT\(\*\)/i.test(sql))result={rows:[{n:result.rows.length}]};}
   else{
    sql=translate(sql);
    // Serializes existing short transactions across instances until async repositories replace this compatibility layer.
    if(/^BEGIN\s*;?$/i.test(sql.trim())){await query('BEGIN');result=await query('SELECT pg_advisory_xact_lock(771102026)');}
    else result=await query(sql,request.params);
   }
   response={value:request.operation==='get'?result.rows?.[0]:request.operation==='all'?result.rows:request.operation==='run'?{changes:result.rowCount??result.affectedRows??0}:undefined};
  }
 }catch(error){response={error:{message:initializationError?'Database initialization failed; original SQLite data retained':error.message,code:error.code}};if(initializationError)console.error('Database startup failed:',initializationError.code||initializationError.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'));}
 let bytes=serialize(response);if(bytes.length>memory.byteLength-8)bytes=serialize({error:{message:'Database response too large'}});new Uint8Array(memory,8,bytes.length).set(bytes);Atomics.store(header,1,bytes.length);Atomics.store(header,0,1);Atomics.notify(header,0);
})});

