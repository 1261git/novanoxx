'use strict';
const fs=require('node:fs'),path=require('node:path');
module.exports=({db,folder,retained,verified,clock=Date.now})=>{
 db.exec('CREATE TABLE IF NOT EXISTS creator_file_replacements(file_id TEXT PRIMARY KEY,asset_id TEXT NOT NULL,user_id TEXT NOT NULL,kind TEXT NOT NULL,replaced_by TEXT NOT NULL,created INTEGER NOT NULL,completed INTEGER,freed INTEGER NOT NULL);');
 function current(id){
  const rows=db.prepare('SELECT f.* FROM creator_files f LEFT JOIN creator_file_replacements r ON r.file_id=f.id WHERE f.asset_id=? AND r.file_id IS NULL ORDER BY f.created DESC,f.id DESC').all(id),seen=new Set();
  return rows.filter(f=>{if(seen.has(f.kind))return false;seen.add(f.kind);return true;});
 }
 function retire(file,replacement){db.prepare('INSERT OR IGNORE INTO creator_file_replacements VALUES(?,?,?,?,?,?,NULL,0)').run(file.id,file.asset_id,file.user_id,file.kind,replacement,clock());}
 function ready(file){try{const st=fs.lstatSync(path.join(folder,file.id));return st.isFile()&&!st.isSymbolicLink()&&st.size>0&&st.size===Number(file.size)&&(file.kind==='original'||verified(file));}catch{return false;}}
 // Called in the same transaction as the successful new upload. Previous bytes
 // remain untouched until the new file and its protection proof are committed.
 function replace(assetId,kind,newId){
  if(retained(assetId))throw Error('ASSET_FILES_RETAINED');
  for(const file of db.prepare('SELECT * FROM creator_files WHERE asset_id=? AND id<>?').all(assetId,newId))if(file.kind===kind||(kind==='original'&&file.kind==='detailPreview'))retire(file,newId);
 }
 function cleanup(){
  let freedBytes=0,pending=0;
  for(const job of db.prepare('SELECT * FROM creator_file_replacements WHERE completed IS NULL').all()){
   if(retained(job.asset_id)||!/^[a-f0-9-]{36}$/i.test(job.file_id)){pending++;continue;}
   // A missing replacement is never grounds to remove a previously usable file.
   let targetId=job.replaced_by,replacement;
   for(let hop=0;hop<64;hop++){replacement=db.prepare('SELECT * FROM creator_files WHERE id=? AND asset_id=?').get(targetId,job.asset_id);if(replacement&&fs.existsSync(path.join(folder,replacement.id)))break;const next=db.prepare('SELECT replaced_by FROM creator_file_replacements WHERE file_id=? AND asset_id=?').get(targetId,job.asset_id);if(!next)break;targetId=next.replaced_by;}
   if(!replacement||!ready(replacement)){pending++;continue;}
   let bytes=0;try{const target=path.join(folder,job.file_id),st=fs.lstatSync(target);if(st.isSymbolicLink()||!st.isFile())throw Error('UNSAFE_FILE');bytes=st.size;fs.unlinkSync(target);}catch(error){if(error.code!=='ENOENT'){pending++;continue;}}
   db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM public_preview_proofs WHERE file_id=?').run(job.file_id);db.prepare('DELETE FROM creator_original_fingerprints WHERE file_id=?').run(job.file_id);db.prepare('DELETE FROM creator_files WHERE id=? AND asset_id=? AND user_id=?').run(job.file_id,job.asset_id,job.user_id);db.prepare('UPDATE creator_file_replacements SET completed=?,freed=? WHERE file_id=?').run(clock(),bytes,job.file_id);db.exec('COMMIT');freedBytes+=bytes;}catch{db.exec('ROLLBACK');pending++;}
  }
  return {freedBytes,cleanupPending:pending>0};
 }
 function reconcile(){
  let retired=0;
  for(const asset of db.prepare("SELECT id FROM creator_assets WHERE status IN ('DRAFT','REVIEW','ACTIVE','PAUSED')").all()){
   if(retained(asset.id))continue;
   const all=db.prepare('SELECT f.* FROM creator_files f LEFT JOIN creator_file_replacements r ON r.file_id=f.id WHERE f.asset_id=? AND r.file_id IS NULL ORDER BY f.created DESC,f.id DESC').all(asset.id);
   for(const kind of ['original','preview','thumbnail','detailPreview']){
    const group=all.filter(f=>f.kind===kind);if(group.length<2)continue;
    const latest=group[0];if(!ready(latest))continue;
    db.exec('BEGIN IMMEDIATE');try{for(const old of group.slice(1)){retire(old,latest.id);retired++;}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
   }
  }
  return {retired,...cleanup()};
 }
 return {current,replace,cleanup,reconcile};
};
