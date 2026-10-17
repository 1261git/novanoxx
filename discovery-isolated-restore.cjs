'use strict';
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync,backup}=require('node:sqlite');
const VERSION='DISCOVERY_ACCOUNT_120_V1',MARKER='NNX_OWNED_DISCOVERY_RESTORE_V1';
function currentState(db){
 db.exec('SAVEPOINT discovery_current_state');
 try{
  const states=new Map();
  for(const row of db.prepare('SELECT actor,allowed,version FROM engine_discovery_preferences').all())states.set(row.actor,{actor:row.actor,allowed:row.allowed===1&&row.version===VERSION,version:VERSION,deletedThrough:0});
  for(const row of db.prepare('SELECT actor,deleted_through FROM engine_discovery_deletions').all()){
   const state=states.get(row.actor)||{actor:row.actor,allowed:false,version:VERSION,deletedThrough:0};state.deletedThrough=row.deleted_through;states.set(row.actor,state);
  }
  db.exec('RELEASE SAVEPOINT discovery_current_state');return [...states.values()];
 }catch(error){db.exec('ROLLBACK TO SAVEPOINT discovery_current_state');db.exec('RELEASE SAVEPOINT discovery_current_state');throw error;}
}
// Produces a new offline SQLite copy only. No service start or source mutation.
async function prepare({sourceDb,currentDb,destinationDir,now,quiescedConfirmed=false}){
 if(quiescedConfirmed!==true)throw Error('CURRENT_STATE_QUIESCENCE_REQUIRED');
 if(sourceDb===currentDb)throw Error('SEPARATE_CURRENT_DATABASE_REQUIRED');
 if(!Number.isSafeInteger(now)||now<0)throw Error('INVALID_RESTORE_TIME');
 const real=fs.realpathSync(destinationDir);
 if(fs.lstatSync(destinationDir).isSymbolicLink()||fs.readFileSync(path.join(real,'restore-owner.txt'),'utf8')!==MARKER)throw Error('OWNED_ISOLATED_RESTORE_REQUIRED');
 // Exclusive reservation prevents overwrite of any existing destination.
 const target=path.join(real,'restored.sqlite');const fd=fs.openSync(target,'wx',0o600);fs.closeSync(fd);
 let restored;
 try{
  const current=currentState(currentDb);
  await backup(sourceDb,target);
  restored=new DatabaseSync(target);
  restored.exec('CREATE TABLE IF NOT EXISTS engine_discovery_deletions(actor TEXT PRIMARY KEY,deleted_through INTEGER NOT NULL);');
  const result=require('./discovery-restore-filter.cjs').sanitize({db:restored,current,now,isolatedRestoreConfirmed:true});
  // The copy is never published or used as the running service database.
  const receipt={...result,destination:target,status:'ISOLATED_SQLITE_COPY_SANITIZED_NOT_RELEASED',sourceChanged:false,currentStateSource:'SEPARATE_CURRENT_DATABASE',requiresProductionRestoreProcedure:true};
  fs.writeFileSync(path.join(real,'restore-receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});
  return receipt;
 }catch(error){throw Object.assign(error,{restoreCopyUsable:false});}
 finally{restored?.close();}
}
module.exports={currentState,prepare,MARKER};
