'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=({db,folder,protection,usage,currentFiles})=>{
 const busy=new Set();
 async function create(actor,asset){
  if(!asset||asset.user_id!==actor||!['DRAFT','REVIEW','ACTIVE','PAUSED'].includes(asset.status))throw Error('FULL_PREVIEW_STATE');
  if(busy.has(asset.id))throw Error('PREVIEW_BUSY');
  const existing=(currentFiles?currentFiles(asset.id).filter(f=>f.kind==='detailPreview'):db.prepare("SELECT id,kind,name,size FROM creator_files WHERE asset_id=? AND kind='detailPreview' ORDER BY created DESC").all(asset.id)).find(f=>protection.verified(f));
  if(existing)return {ok:true,fileId:existing.id,alreadyProtected:true};
  const source=currentFiles?currentFiles(asset.id).find(f=>f.kind==='original'&&['mp4','mov','webm'].includes(f.ext)):db.prepare("SELECT * FROM creator_files WHERE asset_id=? AND user_id=? AND kind='original' AND ext IN ('mp4','mov','webm') ORDER BY created DESC,id DESC LIMIT 1").get(asset.id,actor);
  if(!source)throw Error('FULL_PREVIEW_SOURCE');
  const used=()=>usage?.()??Number(db.prepare('SELECT COALESCE(SUM(size),0) AS total FROM creator_files').get().total);
  if(used()+Number(source.size)*2>700*1024*1024)throw Error('PREVIEW_CAPACITY');
  const id=crypto.randomUUID(),staged=path.join(folder,id+'.mp4'),output=path.join(folder,id);let committed=false;
  busy.add(asset.id);
  try{
   const input=path.join(folder,source.id),stat=fs.lstatSync(input);if(stat.isSymbolicLink()||!stat.isFile()||stat.size!==Number(source.size))throw Error('FULL_PREVIEW_SOURCE');
   await require('./video-preview.cjs')(input,staged,0,'full',source.ext);await fs.promises.rename(staged,output);
   const bytes=fs.statSync(output).size;if(!bytes||used()+bytes>700*1024*1024)throw Error('PREVIEW_CAPACITY');
   const proof=await protection.record(id,source.id,{version:'brand-logo-full-v1',description:'full-video-with-logo'},bytes,output);
   db.exec('BEGIN IMMEDIATE');try{
    const current=db.prepare('SELECT status FROM creator_assets WHERE id=? AND user_id=?').get(asset.id,actor);if(!current||current.status==='DELETED')throw Error('FULL_PREVIEW_STATE');
    if(used()+bytes>700*1024*1024)throw Error('PREVIEW_CAPACITY');
    db.prepare('INSERT INTO creator_files VALUES(?,?,?,?,?,?,?,?)').run(id,asset.id,actor,'detailPreview',path.parse(source.name).name+'-full-protected.mp4','mp4',bytes,Date.now());protection.insert(proof);db.exec('COMMIT');committed=true;
   }catch(error){db.exec('ROLLBACK');throw error;}
   return {ok:true,fileId:id};
  }finally{busy.delete(asset.id);await fs.promises.unlink(staged).catch(()=>{});if(!committed)await fs.promises.unlink(output).catch(()=>{});}
 }
 return {create,busy};
};
