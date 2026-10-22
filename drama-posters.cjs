'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const preview=require('./public-image-preview.cjs'),UUID=/^[a-f0-9-]{36}$/i;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function imageInfo(b){
 let width,height,extension;
 if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.toString('ascii',12,16)==='IHDR'){extension='png';width=b.readUInt32BE(16);height=b.readUInt32BE(20);}
 else if(b.length>=12&&b[0]===255&&b[1]===216){extension='jpg';let i=2;while(i+4<b.length){if(b[i++]!==255)continue;const marker=b[i++];if(marker===218||marker===217)break;if(marker===255||marker===0||marker>=208&&marker<=215)continue;const n=b.readUInt16BE(i);if(n<2||i+n>b.length)break;if([192,193,194].includes(marker)&&n>=8){height=b.readUInt16BE(i+3);width=b.readUInt16BE(i+5);break;}i+=n;}}
 else if(b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
  extension='webp';const kind=b.toString('ascii',12,16);
  if(kind==='VP8X'){width=b.readUIntLE(24,3)+1;height=b.readUIntLE(27,3)+1;}
  else if(kind==='VP8L'&&b[20]===47){const bits=b.readUInt32LE(21);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
  else if(kind==='VP8 '&&b[23]===157&&b[24]===1&&b[25]===42){width=b.readUInt16LE(26)&16383;height=b.readUInt16LE(28)&16383;}
 }
 if(!width||!height||width>8192||height>8192||width*height>16000000)fail('포스터는 1,600만 화소 이하의 JPG·PNG·WebP 이미지로 올려주세요.');
 return {extension,width,height};
}
module.exports=function({db,dir}){
 db.exec('CREATE TABLE IF NOT EXISTS drama_posters(id TEXT PRIMARY KEY,series_id TEXT NOT NULL,user_id TEXT NOT NULL,source_type TEXT NOT NULL,source_bytes BIGINT NOT NULL,preview_bytes BIGINT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,active INTEGER NOT NULL,created BIGINT NOT NULL);CREATE INDEX IF NOT EXISTS drama_posters_series_active ON drama_posters(series_id,active);');
 const folder=path.join(dir,'drama-posters'),limit=5*1024*1024,totalLimit=256*1024*1024;let busy=false;
 const current=seriesId=>db.prepare('SELECT * FROM drama_posters WHERE series_id=? AND active=1 ORDER BY created DESC,id DESC LIMIT 1').get(seriesId);
 const byId=id=>UUID.test(id||'')?db.prepare('SELECT * FROM drama_posters WHERE id=? AND active=1').get(id):null;
 function diskBytes(root=folder){return fs.readdirSync(root).reduce((n,name)=>{const file=path.join(root,name),s=fs.lstatSync(file);if(s.isSymbolicLink()||!s.isFile()&&!s.isDirectory())fail('포스터 저장 공간을 확인해주세요.',409);return n+(s.isDirectory()?diskBytes(file):s.size);},0);}
 async function save(req,series,stillEditable){
  if(busy)fail('다른 이미지 처리 중입니다. 잠시 후 다시 시도해주세요.',409);
  if(Number(req.headers['content-length'])>limit)fail('포스터는 5MB 이하로 올려주세요.',413);
  busy=true;const id=crypto.randomUUID(),original=path.join(folder,id+'.original'),image=path.join(folder,id+'.jpg');let committed=false;
  try{
   fs.mkdirSync(folder,{recursive:true,mode:0o700});if(fs.lstatSync(folder).isSymbolicLink())fail('포스터 저장 공간을 확인해주세요.',409);
   const space=fs.statfsSync(folder),before=diskBytes();if(before+limit+1024*1024>totalLimit||Number(space.bavail)*Number(space.bsize)<524*1024*1024)fail('포스터 저장 공간을 확인해주세요.',409);
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)fail('포스터는 5MB 이하로 올려주세요.',413);chunks.push(chunk);}const bytes=Buffer.concat(chunks),info=imageInfo(bytes);
   fs.writeFileSync(original,bytes,{flag:'wx',mode:0o600});
   try{await preview.convert(original,image,info.extension);}catch{fail('포스터 이미지를 처리하지 못했습니다. 다른 파일로 다시 시도해주세요.');}
   fs.chmodSync(image,0o600);const stat=fs.statSync(image),dimensions=preview.dimensions(fs.readFileSync(image));
   if(before+size+stat.size>totalLimit)fail('포스터 저장 공간을 확인해주세요.',409);
   if(!stillEditable())fail('편집 가능한 작품을 선택해주세요.',409);
   db.exec('BEGIN IMMEDIATE');try{
    db.prepare('UPDATE drama_posters SET active=0 WHERE series_id=? AND active=1').run(series.id);
    db.prepare('INSERT INTO drama_posters VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,series.id,series.user_id,info.extension,size,stat.size,dimensions.width,dimensions.height,1,Date.now());
    db.exec('COMMIT');committed=true;
   }catch(error){db.exec('ROLLBACK');throw error;}
   return {ok:true,poster:'/api/drama/poster?id='+id};
  }finally{if(!committed)for(const file of [original,image])await fs.promises.unlink(file).catch(()=>{});busy=false;}
 }
 function serve(req,res,row){const file=path.join(folder,row.id+'.jpg');let stat;try{stat=fs.lstatSync(file);}catch{return res.writeHead(404).end();}if(stat.isSymbolicLink()||!stat.isFile()||stat.size!==Number(row.preview_bytes))return res.writeHead(404).end();res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':stat.size,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-NovaNoxX-Preview':preview.VERSION});if(req.method==='HEAD')res.end();else{const input=fs.createReadStream(file);input.on('error',()=>res.destroy());res.on('close',()=>input.destroy());input.pipe(res);}}
 return {current,byId,save,serve};
};
module.exports.imageInfo=imageInfo;
