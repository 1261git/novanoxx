'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fixtureKey={id:'c'.repeat(32),pem:Buffer.from(crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})).toString('base64')};
test('1,000 same-video starts coalesce; local signatures verify; state expiry and invalidation fail closed',async()=>{
 let time=Date.UTC(2026,9,22),calls=0,privateVideo=true,fail=false;const uid='a'.repeat(32);
 const adapter=require('./cloudflare-stream.cjs')({enabled:true,account:'b'.repeat(32),token:'SYNTHETIC',origin:'https://novanoxx.com',signingKey:fixtureKey,now:()=>time,fetcher:async url=>{
  assert.ok(url.endsWith('/'+uid),'no remote token request');calls++;await new Promise(r=>setTimeout(r,5));if(fail)throw Error('SYNTHETIC_OUTAGE');
  return Response.json({success:true,result:{uid,requireSignedURLs:privateVideo,readyToStream:true,allowedOrigins:['novanoxx.com'],playback:{hls:'https://customer-synthetic.cloudflarestream.com/'+uid+'/manifest/video.m3u8'}}});
 }});
 const start=performance.now(),values=await Promise.all(Array.from({length:1000},()=>adapter.playback(uid)));
 assert.equal(calls,1);assert.equal(new Set(values.map(v=>v.url)).size,1);
 const token=new URL(values[0].url).pathname.split('/')[1],parts=token.split('.');const claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 assert.equal(claims.sub,uid);assert.equal(claims.kid,fixtureKey.id);assert.equal(claims.downloadable,false);assert.equal(claims.exp,Math.floor(time/1000)+1800);
 assert.equal(crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),crypto.createPublicKey(Buffer.from(fixtureKey.pem,'base64')),Buffer.from(parts[2],'base64url')),true);
 await assert.rejects(adapter.playback('invalid'));assert.equal(calls,1);
 time+=299999;await adapter.playback(uid);assert.equal(calls,1);
 time+=2;await Promise.all(Array.from({length:1000},()=>adapter.playback(uid)));assert.equal(calls,2);
 privateVideo=false;await adapter.video(uid);await assert.rejects(adapter.playback(uid));assert.equal(calls,4);
 privateVideo=true;time+=2001;await adapter.playback(uid);assert.equal(calls,5);
 time+=300001;fail=true;const failures=await Promise.allSettled(Array.from({length:1000},()=>adapter.playback(uid)));assert.ok(failures.every(x=>x.status==='rejected'));assert.equal(calls,6);
 console.log('STREAM226_SAME_VIDEO '+JSON.stringify({requests:1000,metadataCalls:1,tokenApiCalls:0,localMs:Math.round(performance.now()-start)}));
});
test('1,000 different cold videos use local signing with bounded paced provider lookups',async()=>{
 let calls=0,active=0,peak=0;const adapter=require('./cloudflare-stream.cjs')({enabled:true,account:'b'.repeat(32),token:'SYNTHETIC',origin:'https://novanoxx.com',signingKey:fixtureKey,fetcher:async url=>{
  const uid=new URL(url).pathname.split('/').at(-1);assert.match(uid,/^[a-f0-9]{32}$/);calls++;peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,25));active--;
  return Response.json({success:true,result:{uid,requireSignedURLs:true,readyToStream:true,allowedOrigins:['novanoxx.com']}});
 }});
 const start=performance.now();const values=await Promise.all(Array.from({length:1000},(_,i)=>adapter.playback(i.toString(16).padStart(32,'0'))));
 assert.equal(values.length,1000);assert.equal(calls,1000);assert.ok(peak<=8);assert.equal(new Set(values.map(v=>v.url)).size,1000);
 await Promise.all(Array.from({length:1000},(_,i)=>adapter.playback(i.toString(16).padStart(32,'0'))));assert.equal(calls,1000);
 console.log('STREAM226_DIFFERENT_VIDEOS '+JSON.stringify({requests:1000,metadataCalls:1000,tokenApiCalls:0,peakLookups:peak,localMs:Math.round(performance.now()-start)}));
});
test('production signing key persists across restart; incomplete recovery file never creates duplicate keys or remote-token fallback',async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'nnx-signing-'));let creates=0,tokenCalls=0;
 const options={dir,enabled:true,account:'b'.repeat(32),token:'SYNTHETIC',origin:'https://novanoxx.com',fetcher:async(url,o={})=>{
  let result;if(url.endsWith('/keys')){assert.equal(o.method,'POST');creates++;result=fixtureKey;}
  else if(url.endsWith('/webhook'))result={notificationUrl:'https://novanoxx.com/api/drama/stream/webhook',secret:'SYNTHETIC'};
  else if(url.endsWith('/token')){tokenCalls++;throw Error('remote signing forbidden');}
  else result={uid:'a'.repeat(32),requireSignedURLs:true,readyToStream:true,allowedOrigins:['novanoxx.com']};
  return Response.json({success:true,result});
 }};
 try{let adapter=require('./cloudflare-stream.cjs')(options);await adapter.initialize();await adapter.playback('a'.repeat(32));assert.equal(creates,1);
  const file=path.join(dir,'drama-stream-signing-'+'b'.repeat(32)+'.json');assert.equal(JSON.parse(fs.readFileSync(file)).id,fixtureKey.id);if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600);
  adapter=require('./cloudflare-stream.cjs')(options);await adapter.initialize();await adapter.playback('a'.repeat(32));assert.equal(creates,1);
  fs.writeFileSync(file,'');adapter=require('./cloudflare-stream.cjs')(options);await adapter.initialize();await assert.rejects(adapter.playback('a'.repeat(32)));assert.equal(creates,1);assert.equal(tokenCalls,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Stream adapter protects upload/playback, verifies raw webhooks and keeps unknown costs unknown',async()=>{
 let limit=1000,used=0,privateVideo=true,analytics=true;const calls=[],uid='a'.repeat(32);let time=Date.UTC(2026,9,22);
 const adapter=require('./cloudflare-stream.cjs')({enabled:true,account:'b'.repeat(32),token:'SYNTHETIC',origin:'https://novanoxx.com',webhookSecret:'SYNTHETIC_SECRET',now:()=>time,fetcher:async(url,o={})=>{calls.push({url,...o});let result;if(url.endsWith('storage-usage'))result={totalStorageMinutes:used,totalStorageMinutesLimit:limit,videoCount:2};else if(url.endsWith('/token'))result={token:'synthetic.signed.token'};else if(url.endsWith('graphql'))return Response.json(analytics?{data:{viewer:{accounts:[{streamMinutesViewedAdaptiveGroups:[{sum:{minutesViewed:7000}}]}]}}}:{errors:[{message:'SYNTHETIC_PERMISSION'}]});else if(url.includes('?direct_user=true'))return new Response(null,{status:201,headers:{location:'https://upload.videodelivery.net/synthetic','stream-media-id':uid}});else result={uid,requireSignedURLs:privateVideo,readyToStream:true,allowedOrigins:['novanoxx.com']};return Response.json({success:true,result});}});
 const upload=await adapter.create({bytes:20});assert.equal(upload.uid,uid);const request=calls.find(c=>c.url.includes('?direct_user'));assert.match(request.headers['Upload-Metadata'],/requiresignedurls/);assert.equal(request.headers['Upload-Length'],'20');assert.deepEqual(JSON.parse(calls.find(c=>c.method==='POST'&&c.url.endsWith(uid)).body),{requireSignedURLs:true,allowedOrigins:['novanoxx.com']});
 const signed=await adapter.playback(uid);assert.match(signed.url,/synthetic.signed.token\/manifest\/video.m3u8$/);assert.equal(JSON.parse(calls.at(-1).body).downloadable,false);privateVideo=false;time+=300001;await assert.rejects(adapter.playback(uid));privateVideo=true;
 const body=Buffer.from('{"uid":"synthetic"}\n'),stamp=Math.floor(time/1000),signature=crypto.createHmac('sha256','SYNTHETIC_SECRET').update(stamp+'.').update(body).digest('hex');assert.equal(adapter.verify(body,`time=${stamp},sig1=${signature}`),true);assert.equal(adapter.verify(Buffer.from('{}'),`time=${stamp},sig1=${signature}`),false);assert.equal(adapter.verify(body,`time=${stamp-301},sig1=${signature}`),false);
 const usage=await adapter.usage();assert.equal(usage.estimatedTotalUsd,7);used=990;await assert.rejects(adapter.create({bytes:20}));limit=0;used=0;await assert.rejects(adapter.create({bytes:20}));
 const unknown=require('./cloudflare-stream.cjs')({enabled:true,account:'b'.repeat(32),token:'SYNTHETIC',origin:'https://novanoxx.com',fetcher:async url=>url.endsWith('graphql')?Response.json({errors:[{}]}):Response.json({success:true,result:{totalStorageMinutes:0,totalStorageMinutesLimit:1000}})});assert.equal((await unknown.usage()).estimatedTotalUsd,null);
});
test('webhook setup uses approved origin and keeps production recovery secret private',async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'nnx-stream-hook-'));let puts=0;
 try{const adapter=require('./cloudflare-stream.cjs')({enabled:true,dir,account:'b'.repeat(32),token:'SYNTHETIC',origin:'https://novanoxx.com',fetcher:async(url,o={})=>{if(url.endsWith('/keys'))return Response.json({success:true,result:fixtureKey});assert.ok(url.endsWith('/webhook'));if(o.method==='PUT'){puts++;assert.deepEqual(JSON.parse(o.body),{notificationUrl:'https://novanoxx.com/api/drama/stream/webhook'});return Response.json({success:true,result:{notificationUrl:'https://novanoxx.com/api/drama/stream/webhook',secret:'SYNTHETIC_ONLY'}});}return Response.json({success:true,result:{notificationUrl:''}});}});await adapter.initialize();assert.equal(puts,1);assert.equal(fs.readdirSync(dir).length,2);const file=path.join(dir,'drama-stream-webhook-'+'b'.repeat(32)+'.json');assert.equal(JSON.parse(fs.readFileSync(file)).secret,'SYNTHETIC_ONLY');const body=Buffer.from('{}'),time=Math.floor(Date.now()/1000),sig=crypto.createHmac('sha256','SYNTHETIC_ONLY').update(time+'.').update(body).digest('hex');assert.equal(adapter.verify(body,`time=${time},sig1=${sig}`),true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
for(const backend of ['sqlite','postgres'])test(backend+': remote upload is owner-only, readiness checked, originals retained, paid videos denied',async()=>{
 const {DatabaseSync}=require('node:sqlite'),http=require('node:http'),{once}=require('node:events');const db=backend==='sqlite'?new DatabaseSync(':memory:'):new(require('./database/postgres.cjs'))({pglite:true});let server;
 try{db.exec('CREATE TABLE creator_profiles(user_id TEXT PRIMARY KEY,display_name TEXT);');db.prepare('INSERT INTO creator_profiles VALUES(?,?)').run('owner','Owner');let publicVideo=false,ready=true,counter=0,blocked=false;const cloud={ready:()=>true,create:async()=>({uid:String(++counter).padStart(32,'0'),uploadURL:'https://upload.videodelivery.net/synthetic'}),video:async uid=>({uid,readyToStream:ready,requireSignedURLs:!publicVideo,allowedOrigins:['localhost'],duration:12,size:20}),playback:async()=>({url:'https://videodelivery.net/synthetic/manifest/video.m3u8'}),usage:async()=>({configured:true}),verify:()=>false};
 server=http.createServer((req,res)=>api.handle(req,res,new URL(req.url,'http://localhost').pathname));server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://localhost:'+server.address().port;const api=require('./drama-theater.cjs')({db,dir:require('node:os').tmpdir(),user:req=>req.headers['x-user']?{id:req.headers['x-user']}:null,json:(r,status,d)=>r.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(d)),origin,isAdmin:a=>a.id==='admin',blocked:()=>blocked,cloud});
 async function call(action,data,actor='owner'){const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/drama/'+action,{method:data===undefined?'GET':'POST',headers:{origin,...actor?{'x-user':actor}:{},'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};}
 const id=(await call('series/save',{title:'Synthetic',description:'Synthetic only',screeningRights:true})).body.id;const ep=(await call('episode/save',{seriesId:id,number:1,title:'Free'})).body.id;const paid=(await call('episode/save',{seriesId:id,number:3,title:'Paid'})).body.id;
 assert.equal((await call('stream/upload',{episodeId:ep,bytes:20},'other')).status,403);const first=await call('stream/upload',{episodeId:ep,bytes:20});assert.equal(first.status,200);assert.equal((await call('stream/upload',{episodeId:ep,bytes:20})).status,409);ready=false;assert.equal((await call('stream/status',{id:first.body.id})).body.status,'PROCESSING');assert.equal((await call('action',{id,action:'publish'})).status,400);ready=true;publicVideo=true;assert.equal((await call('stream/status',{id:first.body.id})).status,409);publicVideo=false;assert.equal((await call('stream/status',{id:first.body.id})).body.status,'READY');assert.equal((await call('stream/status',{id:first.body.id})).body.status,'READY');assert.equal(db.prepare('SELECT COUNT(*) n FROM drama_media WHERE active=1').get().n,1);
 const second=await call('stream/upload',{episodeId:ep,bytes:20});await call('stream/status',{id:second.body.id});assert.equal(db.prepare('SELECT COUNT(*) n FROM drama_media').get().n,2);assert.equal(db.prepare('SELECT active FROM drama_media WHERE id=?').get(first.body.id).active,0);
 const p=await call('stream/upload',{episodeId:paid,bytes:20});await call('stream/status',{id:p.body.id});assert.equal((await call('action',{id,action:'publish'})).status,200);
 assert.equal((await call('stream/playback?id='+second.body.id,undefined,null)).status,200);assert.equal((await call('stream/playback?id='+p.body.id,undefined,null)).status,404);assert.equal((await call('media?id='+second.body.id,undefined,null)).status,404);assert.equal((await call('stream/usage',undefined,null)).status,403);assert.equal((await call('stream/usage',undefined,'admin')).status,200);assert.equal((await call('stream/webhook',{uid:'forged'},null)).status,403);db.prepare('INSERT INTO drama_entitlements VALUES(?,?,?,?,?,?)').run('buyer',paid,'SYNTHETIC_PAID',3,'ACTIVE',Date.now());assert.equal((await call('stream/playback?id='+p.body.id,undefined,'buyer')).status,200);db.prepare("UPDATE drama_entitlements SET status='REVOKED' WHERE actor=?").run('buyer');assert.equal((await call('stream/playback?id='+p.body.id,undefined,'buyer')).status,404);blocked=true;assert.equal((await call('stream/playback?id='+second.body.id,undefined,null)).status,404);
 }finally{if(server)await new Promise(r=>server.close(r));await db.close();}
});
