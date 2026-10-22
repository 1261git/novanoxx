'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const {once}=require('node:events'),{DatabaseSync}=require('node:sqlite');
for(const backend of ['sqlite','postgres'])test(backend+': creator drama lifecycle preserves assets, validates media and controls publication',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nnx-drama-')),db=backend==='sqlite'?new DatabaseSync(':memory:'):new(require('./database/postgres.cjs'))({pglite:true});let server;
 try{
  db.exec('CREATE TABLE creator_profiles(user_id TEXT PRIMARY KEY,display_name TEXT);CREATE TABLE existing_assets(id TEXT PRIMARY KEY,body TEXT);');db.prepare('INSERT INTO existing_assets VALUES(?,?)').run('preserved','UNCHANGED');for(const id of ['owner','other'])db.prepare('INSERT INTO creator_profiles VALUES(?,?)').run(id,id);
  const movie=path.join(dir,'fixture.mp4');cp.execFileSync(process.env.NNX_TEST_FFMPEG||'ffmpeg',['-nostdin','-y','-v','error','-f','lavfi','-i','color=c=black:s=160x100:d=2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',movie],{windowsHide:true});const movieBytes=fs.readFileSync(movie),blocked=new Set();
  server=http.createServer(async(req,res)=>{const handled=await api.handle(req,res,new URL(req.url,'http://localhost').pathname);if(!handled)res.writeHead(404).end();});server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  const options={db,dir,user:req=>req.headers['x-test-user']?{id:req.headers['x-test-user']}:null,json:(res,status,body)=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(body)),origin,isAdmin:a=>a.id==='admin',blocked:id=>blocked.has(id),uploadsEnabled:true};let api=require('./drama-theater.cjs')(options);
  async function call(action,data,actor='owner',extra={}){const r=await fetch(origin+'/api/drama/'+action,{method:data===undefined?'GET':'POST',headers:{origin,...(actor?{'x-test-user':actor}:{}),...(data===undefined?{}:{'Content-Type':Buffer.isBuffer(data)?'application/octet-stream':'application/json'}),...extra},body:data===undefined?undefined:Buffer.isBuffer(data)?data:JSON.stringify(data)});return {status:r.status,body:r.headers.get('content-type')?.startsWith('application/json')?await r.json():Buffer.from(await r.arrayBuffer()),headers:r.headers};}
  assert.equal((await call('studio',undefined,null)).status,401);
  const s=await call('series/save',{title:'Synthetic drama',description:'A fictional series',genre:'SF',rightsNote:'Synthetic video',screeningRights:true});assert.equal(s.status,200);const id=s.body.id;
  const legacyBody=db.prepare('SELECT body FROM drama_series WHERE id=?').get(id).body;
  assert.equal((await call('series/save',{id,title:'Synthetic drama',description:'A fictional series',category:'film',subcategory:'modern',screeningRights:true})).status,400);assert.equal(db.prepare('SELECT body FROM drama_series WHERE id=?').get(id).body,legacyBody);
  assert.equal((await call('series/save',{id,title:'Synthetic drama',description:'A fictional series',category:'drama',subcategory:'romance-fantasy',rightsNote:'Synthetic video',screeningRights:true})).status,200);
  assert.equal((await call('series/save',{id,title:'Synthetic drama',description:'A fictional series',rightsNote:'Synthetic video',screeningRights:true})).status,200);
  const savedCategory=JSON.parse(db.prepare('SELECT body FROM drama_series WHERE id=?').get(id).body);assert.equal(savedCategory.category,'drama');assert.equal(savedCategory.subcategory,'romance-fantasy');assert.equal(savedCategory.genre,'SF');

  const e=await call('episode/save',{seriesId:id,number:1,title:'Episode 1',description:'Synthetic'});assert.equal(e.status,200);const ep=e.body.id;
  assert.equal((await call('episode/save',{seriesId:id,number:1,title:'Duplicate',description:''})).status,409);
  assert.equal((await call('episode/save',{seriesId:id,number:1.5,title:'Decimal',description:''})).status,400);
  assert.equal((await call('episode/save',{seriesId:id,number:2,title:'Intruder',description:''},'other')).status,409);
  assert.equal((await call('series?id='+id,undefined,'other')).status,404);
  assert.equal((await call('action',{id,action:'publish'})).status,400);
  assert.equal((await call('upload?episodeId='+ep+'&kind=video',Buffer.from('not MP4'))).status,400);
  const video=await call('upload?episodeId='+ep+'&kind=video',movieBytes);assert.equal(video.status,200);assert.equal(video.body.duration,2);
  const vtt=Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.500\nHello drama\n');assert.equal((await call('upload?episodeId='+ep+'&kind=caption&language=ko',vtt)).status,200);
  assert.equal((await call('upload?episodeId='+ep+'&kind=caption&language=en',Buffer.from('WEBVTT\n\nSTYLE\nscript'))).status,400);
  assert.equal((await call('media?id='+video.body.id,undefined,null)).status,404);
  const paidEpisode=await call('episode/save',{seriesId:id,number:3,title:'Paid episode',description:'Paywall',priceNeon:3});assert.equal(paidEpisode.status,200);const paidId=paidEpisode.body.id;const paidMedia=await call('upload?episodeId='+paidId+'&kind=video',movieBytes);assert.equal(paidMedia.status,200);
  assert.equal((await call('episode/save',{seriesId:id,number:4,title:'Zero price',description:'',priceNeon:0})).status,400);
  assert.equal((await call('action',{id,action:'publish'})).status,200);
  assert.equal((await call('series/save',{id,title:'Blocked edit',description:'No'})).status,409);
  assert.equal((await call('action',{id,action:'approve'},'other')).status,409);
  assert.equal((await call('action',{id,action:'approve'},'admin')).status,409);
  const catalog=await call('catalog',undefined,null);assert.equal(catalog.body.series.length,1);assert(!JSON.stringify(catalog.body).includes('user_id'));
  const detail=await call('series?id='+id,undefined,null);assert.equal(detail.body.series.episodes.length,2);assert.equal(detail.body.series.episodes[0].priceNeon,0);assert.equal(detail.body.series.episodes[1].priceNeon,3);assert.equal(detail.body.series.episodes[1].locked,true);assert.equal(detail.body.series.episodes[1].video,null);assert.equal(detail.body.series.episodes[1].tracks.length,0);assert.equal(detail.body.series.episodes[0].tracks.length,1);
  const range=await call('media?id='+video.body.id,undefined,null,{range:'bytes=0-1'});assert.equal(range.status,206);assert.deepEqual(range.body,movieBytes.subarray(0,2));assert.equal(range.headers.get('content-range'),`bytes 0-1/${movieBytes.length}`);
  const suffix=await call('media?id='+video.body.id,undefined,null,{range:'bytes=-2'});assert.deepEqual(suffix.body,movieBytes.subarray(-2));assert.equal((await call('media?id='+video.body.id,undefined,null,{range:'bytes=999999999-'})).status,416);
  const captionUrl=detail.body.series.episodes[0].tracks[0].url;const captionResponse=await call(captionUrl.split('/api/drama/')[1],undefined,null);assert.equal(captionResponse.headers.get('content-type'),'text/vtt; charset=utf-8');assert.deepEqual(captionResponse.body,vtt);
  assert.equal((await call('media?id='+paidMedia.body.id,undefined,null)).status,404);assert.equal((await call('media?id='+paidMedia.body.id,undefined,'viewer')).status,404);
  const purchase={episodeId:paidId,expectedPrice:3,requestId:require('node:crypto').randomUUID()};assert.equal((await call('purchase',purchase,'viewer')).status,409);assert.equal(db.prepare('SELECT count(*) n FROM drama_entitlements').get().n,0);
  let charges=0,uncertain=true;const receipts=new Map(),adapter={ready:()=>true,async purchase(i){if(!receipts.has(i.idempotencyKey)){charges++;receipts.set(i.idempotencyKey,{kind:'VERIFIED_NEON_CHARGE',actor:i.actor,episodeId:i.episodeId,priceNeon:i.priceNeon,transactionId:'SYNTHETIC_'+i.idempotencyKey});if(i.actor==='viewer2'&&uncertain){uncertain=false;throw Error('SYNTHETIC_TIMEOUT');}}return receipts.get(i.idempotencyKey);}};api=require('./drama-theater.cjs')({...options,neon:adapter});
  assert.equal((await call('purchase',{...purchase,expectedPrice:1},'viewer')).status,409);assert.equal(charges,0);
  assert.equal((await call('purchase',purchase,'viewer')).status,200);assert.equal(charges,1);assert.equal((await call('purchase',{...purchase,requestId:require('node:crypto').randomUUID()},'viewer')).status,200);assert.equal(charges,1);
  assert.equal((await call('media?id='+paidMedia.body.id,undefined,'viewer')).status,200);assert.equal((await call('series?id='+id,undefined,'viewer')).body.series.episodes[1].purchased,true);
  const retry={...purchase,requestId:require('node:crypto').randomUUID()};assert.equal((await call('purchase',retry,'viewer2')).status,409);assert.equal((await call('media?id='+paidMedia.body.id,undefined,'viewer2')).status,404);assert.equal((await call('purchase',retry,'viewer2')).status,200);assert.equal(charges,2);
  api=require('./drama-theater.cjs')({...options,neon:{ready:()=>true,purchase:async()=>({kind:'TEST_WALLET'})}});assert.equal((await call('purchase',{...purchase,requestId:require('node:crypto').randomUUID()},'viewer3')).status,409);assert.equal((await call('media?id='+paidMedia.body.id,undefined,'viewer3')).status,404);
  const next=await call('episode/save',{seriesId:id,number:4,title:'Next episode',description:'',priceNeon:3});assert.equal(next.status,200);assert.equal((await call('catalog',undefined,null)).body.series[0].episodeCount,2);assert.equal((await call('upload?episodeId='+next.body.id+'&kind=video',movieBytes)).status,200);assert.equal((await call('action',{id,episodeId:next.body.id,action:'publishEpisode'})).status,200);assert.equal((await call('catalog',undefined,null)).body.series[0].episodeCount,3);assert.equal((await call('action',{id,episodeId:next.body.id,action:'unpublishEpisode'})).status,200);
  blocked.add('owner');assert.equal((await call('catalog',undefined,null)).body.series.length,0);assert.equal((await call('media?id='+video.body.id,undefined,null)).status,404);blocked.clear();
  assert.equal((await call('action',{id,action:'unpublish'})).status,200);assert.equal((await call('catalog',undefined,null)).body.series.length,0);assert.equal((await call('media?id='+video.body.id,undefined,null)).status,404);
  api=require('./drama-theater.cjs')({...options,uploadsEnabled:false});assert.equal((await call('upload?episodeId='+ep+'&kind=video',movieBytes)).status,409);assert.equal((await call('studio')).body.uploadsEnabled,false);
  assert.equal((await call('series/save',{title:'Wrong origin',description:'No'},'owner',{origin:'https://wrong.invalid'})).status,403);
  assert.equal(db.prepare('SELECT body FROM existing_assets WHERE id=?').get('preserved').body,'UNCHANGED');assert.deepEqual(fs.readFileSync(path.join(dir,'drama-media',video.body.id)),movieBytes);
  assert.equal(db.prepare('SELECT count(*) n FROM drama_reviews').get().n,4);
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('device-only resume expires, stays scoped and tolerates unavailable storage',()=>{
 const {create}=require('./assets/drama-progress.js'),values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};let now=1000000000000;const owner=create(storage,'owner',()=>now),other=create(storage,'other',()=>now);owner.put('s','e',120,600);assert.equal(owner.get('e').position,120);owner.put('s','e2',20,600);assert.equal(owner.latest('s').episode,'e2');assert.equal(other.get('e'),undefined);owner.put('s','e',600,600);assert.equal(owner.get('e'),undefined);owner.put('s','e',120,600);now+=31*86400000;assert.equal(owner.get('e'),undefined);owner.put('s','e',1,10);owner.clear();assert.equal(owner.get('e'),undefined);const denied=create({getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}},'x');assert.equal(denied.get('e'),undefined);denied.put('s','e',1,10);denied.clear();
});
