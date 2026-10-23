'use strict';
const fs=require('node:fs'),path=require('node:path');
module.exports=({db,folder,clock=Date.now})=>{
 db.exec('CREATE TABLE IF NOT EXISTS creator_asset_deletions(asset_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,files TEXT NOT NULL,freed INTEGER NOT NULL,created INTEGER NOT NULL,completed INTEGER);');
 const exists=table=>table.includes('.')?db.backend==='postgres'&&!!db.prepare("SELECT to_regclass(?) AS relation").get(table)?.relation:!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='"+table+"'").get();
 function retained(id){
  for(const table of ['engine_orders','original_entitlements','orders','checkout_locks','nnx_operating_v1.orders'])if(exists(table)&&db.prepare('SELECT asset_id FROM '+table+' WHERE asset_id=? LIMIT 1').get(id))return true;
  const link=db.prepare('SELECT public_id FROM catalog_links WHERE asset_id=?').get(id);
  if(link&&exists('neon_test_orders')&&db.prepare('SELECT id FROM neon_test_orders WHERE asset_id=? LIMIT 1').get(Number(link.public_id)+1000))return true;
  for(const [table,column]of [['engine_files','source_id'],['delivery_entitlements','file_id'],['nnx_operating_v1.files','source_file_id']])if(exists(table)&&db.prepare('SELECT '+column+' FROM '+table+' WHERE '+column+' IN (SELECT id FROM creator_files WHERE asset_id=?) LIMIT 1').get(id))return true;
  return false;
 }
 function cleanup(job){
  let freed=Number(job.freed),pending=[];
  for(const file of JSON.parse(job.files)){
   if(!/^[a-f0-9-]{36}$/i.test(file.id)){pending.push(file);continue;}
   const target=path.join(folder,file.id);
   try{const st=fs.lstatSync(target);if(st.isSymbolicLink()||!st.isFile())throw Error('UNSAFE_FILE');fs.unlinkSync(target);freed+=st.size;}catch(error){if(error.code!=='ENOENT'){pending.push(file);continue;}}
   // Metadata remains until the corresponding file is physically gone.
   db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM public_preview_proofs WHERE file_id=?').run(file.id);db.prepare('DELETE FROM creator_original_fingerprints WHERE file_id=?').run(file.id);db.prepare('DELETE FROM creator_files WHERE id=? AND asset_id=? AND user_id=?').run(file.id,job.asset_id,job.user_id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');pending.push(file);}
  }
  db.prepare('UPDATE creator_asset_deletions SET files=?,freed=?,completed=? WHERE asset_id=?').run(JSON.stringify(pending),freed,pending.length?null:clock(),job.asset_id);
  return {ok:true,freedBytes:freed,cleanupPending:pending.length>0};
 }
 function remove(actor,id,input){
  if(input?.confirm!==true)throw Error('DELETE_CONFIRMATION_REQUIRED');
  let job;
  db.exec('BEGIN IMMEDIATE');try{
   const asset=db.prepare('SELECT * FROM creator_assets WHERE id=? AND user_id=?').get(id,actor);
   if(!asset)throw Error('ASSET_NOT_FOUND');
   job=db.prepare('SELECT * FROM creator_asset_deletions WHERE asset_id=? AND user_id=?').get(id,actor);
   if(!job){
    if(!['DRAFT','PAUSED'].includes(asset.status))throw Error('ASSET_DELETE_STATE');
    if(retained(id))throw Error('ASSET_DELETE_RETAINED');
    const files=db.prepare('SELECT id,name,size FROM creator_files WHERE asset_id=? AND user_id=?').all(id,actor);
    job={asset_id:id,user_id:actor,files:JSON.stringify(files),freed:0};
    db.prepare('INSERT INTO creator_asset_deletions VALUES(?,?,?,?,?,NULL)').run(id,actor,job.files,0,clock());
    db.prepare("UPDATE creator_assets SET status='PAUSED',updated=? WHERE id=? AND user_id=? AND status IN ('DRAFT','PAUSED')").run(clock(),id,actor);
   }
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return cleanup(job);
 }
 return {remove};
};
