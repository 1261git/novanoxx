'use strict';
const fs=require('node:fs'),path=require('node:path');
module.exports=function({env=process.env,dir}){
 if(env.NNX_LOCAL_ENGINE_TEST!=='1'||env.NNX_ENGINE_POSTGRES_TEST!=='1'||env.NODE_ENV!=='test'||env.HOST!=='127.0.0.1'||env.TOSS_SECRET_KEY||env.RENDER_SERVICE_ID||env.MIGRATE_SQLITE==='1')throw Error('OWNED_POSTGRES_TEST_REQUIRED');
 if(!env.DATA_DIR||fs.realpathSync(dir)!==fs.realpathSync(env.DATA_DIR)||fs.readFileSync(path.join(dir,'engine-local-test.json'),'utf8').trim()!=='NNX_OWNED_LOCAL_ENGINE_TEST_V1')throw Error('OWNED_POSTGRES_TEST_REQUIRED');
 let url;try{url=new URL(env.DATABASE_URL);}catch{throw Error('OWNED_POSTGRES_TEST_REQUIRED');}
 const database=url.pathname.slice(1);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.search||url.hash||!/^nnx_engine_test_[a-z0-9_]+$/.test(database)||fs.readFileSync(path.join(dir,'engine-postgres-test.json'),'utf8').trim()!=='NNX_OWNED_POSTGRES_TEST_V1:'+database)throw Error('OWNED_POSTGRES_TEST_REQUIRED');
 return {url:env.DATABASE_URL,engineSandbox:true};
};
