'use strict';
const fs=require('node:fs'),path=require('node:path');
const marker='NNX_ISOLATED_REVIEW_V1',testHost='dpg-db6esfivcj2c73fu4re0-a';
function config(env=process.env){
 if(env.NNX_REVIEW_MODE!=='1'||env.NNX_LOCAL_ENGINE_TEST==='1'||env.MIGRATE_SQLITE==='1'||env.TOSS_SECRET_KEY||env.TOSS_CLIENT_KEY||env.NNX_MAIL_ENABLED==='1'||env.NNX_BACKUP_AUTOMATION==='1'||!env.DATA_DIR)throw Error('ISOLATED_REVIEW_CONFIGURATION_REQUIRED');
 let base;try{base=new URL(env.PUBLIC_BASE_URL);}catch{throw Error('REVIEW_ORIGIN_REQUIRED');}
 const local=env.NODE_ENV==='test'&&base.protocol==='http:'&&base.hostname==='127.0.0.1'&&env.HOST==='127.0.0.1'&&!env.RENDER_SERVICE_ID;
 if(base.pathname!=='/'||base.search||base.hash||!local&&(base.protocol!=='https:'||env.NODE_ENV!=='production'||env.HOST!=='0.0.0.0'))throw Error('REVIEW_ORIGIN_REQUIRED');
 if(env.NNX_REVIEW_TOSS_CLIENT_KEY&&!/^test_ck_[A-Za-z0-9_-]+$/.test(env.NNX_REVIEW_TOSS_CLIENT_KEY))throw Error('REVIEW_TEST_CLIENT_KEY_REQUIRED');
 let database=null,host=null,databaseURL=null;
 if(env.DATABASE_BACKEND==='postgres'){
  let url;try{url=new URL(env.DATABASE_URL||env.SANDBOX_PG_URL);if(!env.DATABASE_URL){if(url.pathname!=='/nnx_sandbox_home_20261012')throw Error();url.pathname='/'+(env.NNX_REVIEW_DATABASE_NAME||'nnx_review_20261018');}}catch{throw Error('DEDICATED_REVIEW_DATABASE_REQUIRED');}
  database=url.pathname.slice(1);host=url.hostname;
  if(!['postgres:','postgresql:'].includes(url.protocol)||!/^nnx_review_[a-z0-9_]{3,48}$/.test(database)||url.search||url.hash||!(local?['127.0.0.1','localhost','[::1]'].includes(host):host===testHost))throw Error('DEDICATED_REVIEW_DATABASE_REQUIRED');
  databaseURL=url.href;
 }else if(!local||env.DATABASE_URL)throw Error('DEDICATED_REVIEW_DATABASE_REQUIRED');
 return {marker,origin:base.origin,local,database,host,dir:path.resolve(env.DATA_DIR),databaseURL};
}
function verifyDirectory(cfg){
 const st=fs.lstatSync(cfg.dir);if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(cfg.dir)!==cfg.dir)throw Error('REVIEW_PRIVATE_DIRECTORY_REQUIRED');
 const value=JSON.parse(fs.readFileSync(path.join(cfg.dir,'review-environment.json'),'utf8'));
 if(value.marker!==marker||value.origin!==cfg.origin||value.database!==cfg.database||value.host!==cfg.host)throw Error('REVIEW_DIRECTORY_BINDING_MISMATCH');
 return cfg;
}
function verifyDatabase(db,cfg){
 const row=db.prepare('SELECT marker,origin FROM nnx_review_environment WHERE id=1').get();
 if(row?.marker!==marker||row.origin!==cfg.origin)throw Error('REVIEW_DATABASE_BINDING_MISMATCH');
}
module.exports={config,verifyDirectory,verifyDatabase,marker};
