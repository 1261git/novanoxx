const path=require('node:path');
module.exports=dir=>{
 if(process.env.DATABASE_BACKEND==='postgres'){
  if(process.env.NNX_LOCAL_ENGINE_TEST==='1')return new(require('./database/postgres.cjs'))(require('./engine-postgres-test-config.cjs')({dir}));
  return new(require('./database/postgres.cjs'))({migrateSource:process.env.MIGRATE_SQLITE==='1'?path.join(dir,'accounts.sqlite'):undefined});
 }
 return new(require('node:sqlite').DatabaseSync)(path.join(dir,'accounts.sqlite'));
};
