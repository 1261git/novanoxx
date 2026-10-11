const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync,backup}=require('node:sqlite');
async function main(){
 const source=process.argv[2],destination=process.argv[3];
 if(!source||!destination)throw Error('Usage: node scripts/backup-sqlite.cjs SOURCE.sqlite DESTINATION.sqlite');
 if(!fs.existsSync(source))throw Error('Source does not exist');
 if(fs.existsSync(destination))throw Error('Destination already exists; refusing overwrite');
 if(path.resolve(source)===path.resolve(destination))throw Error('Source and destination must differ');
 const db=new DatabaseSync(source,{readOnly:true});
 try{await backup(db,destination);}finally{db.close();}
 const copy=new DatabaseSync(destination,{readOnly:true});
 try{const result=copy.prepare('PRAGMA integrity_check').all();if(result.some(row=>row.integrity_check!=='ok'))throw Error('Backup integrity failed');
 const counts={};for(const {name} of copy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){counts[name]=copy.prepare('SELECT count(*) n FROM "'+name.replaceAll('"','""')+'"').get().n;}
 fs.writeFileSync(destination+'.manifest.json',JSON.stringify({createdAt:new Date().toISOString(),tables:counts},null,2),{flag:'wx',mode:0o600});console.log('Backup verified. Tables: '+Object.keys(counts).length);
 }finally{copy.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
