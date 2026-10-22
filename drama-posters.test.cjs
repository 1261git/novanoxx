'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),cp=require('node:child_process'),{once}=require('node:events');
const {imageInfo}=require('./drama-posters.cjs');
test('poster headers reject SVG, oversized dimensions and incomplete images before decoding',()=>{
 assert.throws(()=>imageInfo(Buffer.from('<svg></svg>')));assert.throws(()=>imageInfo(Buffer.alloc(0)));
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(9000,16);png.writeUInt32BE(9000,20);assert.throws(()=>imageInfo(png));
});
for(const backend of ['sqlite','postgres'])test(backend+': posters use protected thumbnails and preserve old originals on replacement and failure',async()=>{
 const {DatabaseSync}=require('node:sqlite'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'nnx-poster-')),db=backend==='sqlite'?new DatabaseSync(':memory:'):new(require('./database/postgres.cjs'))({pglite:true});let server;
 try{
  db.exec('CREATE TABLE creator_profiles(user_id TEXT PRIMARY KEY,display_name TEXT);');for(const id of ['owner','other'])db.prepare('INSERT INTO creator_profiles VALUES(?,?)').run(id,id);
  const id=crypto.randomUUID(),ep=crypto.randomUUID();server=http.createServer(async(req,res)=>{if(!await api.handle(req,res,new URL(req.url,'http://localhost').pathname))res.writeHead(404).end();});server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  const api=require('./drama-theater.cjs')({db,dir,origin,user:req=>req.headers['x-synthetic-user']?{id:req.headers['x-synthetic-user']}:null,isAdmin:a=>a.id==='admin',json:(res,status,value)=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(value))});
  db.prepare('INSERT INTO drama_series VALUES(?,?,?,?,?,?)').run(id,'owner','{"title":"Poster fixture","description":"Synthetic","genre":"Legacy"}','DRAFT',1,1);
  db.prepare('INSERT INTO drama_episodes VALUES(?,?,?,?,?,?,?,?)').run(ep,id,'owner',1,'{"title":"Free"}','PUBLISHED',1,1);
  const files={};for(const extension of ['png','jpg','webp']){const file=path.join(dir,'source.'+extension);cp.execFileSync('ffmpeg',['-nostdin','-y','-v','error','-f','lavfi','-i','color=c=blue:s=1200x1800','-frames:v','1','-threads','1',file],{windowsHide:true});files[extension]=fs.readFileSync(file);assert.equal(imageInfo(files[extension]).extension,extension);}
  const upload=async(bytes,actor='owner',extra={})=>{const r=await fetch(origin+'/api/drama/poster?seriesId='+id,{method:'POST',headers:{origin,'Content-Type':'application/octet-stream',...(actor?{'x-synthetic-user':actor}:{}),...extra},body:bytes});return {status:r.status,body:await r.json()};};
  assert.equal((await upload(files.png,null)).status,401);assert.equal((await upload(files.png,'other')).status,403);assert.equal((await upload(files.png,'owner',{origin:'https://wrong.invalid'})).status,403);
  const first=await upload(files.png);assert.equal(first.status,200);const firstId=new URL(first.body.poster,origin).searchParams.get('id'),firstOriginal=path.join(dir,'drama-posters',firstId+'.original');assert.deepEqual(fs.readFileSync(firstOriginal),files.png);
  assert.equal((await fetch(origin+first.body.poster)).status,404);const ownerImage=await fetch(origin+first.body.poster,{headers:{'x-synthetic-user':'owner'}});assert.equal(ownerImage.status,200);assert.equal(ownerImage.headers.get('content-type'),'image/jpeg');assert.match(ownerImage.headers.get('x-novanoxx-preview'),/image-baked/);const dimensions=require('./public-image-preview.cjs').dimensions(Buffer.from(await ownerImage.arrayBuffer()));assert.ok(dimensions.width<=960&&dimensions.height<=960);
  db.prepare("UPDATE drama_series SET status='PUBLISHED' WHERE id=?").run(id);assert.equal((await fetch(origin+first.body.poster)).status,200);assert.equal((await upload(files.jpg)).status,409);
  const catalog=await(await fetch(origin+'/api/drama/catalog')).json();assert.equal(catalog.series[0].poster,first.body.poster);
  db.prepare("UPDATE drama_series SET status='DRAFT' WHERE id=?").run(id);
  const second=await upload(files.jpg);assert.equal(second.status,200);assert.deepEqual(fs.readFileSync(firstOriginal),files.png);assert.equal((await fetch(origin+first.body.poster,{headers:{'x-synthetic-user':'owner'}})).status,404);
  const third=await upload(files.webp);assert.equal(third.status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM drama_posters').get().n,3);assert.equal(db.prepare('SELECT COUNT(*) n FROM drama_posters WHERE active=1').get().n,1);
  const count=fs.readdirSync(path.join(dir,'drama-posters')).length;assert.equal((await upload(Buffer.from('<svg></svg>'))).status,400);assert.equal((await upload(files.png.subarray(0,24))).status,400);assert.equal((await upload(Buffer.alloc(5*1024*1024+1))).status,413);assert.equal(fs.readdirSync(path.join(dir,'drama-posters')).length,count);assert.equal(db.prepare('SELECT COUNT(*) n FROM drama_posters WHERE active=1').get().n,1);assert.equal(JSON.parse(db.prepare('SELECT body FROM drama_series WHERE id=?').get(id).body).genre,'Legacy');
 }finally{if(server)await new Promise(r=>server.close(r));await db.close();if(path.dirname(path.resolve(dir))===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('nnx-poster-'))fs.rmSync(dir,{recursive:true,force:true});}
});
