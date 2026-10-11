const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=(db,dir,user,json)=>{
 db.exec('CREATE TABLE IF NOT EXISTS contest_entries(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,creator TEXT NOT NULL,ext TEXT NOT NULL,size INTEGER NOT NULL,created INTEGER NOT NULL)');
 const folder=path.join(dir,'contest');fs.mkdirSync(folder,{recursive:true});
 return async(req,res,name)=>{
 if(!['/api/contest','/api/contest/media','/api/auth/contest/submit'].includes(name))return false;
 const url=new URL(req.url,'http://localhost');
 if(name==='/api/contest'&&req.method==='GET'){json(res,200,{entries:db.prepare('SELECT id,title,description,creator,ext,created FROM contest_entries ORDER BY created DESC').all()});return true;}
 if(name==='/api/contest/media'&&req.method==='GET'){
 const f=db.prepare('SELECT * FROM contest_entries WHERE id=?').get(url.searchParams.get('id'));if(!f){json(res,404,{error:'작품을 찾을 수 없어요.'});return true;}
 const headers={'Content-Type':{png:'image/png',jpg:'image/jpeg',mp4:'video/mp4',webm:'video/webm'}[f.ext],'Content-Length':f.size,'X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Cache-Control':'no-cache'};
 let start=0,end=f.size-1;if(req.headers.range){const r=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);start=r?Number(r[1]):f.size;end=r&&r[2]?Math.min(Number(r[2]),end):end;if(start>end||start>=f.size){res.writeHead(416,{'Content-Range':'bytes */'+f.size});res.end();return true;}res.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${f.size}`});}else res.writeHead(200,headers);
 fs.createReadStream(path.join(folder,f.id),{start,end}).pipe(res);return true;
 }
 if(name!=='/api/auth/contest/submit'||req.method!=='POST'){json(res,405,{error:'지원하지 않는 요청이에요.'});return true;}
 const u=user(req);if(!u){json(res,401,{error:'로그인 후 제출해주세요.'});return true;}
 if(req.headers.origin!==require('./deployment-config.cjs').base){json(res,403,{error:'요청 출처를 확인해주세요.'});return true;}
 const title=(url.searchParams.get('title')||'').trim(),description=(url.searchParams.get('description')||'').trim();if(!title||title.length>120||description.length>2000){json(res,400,{error:'제목과 설명을 확인해주세요.'});return true;}
 if(db.prepare('SELECT COUNT(*) AS n FROM contest_entries WHERE user_id=?').get(u.id).n>=20){json(res,409,{error:'계정당 최대 20개까지 제출할 수 있어요.'});return true;}
 if(db.prepare('SELECT COALESCE(SUM(size),0) AS n FROM contest_entries').get().n>500*1024*1024){json(res,413,{error:'콘테스트 저장 공간이 부족해요.'});return true;}
 const id=crypto.randomUUID(),filename=path.join(folder,id);let size=0,head=Buffer.alloc(0);const handle=await fs.promises.open(filename,'wx');
 try{for await(const c of req){size+=c.length;if(size>50*1024*1024)throw Error('size');if(head.length<32)head=Buffer.concat([head,c]).subarray(0,32);await handle.write(c);}await handle.close();const ext=head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':head[0]===255&&head[1]===216&&head[2]===255?'jpg':head.toString('ascii',4,8)==='ftyp'?'mp4':head.subarray(0,4).equals(Buffer.from([26,69,223,163]))?'webm':null;if(!ext)throw Error('type');db.prepare('INSERT INTO contest_entries VALUES(?,?,?,?,?,?,?,?)').run(id,u.id,title,description,u.name,ext,size,Date.now());json(res,200,{ok:true,id});}catch(e){await handle.close().catch(()=>{});await fs.promises.unlink(filename).catch(()=>{});json(res,400,{error:'PNG·JPG·MP4·WEBM 파일을 50MB 이하로 올려주세요.'});}return true;
 };
};
