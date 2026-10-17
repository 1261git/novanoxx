'use strict';
const VERSION='DISCOVERY_ACCOUNT_120_V1',DAY=86400000;
// Only a disconnected restored database may be supplied. The caller must obtain
// current preferences/deletion cutoffs from outside the historical backup.
function sanitize({db,current,now,isolatedRestoreConfirmed=false}){
 if(isolatedRestoreConfirmed!==true||!Number.isSafeInteger(now)||now<0||!Array.isArray(current))throw Error('ISOLATED_RESTORE_CURRENT_STATE_REQUIRED');
 const states=new Map();
 for(const row of current){
  if(!row||typeof row.actor!=='string'||!row.actor||states.has(row.actor)||typeof row.allowed!=='boolean'||row.version!==VERSION||!Number.isSafeInteger(row.deletedThrough)||row.deletedThrough<0||row.deletedThrough>now)throw Error('INVALID_CURRENT_DISCOVERY_STATE');
  states.set(row.actor,row);
 }
 let removed=0,retained=0;
 db.exec('SAVEPOINT discovery_restore_filter');
 try{
  for(const row of db.prepare('SELECT actor,id,created FROM engine_discovery_events').all()){
   const state=states.get(row.actor);
   if(!state?.allowed||!Number.isSafeInteger(row.created)||row.created>now||row.created<=now-120*DAY||row.created<=state.deletedThrough){
    db.prepare('DELETE FROM engine_requests WHERE actor=? AND id=?').run(row.actor,row.id);
    db.prepare('DELETE FROM engine_discovery_events WHERE actor=? AND id=?').run(row.actor,row.id);removed++;
   }else retained++;
  }
  // Historical consent never grants collection after restore.
  db.prepare('UPDATE engine_discovery_preferences SET allowed=0').run();
  for(const row of current){
   const previous=db.prepare('SELECT deleted_through FROM engine_discovery_deletions WHERE actor=?').get(row.actor);
   db.prepare('INSERT INTO engine_discovery_deletions VALUES(?,?) ON CONFLICT(actor) DO UPDATE SET deleted_through=excluded.deleted_through').run(row.actor,Math.max(row.deletedThrough,previous?.deleted_through||0));
  }
  db.exec('RELEASE SAVEPOINT discovery_restore_filter');
 }catch(error){db.exec('ROLLBACK TO SAVEPOINT discovery_restore_filter');db.exec('RELEASE SAVEPOINT discovery_restore_filter');throw error;}
 return {removed,retained,collectionEnabled:false,productionRestoreApproved:false,existingBackupFilesChanged:false};
}
module.exports={sanitize};
