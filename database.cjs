const path=require('node:path');
module.exports=dir=>{
 if(process.env.DATABASE_BACKEND==='postgres'){
  return new(require('./database/postgres.cjs'))({migrateSource:process.env.MIGRATE_SQLITE==='1'?path.join(dir,'accounts.sqlite'):undefined});
 }
 return new(require('node:sqlite').DatabaseSync)(path.join(dir,'accounts.sqlite'));
};
