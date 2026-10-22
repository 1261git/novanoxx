'use strict';
// Offline provider + in-memory data only. Never load production auth/env or send video.
const http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {once}=require('node:events'),{DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(':memory:'),ids=Array.from({length:5},()=>crypto.randomUUID());
const [series,free,paid,freeMedia,paidMedia]=ids;
const key=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
let providerCalls=0,active=0,peak=0,blocked=false,api;
const cloud=require('../cloudflare-stream.cjs')({enabled:true,account:'f'.repeat(32),token:'SYNTHETIC_OFFLINE',origin:'http://localhost',
 signingKey:{id:'synthetic_offline_key',pem:Buffer.from(key.export({type:'pkcs8',format:'pem'})).toString('base64')},
 fetcher:async url=>{const uid=new URL(url).pathname.split('/').at(-1);assert.ok(['a'.repeat(32),'b'.repeat(32)].includes(uid));providerCalls++;
  await new Promise(r=>setTimeout(r,20));return Response.json({success:true,result:{uid,requireSignedURLs:true,readyToStream:true,allowedOrigins:['localhost']}});}
});
db.exec('CREATE TABLE creator_profiles(user_id TEXT PRIMARY KEY,display_name TEXT);');
const server=http.createServer(async(req,res)=>{active++;peak=Math.max(peak,active);res.on('finish',()=>active--);try{if(!await api.handle(req,res,new URL(req.url,'http://localhost').pathname))res.writeHead(404).end();}catch{res.writeHead(500).end();}});
// Keep the client socket pool below Windows' local listen backlog; queued starts
// are reported as batches, never as 1,000 simultaneous production connections.
const agent=new http.Agent({keepAlive:true,maxSockets:128});
async function main(){
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
 api=require('../drama-theater.cjs')({db,dir:require('node:os').tmpdir(),origin:'http://localhost',cloud,
  user:req=>req.headers['x-synthetic-user']?{id:req.headers['x-synthetic-user']}:null,isAdmin:()=>false,blocked:()=>blocked,
  json:(res,status,value)=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(value))});
 db.prepare('INSERT INTO creator_profiles VALUES(?,?)').run('synthetic_owner','Synthetic');
 db.prepare('INSERT INTO drama_series VALUES(?,?,?,?,?,?)').run(series,'synthetic_owner','{}','PUBLISHED',1,1);
 for(const [id,position] of [[free,1],[paid,3]])db.prepare('INSERT INTO drama_episodes VALUES(?,?,?,?,?,?,?,?)').run(id,series,'synthetic_owner',position,'{"priceNeon":3}','PUBLISHED',1,1);
 for(const [id,ep,uid] of [[freeMedia,free,'a'.repeat(32)],[paidMedia,paid,'b'.repeat(32)]])db.prepare('INSERT INTO drama_media VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,ep,'synthetic_owner','video','','',1,JSON.stringify({provider:'cloudflare',uid}),1,1);
 for(let i=0;i<1000;i++)db.prepare('INSERT INTO drama_entitlements VALUES(?,?,?,?,?,?)').run('synthetic_'+i,paid,'fixture_'+i,3,'ACTIVE',1);
 const request=(id,user)=>new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port,path:'/api/drama/stream/playback?id='+id,agent,headers:user?{'x-synthetic-user':user}:{}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));}).on('error',reject);});
 const start=performance.now();let replies=await Promise.all(Array.from({length:1000},()=>request(freeMedia)));assert.ok(replies.every(x=>x===200));
 const freeCalls=providerCalls;assert.equal(freeCalls,1);
 replies=await Promise.all(Array.from({length:1000},(_,i)=>request(paidMedia,'synthetic_'+i)));assert.ok(replies.every(x=>x===200));assert.equal(providerCalls,2);
 db.prepare("UPDATE drama_entitlements SET status='REVOKED' WHERE actor=?").run('synthetic_0');assert.equal(await request(paidMedia,'synthetic_0'),404);assert.equal(await request(paidMedia),404);
 db.prepare("UPDATE drama_episodes SET status='DRAFT' WHERE id=?").run(free);assert.equal(await request(freeMedia),404);
 db.prepare("UPDATE drama_episodes SET status='PUBLISHED' WHERE id=?").run(free);blocked=true;assert.equal(await request(freeMedia),404);assert.equal(providerCalls,2);
 console.log(JSON.stringify({scope:'local HTTP drama route; synthetic identity; SQLite memory; mocked provider; no video transfer',clientMaxSockets:128,freeStarts:1000,paidStarts:1000,successes:2000,providerStateCalls:2,externalTokenCalls:0,revocationDenied:true,anonymousPaidDenied:true,unpublishedDenied:true,blockedOwnerDenied:true,peakPendingServerRequests:peak,localElapsedMs:Math.round(performance.now()-start),productionPostgresOrSessionLoadTested:false,realConcurrent1000VideoPlayback:false}));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{agent.destroy();server.close(()=>db.close());});
