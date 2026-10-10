const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function createCreatorApi(db,dir,user,json){
 db.exec(`CREATE TABLE IF NOT EXISTS creator_assets(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,metadata TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS creator_files(id TEXT PRIMARY KEY,asset_id TEXT NOT NULL,user_id TEXT NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL,ext TEXT NOT NULL,size INTEGER NOT NULL,created INTEGER NOT NULL);`);
 const folder=path.join(dir,'uploads');fs.mkdirSync(folder,{recursive:true});
 const allowed=new Set(['png','jpg','jpeg','webp','mp4','webm','mov','mp3','wav','pdf','zip','glb','gltf','obj','fbx','pptx','docx']);
 const files=id=>db.prepare('SELECT id,kind,name,size FROM creator_files WHERE asset_id=?').all(id);
 return async(req,res,name)=>{
 if(!name.startsWith('/api/auth/creator/'))return false;
 const u=user(req);if(!u){json(res,401,{error:'로그인이 필요해요.'});return true;}
 if(!db.prepare('SELECT user_id FROM creator_profiles WHERE user_id=?').get(u.id)){json(res,403,{error:'크리에이터 프로필을 먼저 작성해주세요.'});return true;}
 const url=new URL(req.url,'http://localhost');const id=url.searchParams.get('id');const asset=id?db.prepare('SELECT * FROM creator_assets WHERE id=? AND user_id=?').get(id,u.id):null;
 const output=a=>({...JSON.parse(a.metadata),id:a.id,status:a.status,updated:a.updated,files:files(a.id)});
 if(req.method==='GET'){
 if(name.endsWith('/assets')){json(res,200,{assets:db.prepare('SELECT * FROM creator_assets WHERE user_id=? ORDER BY updated DESC').all(u.id).map(output)});return true;}
 if(name.endsWith('/file')){const f=db.prepare('SELECT * FROM creator_files WHERE id=? AND user_id=?').get(id,u.id);if(!f){json(res,404,{error:'파일을 찾을 수 없어요.'});return true;}res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':f.size,'Content-Disposition':`attachment; filename="download.${f.ext}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(path.join(folder,f.id)).pipe(res);return true;}
 json(res,404,{error:'페이지를 찾을 수 없어요.'});return true;
 }
 const deployment=require('./deployment-config.cjs');if(req.method!=='POST'||req.headers.origin!==deployment.base){json(res,403,{error:'요청 출처를 확인해주세요.'});return true;}
 if(name.endsWith('/upload')){
 if(!asset||asset.status!=='DRAFT'){json(res,409,{error:'임시저장한 작품에만 파일을 올릴 수 있어요.'});return true;}
 const kind=url.searchParams.get('kind'),filename=url.searchParams.get('name')||'',ext=path.extname(filename).slice(1).toLowerCase();
 if(!['original','preview','thumbnail'].includes(kind)||!allowed.has(ext)||filename.length>200||/[\r\n\x00]/.test(filename)||(kind==='thumbnail'&&!['png','jpg','jpeg','webp'].includes(ext))||(kind==='preview'&&!['png','jpg','jpeg','webp','mp4','webm','mp3','wav','pdf'].includes(ext))){json(res,400,{error:'지원되는 파일 형식과 파일명을 확인해주세요.'});return true;}
 const fileId=crypto.randomUUID(),file=path.join(folder,fileId);let size=0;const handle=await fs.promises.open(file,'wx');
 try{const used=db.prepare('SELECT COALESCE(SUM(size),0) AS total FROM creator_files').get().total;for await(const chunk of req){size+=chunk.length;if(size>100*1024*1024||used+size>700*1024*1024)throw Error('LIMIT');await handle.write(chunk);}if(!size)throw Error('EMPTY');await handle.close();db.prepare('INSERT INTO creator_files VALUES(?,?,?,?,?,?,?,?)').run(fileId,id,u.id,kind,filename,ext,size,Date.now());json(res,200,{file:{id:fileId,kind,name:filename,size}});}catch{await handle.close().catch(()=>{});await fs.promises.unlink(file).catch(()=>{});json(res,413,{error:'파일은 100MB 이하로 올려주세요. 저장 공간이 부족하면 관리자에게 문의해주세요.'});}return true;
 }
 if(req.headers['content-type']?.split(';')[0]!=='application/json'){json(res,415,{error:'잘못된 요청 형식이에요.'});return true;}
 let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>16384){json(res,413,{error:'입력 내용이 너무 길어요.'});return true;}chunks.push(c);}let d;try{d=JSON.parse(Buffer.concat(chunks))}catch{json(res,400,{error:'입력 내용을 확인해주세요.'});return true;}
 if(name.endsWith('/save')){
 if(id&&(!asset||asset.status!=='DRAFT')){json(res,409,{error:'편집할 수 없는 작품이에요.'});return true;}
 const str=(key,max)=>typeof d[key]==='string'?d[key].trim().slice(0,max):'';
 const metadata={title:str('title',120),description:str('description',2000),category:str('category',20),tags:str('tags',200),deliverables:str('deliverables',1000),tools:str('tools',500),contribution:str('contribution',1000),brandFit:Boolean(d.brandFit),productFit:Boolean(d.productFit),creativeFit:Boolean(d.creativeFit),price:Number(d.price),extraPrice:Number(d.extraPrice)||0,days:Number(d.days)||0};
 if(!metadata.title||!['VIDEO','2D','3D','AUDIO','DOCUMENTS'].includes(metadata.category)||!Number.isSafeInteger(metadata.price)||metadata.price<1||metadata.price>1000000||!Number.isSafeInteger(metadata.extraPrice)||metadata.extraPrice<0||!Number.isSafeInteger(metadata.days)||metadata.days<0){json(res,400,{error:'제목, 카테고리, 가격과 작업일을 확인해주세요.'});return true;}
 const assetId=id||crypto.randomUUID(),now=Date.now();db.prepare('INSERT INTO creator_assets VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata,updated=excluded.updated').run(assetId,u.id,JSON.stringify(metadata),'DRAFT',now,now);json(res,200,{id:assetId});return true;
 }
 if(name.endsWith('/submit')){if(!asset||asset.status!=='DRAFT'){json(res,409,{error:'임시저장한 작품을 선택해주세요.'});return true;}const m=JSON.parse(asset.metadata),f=files(id);if(!/[A-Za-z]/.test(m.title)||!/[A-Za-z]/.test(m.description)||!m.deliverables||!f.some(v=>v.kind==='original')||!f.some(v=>v.kind==='preview')){json(res,400,{error:'영문 제목·설명, 납품 항목, 원본 파일과 미리보기 파일을 준비해주세요.'});return true;}db.prepare('UPDATE creator_assets SET status=?,updated=? WHERE id=?').run('REVIEW',Date.now(),id);json(res,200,{ok:true});return true;}
 json(res,404,{error:'지원하지 않는 요청이에요.'});return true;
 };
};
