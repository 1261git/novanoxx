'use strict';
// Production site capabilities before the payment contract is activated.
// Existing TEST records stay readable; they never become paid production rights.
const path=require('node:path');
function validate(env=process.env){
 if(env.RENDER_SERVICE_ID!=='srv-db5aqunlk1mc739bi0m0'||env.NODE_ENV!=='production'||env.DATABASE_BACKEND!=='postgres'||env.NNX_REVIEW_MODE==='1'||env.NNX_LOCAL_ENGINE_TEST==='1'||env.NNX_LIVE_PAYMENTS==='1')throw Error('PRODUCTION_PRECONTRACT_BINDING_REQUIRED');
 const u=new URL(env.DATABASE_URL);if(u.hostname!=='dpg-db5ps6navr4c739lilj0-a'||u.pathname!=='/novanoxx_jk4i'||path.resolve(env.DATA_DIR||'')!=='/data')throw Error('PRODUCTION_DATA_BINDING_REQUIRED');
 return true;
}
module.exports=function(options){
 validate(options.env);const engine=require('./sandbox-engine-core.cjs')(options),blocked=()=>{throw Error('PAYMENT_CONTRACT_PENDING');};
 const operations=engine.operations,briefs=engine.briefs;
 return {...engine,productionSite:true,scheduledJobsDisabled:true,paymentPreview:true,
  work:{...engine.work,purchase:blocked,act:blocked,upload:blocked,deliver:blocked,stageRegistered:blocked,attachmentUpload:blocked},
  subscription:{...engine.subscription,act:blocked,worker:{...engine.subscription.worker,act:blocked}},
  briefs:{...briefs,act:(actor,i)=>i.action==='briefCheckout'?blocked():briefs.act(actor,i)},
  operations:{...operations,collect:()=>{throw Error('DISCOVERY_PERMISSION_REQUIRED');},prune:()=>0,privacy:{...operations.privacy,act:(actor,i)=>i.allowed===true?(()=>{throw Error('DISCOVERY_PERMISSION_REQUIRED');})():operations.privacy.act(actor,i)}}};
};
module.exports.validate=validate;
