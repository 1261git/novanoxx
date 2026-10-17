'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const plans={FREE:1,PLUS:3,ULTRA:7,PRO:null};
module.exports=function({db,dir,env=process.env,clock=Date.now,isAdmin=require('./admin-policy.cjs'),delegationEnabled=false,protect=require('./protected-delivery.cjs')}){
 if(db.backend==='postgres'&&db.embeddedTest!==true)require('./engine-postgres-test-config.cjs')({env,dir});
 if(env.NODE_ENV!=='test'||env.HOST!=='127.0.0.1'||env.NNX_LOCAL_ENGINE_TEST!=='1'||env.TOSS_SECRET_KEY||(env.DATABASE_URL&&!(db.backend==='postgres'&&db.engineSandbox===true))||env.RENDER_SERVICE_ID||(db.backend==='postgres'&&db.embeddedTest!==true&&db.engineSandbox!==true)||!env.DATA_DIR||fs.realpathSync(dir)!==fs.realpathSync(env.DATA_DIR)||fs.readFileSync(path.join(dir,'engine-local-test.json'),'utf8').trim()!=='NNX_OWNED_LOCAL_ENGINE_TEST_V1')throw Error('OWNED_LOCAL_TEST_REQUIRED');
 return require('./sandbox-engine-core.cjs')({db,dir,env,clock,isAdmin,delegationEnabled,protect});
};
