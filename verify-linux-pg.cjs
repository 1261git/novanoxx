'use strict';
// Starts the exact candidate server against a fresh, owned loopback PostgreSQL 18.
// Uses the real Linux Unix gate; only external mail transport is redirected locally.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {DatabaseSync}=require('node:sqlite');
if(process.platform!=='linux'||process.env.NNX_SYNTHETIC_JOB!=='stage9-owned-pg-v1')throw Error('ISOLATED_LINUX_JOB_REQUIRED');
const release=path.join(__dirname,'source');
const evidence=fs.mkdtempSync('/tmp/nnx-stage9-pg-');fs.chmodSync(evidence,0o700);
const data=path.join(evidence,'data');fs.mkdirSync(data);
const id=()=>crypto.randomUUID(),key=crypto.randomBytes(32),hook=crypto.randomBytes(32);
const report={scope:'PROPOSED_PRODUCTION_SERVER_LOCAL_POSTGRES_AND_HTTP_PROVIDER_ONLY',checks:[],externalProviderCalls:0,release};
let child,provider,origin,port,calls=0,lastMessage,wake,pgRead,pgOwned=false,socketPath;
const cp=require('node:child_process');
const pgBin='/usr/lib/postgresql/18/bin';
const pgData=path.join(evidence,'pgdata'),pgUser='nnx_isolated',pgPass=crypto.randomBytes(32).toString('hex');let pgUrl;
function command(name,args,commandEnv=process.env){const r=cp.spawnSync(path.join(pgBin,name),args,{env:commandEnv,windowsHide:true,stdio:'ignore',timeout:60000});if(r.status!==0)throw Error('OWNED_PG_'+name+'_FAILED');}
async function startPG(){const reserve=http.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const p=reserve.address().port;await new Promise(r=>reserve.close(r));const pw=path.join(evidence,'init-password');fs.writeFileSync(pw,pgPass,{mode:0o600});command('initdb',['-D',pgData,'-U',pgUser,'--pwfile',pw,'--auth=scram-sha-256','--encoding=UTF8','--no-locale']);fs.writeFileSync(pw,'');fs.appendFileSync(path.join(pgData,'postgresql.conf'),"\nlisten_addresses='127.0.0.1'\nport="+p+"\nunix_socket_directories='"+evidence+"'\n");command('pg_ctl',['-D',pgData,'-l',path.join(evidence,'postgres.log'),'-w','start']);pgOwned=true;const u=new URL('postgres://127.0.0.1/postgres');u.port=String(p);u.username=pgUser;u.password=pgPass;pgUrl=u.href;pgRead=new(require("/app/source/database/postgres.cjs"))({url:pgUrl});report.backend='postgres';report.pgVersion=pgRead.prepare('SELECT version() AS version').get().version;}

const received=()=>new Promise(resolve=>{wake=resolve;});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pass=name=>{report.checks.push({name,status:'PASS'});console.log('PASS '+name);};
const preload=path.join(evidence,'local-only-preload.cjs');
fs.writeFileSync(preload,`'use strict';
const path=require('node:path');const target=process.env.NNX_LOCAL_RELEASE_ROOT;
const runtime=require(path.join(target,'mail-runtime.cjs')),configured=runtime.configured;
runtime.configured=(input,env)=>configured(input,env,{localTest:true});
const request=global.fetch;
global.fetch=(url,options)=>{if(url!=='https://api.resend.com/emails')throw Error('EXTERNAL_HTTP_FORBIDDEN_IN_LOCAL_REHEARSAL');return request(process.env.NNX_LOCAL_PROVIDER_URL,options);};
`);
function childEnv(paused,enabled){
 const env={};for(const name of ['PATH','Path','SYSTEMROOT','SystemRoot','WINDIR','TEMP','TMP','LOCALAPPDATA','USERPROFILE','NODE_PATH'])if(process.env[name])env[name]=process.env[name];
 Object.assign(env,{NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),PUBLIC_BASE_URL:origin,DATA_DIR:data,DATABASE_BACKEND:'postgres',DATABASE_URL:pgUrl,NODE_PATH:'/app/node_modules',NNX_BACKUP_GATE:'1',RENDER_SERVICE_ID:'stage9-owned-synthetic',RENDER_INSTANCE_ID:crypto.randomUUID(),
  NNX_LOCAL_RELEASE_ROOT:release,NNX_LOCAL_PROVIDER_URL:'http://127.0.0.1:'+provider.address().port+'/emails'});
 if(enabled)Object.assign(env,{NNX_MAIL_ENABLED:'1',NNX_MAIL_ENCRYPTION_KEY:key.toString('base64'),RESEND_API_KEY:'re_'+crypto.randomBytes(24).toString('hex'),
  RESEND_WEBHOOK_SECRET:'whsec_'+hook.toString('base64'),NNX_MAIL_FROM:'NovaNoxX <no-reply@notify.novanoxx.com>',NNX_MAIL_REPLY_TO:'support@novanoxx.com'});
 if(enabled==='off')env.NNX_MAIL_ENABLED='0';if(paused!==undefined)env.NNX_MAIL_SEND_PAUSED=paused;
 return env;
}
async function start(paused,enabled=true){
 child=spawn(process.execPath,['--require',preload,path.join(release,'server.cjs')],{cwd:release,env:childEnv(paused,enabled),stdio:['ignore','pipe','pipe'],windowsHide:true});
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('LOCAL_SERVER_START_TIMEOUT')),10000);
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);if(code!==null)reject(Error('LOCAL_SERVER_EXIT_'+code));});
  child.stdout.on('data',data=>{output+=data.toString();for(const line of output.split('\n'))if(line.startsWith('NNX_BACKUP_GATE_READY '))socketPath=JSON.parse(line.slice(22)).socket;if(output.includes('NovaNoxX server ready')){clearTimeout(timer);resolve();}});
  child.stderr.on('data',()=>{});
 });
}
async function stop(){if(!child)return;const current=child;child=null;if(current.exitCode!==null)return;const done=once(current,'exit');current.kill();await done;}
async function api(route,input,cookie=''){
 const response=await fetch(origin+route,{method:input===undefined?'GET':'POST',headers:{cookie,...(input===undefined?{}:{Origin:origin,'Content-Type':'application/json'})},body:input===undefined?undefined:JSON.stringify(input)});
 return {status:response.status,body:await response.json(),cookie:response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')};
}
function read(sql,...args){return pgRead.prepare(sql).get(...args);}
let closing=false;process.once('SIGTERM',async()=>{if(closing)return;closing=true;try{await stop();pgRead?.close();if(pgOwned){command('pg_ctl',['-D',pgData,'-m','fast','-w','stop']);pgOwned=false;}if(provider){provider.closeAllConnections();await new Promise(r=>provider.close(r));}}finally{process.exit(143);}});
(async()=>{try{
 provider=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;assert.equal(req.url,'/emails');calls++;lastMessage=JSON.parse(body);lastMessage.providerId=id();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:lastMessage.providerId}));wake?.();wake=null;});
 provider.listen(0,'127.0.0.1');await once(provider,'listening');await startPG();
 const reserve=http.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));origin='http://127.0.0.1:'+port;
 const legacy='legacy@example.invalid',pending='pending@example.invalid',password='Synthetic-mail-only-2026!';
 await start(undefined,false);
 assert.deepEqual((await api('/api/auth/mail/status')).body,{enabled:false});
 assert.equal((await api('/api/auth/signup',{email:legacy,password,name:'legacy',requestId:id()})).status,200);
 await stop();pass('mail disabled preserves the existing server and legacy signup path');
 await start(undefined);
 assert.equal((await api('/api/auth/login',{email:legacy,password})).status,200);
 assert.equal((await api('/api/auth/signup',{email:pending,password,name:'pending',requestId:id()})).status,200);
 assert.equal((await api('/api/auth/login',{email:pending,password})).status,403);
 const queued=read('SELECT * FROM mail_outbox WHERE recipient=?',pending);
 await delay(5250);assert.equal(calls,0);assert.deepEqual(read('SELECT * FROM mail_outbox WHERE recipient=?',pending),queued);
 await stop();pass('missing pause setting keeps actual production timer silent and pending signup protected');
 const arrived=received();await start('0');await Promise.race([arrived,delay(8500).then(()=>{throw Error('LOCAL_MAIL_SEND_TIMEOUT');})]);
 assert.equal(calls,1);assert.deepEqual(lastMessage.to,[pending]);
 const link=lastMessage.text.split('\n').find(line=>line.startsWith(origin+'/#/verify-email?'));
 assert.ok(link);const token=new URLSearchParams(new URL(link).hash.split('?')[1]).get('token');
 assert.equal((await api('/api/auth/verify-email',{token})).status,200);assert.equal((await api('/api/auth/verify-email',{token})).status,400);
 assert.equal((await api('/api/auth/login',{email:pending,password})).status,200);
 for(let i=0;i<40&&read('SELECT state FROM mail_outbox WHERE recipient=?',pending).state!=='ACCEPTED';i++)await delay(25);
 assert.equal(read('SELECT state FROM mail_outbox WHERE recipient=?',pending).state,'ACCEPTED');
 pass('explicit unpause restarts the same DB and submits the existing encrypted verification once');
 const raw=JSON.stringify({type:'email.delivered',data:{email_id:lastMessage.providerId,to:[pending]}}),eventId='msg_'+crypto.randomBytes(16).toString('hex'),stamp=String(Math.floor(Date.now()/1000));
 const signature=crypto.createHmac('sha256',hook).update(eventId+'.'+stamp+'.'+raw).digest('base64');
 const webhook=await fetch(origin+'/api/auth/mail/webhook',{method:'POST',headers:{'Content-Type':'application/json','svix-id':eventId,'svix-timestamp':stamp,'svix-signature':'v1,'+signature},body:raw});
 assert.equal(webhook.status,200);assert.equal(read('SELECT state FROM mail_outbox WHERE recipient=?',pending).state,'DELIVERED');
 await stop();pass('the proposed production HTTP webhook records a signed delivery without losing old accounts');
 await start('1');
 assert.equal((await api('/api/auth/request-password-reset',{email:pending,requestId:id()})).status,200);
 assert.equal((await api('/api/auth/login',{email:pending,password})).status,200);
 const reset=read("SELECT * FROM mail_outbox WHERE template='RESET'");assert.equal(reset.state,'READY');
 await delay(5250);assert.equal(calls,1);assert.deepEqual(read("SELECT * FROM mail_outbox WHERE template='RESET'"),reset);
 await stop();pass('restart with explicit pause preserves verified login and new reset queue without sending');
 report.status='PASS_PROPOSED_PRODUCTION_MAIL_HTTP';report.syntheticProviderEffects=calls;

 const savedReset=read("SELECT * FROM mail_outbox WHERE template='RESET'"),savedConfig=read('SELECT * FROM mail_configuration WHERE id=1');
 for(const flag of [false,'off']){await assert.rejects(start('1',flag),/LOCAL_SERVER_EXIT_1/);await stop();assert.deepEqual(read("SELECT * FROM mail_outbox WHERE template='RESET'"),savedReset);assert.deepEqual(read('SELECT * FROM mail_configuration WHERE id=1'),savedConfig);}
 pass('missing or OFF activation refuses actual candidate server startup on persisted PG mail store');
 await start('1');assert.equal((await api('/api/auth/login',{email:pending,password})).status,200);assert.deepEqual(read("SELECT * FROM mail_outbox WHERE template='RESET'"),savedReset);assert.equal(calls,1);await stop();pass('valid enabled and paused PG restart restores verified login and queue without another send');
 await start('1');const lease=await require(path.join(release,'backup-gate-client.cjs')).acquire({socketPath,durationMs:5000,drainMs:1000});try{assert.equal((await api('/api/auth/me')).status,503);assert.equal((await api('/api/auth/login',{email:pending,password})).status,503);assert.deepEqual(read("SELECT * FROM mail_outbox WHERE template='RESET'"),savedReset);await lease.assert();}finally{await lease.close();}assert.equal((await api('/api/auth/login',{email:pending,password})).status,200);await stop();pass('actual Linux Unix gate blocks PG authentication work and resumes the same preserved state');
 report.status='PASS_ISOLATED_LINUX_PG18_CANDIDATE';

}catch(error){report.status='FAIL';report.error=error.message;console.error(error.stack);process.exitCode=1;}
finally{await stop();if(pgOwned){try{const u=new URL(pgUrl),archive=path.join(evidence,'synthetic-pg.dump');command('pg_dump',['--format=custom','--no-owner','--no-acl','-h','127.0.0.1','-p',u.port,'-U',pgUser,'-d','postgres','-f',archive],{PATH:process.env.PATH,PGPASSWORD:pgPass});report.syntheticArchive={path:archive,bytes:fs.statSync(archive).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')};}catch{report.syntheticArchiveError='ARCHIVE_CAPTURE_FAILED';process.exitCode=1;}}if(pgRead)pgRead.close();if(pgOwned){command('pg_ctl',['-D',pgData,'-m','fast','-w','stop']);pgOwned=false;report.ownedPGStopped=true;}if(provider){provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve));}key.fill(0);hook.fill(0);report.ownedChildStopped=true;report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log('NNX_STAGE9_RESULT '+JSON.stringify({evidence,report}));}
})();
