// Explicit configuration-bound opt-in. Default local module entrypoints stay local-only.
const crypto=require('node:crypto'),contexts=new WeakMap();
const digest=c=>crypto.createHash('sha256').update(JSON.stringify({host:c.host,port:Number(c.port||5432),user:c.user,password:c.password,database:c.database,ssl:c.ssl,externalSandbox:c.externalSandbox})).digest('hex');
function authorize(config,{mode,origin,localTest=false}={}){
 if(mode!=='EXTERNAL_TEST')throw Error('EXTERNAL_TEST_MODE_REQUIRED');
 if(config.connectionString!==undefined||config.user!=='nnx_sandbox'||!/^nnx_sandbox_home_[a-z0-9_]+$/.test(config.database)||typeof config.password!=='string'||!config.password||!Number.isInteger(Number(config.port||5432))||Number(config.port||5432)<1||Number(config.port||5432)>65535)throw Error('EXTERNAL_TEST_DATABASE_REQUIRED');
 if(typeof localTest!=='boolean')throw Error('EXTERNAL_TEST_LOCAL_FLAG_REQUIRED');
 const u=new URL(origin);if(u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('EXTERNAL_TEST_ORIGIN_REQUIRED');
 if(localTest){if(config.host!=='127.0.0.1'||config.externalSandbox||u.protocol!=='http:'||u.hostname!=='127.0.0.1')throw Error('EXTERNAL_TEST_LOCAL_REHEARSAL_ONLY');}
 else{
  if(!/^dpg-[a-z0-9-]+(?:\.[a-z0-9.-]+)?$/.test(config.host)||config.externalSandbox?.host!==config.host)throw Error('EXTERNAL_TEST_HOST_REQUIRED');
  if(u.protocol!=='https:'||u.hostname==='novanoxx.onrender.com')throw Error('SEPARATE_TEST_HTTPS_REQUIRED');
  if(config.host.includes('.')&&config.ssl?.rejectUnauthorized!==true)throw Error('EXTERNAL_TEST_TLS_REQUIRED');
 }
 const token=Object.freeze({mode:'EXTERNAL_TEST',origin:u.origin,localTest});contexts.set(token,digest(config));return token;
}
function assert(config,token){if(!token||contexts.get(token)!==digest(config))throw Error('EXTERNAL_TEST_CONTEXT_REQUIRED');}
module.exports={authorize,assert};
