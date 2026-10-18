'use strict';
// Production site capabilities before the payment contract is activated.
// Existing TEST records stay readable; they never become paid production rights.
const path=require('node:path');
function validate(env=process.env){
 if(env.RENDER_SERVICE_ID!=='srv-db5aqunlk1mc739bi0m0'||env.NODE_ENV!=='production'||env.DATABASE_BACKEND!=='postgres'||env.NNX_REVIEW_MODE==='1'||env.NNX_LOCAL_ENGINE_TEST==='1'||env.NNX_LIVE_PAYMENTS==='1'&&(env.NNX_PAYMENT_CONTRACT_APPROVED!=='1'||env.NNX_OPERATING_RECONCILIATION_APPROVED!=='1'||!/^live_ck_[A-Za-z0-9_-]+$/.test(env.NNX_TOSS_LIVE_CLIENT_KEY||'')||!/^live_sk_[A-Za-z0-9_-]+$/.test(env.NNX_TOSS_LIVE_SECRET_KEY||'')))throw Error('PRODUCTION_PRECONTRACT_BINDING_REQUIRED');
 const u=new URL(env.DATABASE_URL);if(u.hostname!=='dpg-db5ps6navr4c739lilj0-a'||u.pathname!=='/novanoxx_jk4i'||path.posix.resolve(env.DATA_DIR||'')!=='/data')throw Error('PRODUCTION_DATA_BINDING_REQUIRED');
 return true;
}
module.exports=function(options){
 options={...options,env:options.env||process.env};
 validate(options.env);let connected=false;try{connected=!!options.db.prepare("SELECT version FROM nnx_operating_v1.schema_version WHERE version='OPERATING_CONNECTIONS_V1'").get();}catch{}if(connected)return operating(options);const engine=require('./sandbox-engine-core.cjs')(options),blocked=()=>{throw Error('PAYMENT_CONTRACT_PENDING');};
 const operations=engine.operations,briefs=engine.briefs;
 return {...engine,productionSite:true,scheduledJobsDisabled:true,paymentPreview:true,
  work:{...engine.work,purchase:blocked,act:blocked,upload:blocked,deliver:blocked,stageRegistered:blocked,attachmentUpload:blocked},
  subscription:{...engine.subscription,act:blocked,worker:{...engine.subscription.worker,act:blocked}},
  briefs:{...briefs,act:(actor,i)=>i.action==='briefCheckout'?blocked():briefs.act(actor,i)},
  operations:{...operations,collect:()=>{throw Error('DISCOVERY_PERMISSION_REQUIRED');},prune:()=>0,privacy:{...operations.privacy,act:(actor,i)=>i.allowed===true?(()=>{throw Error('DISCOVERY_PERMISSION_REQUIRED');})():operations.privacy.act(actor,i)}}};
};
module.exports.validate=validate;

function operating(options){
 const subscription=require('./operating-subscriptions.cjs')(options),commerce=require('./operating-commerce.cjs')(options);commerce.authority.plan=subscription.plan;
 const core=require('./sandbox-engine-core.cjs')({...options,paymentAuthority:commerce.authority});commerce.bind(core);const discoveryEnv={...options.env,NNX_DISCOVERY_BACKUP_ENABLED:options.env.NNX_DISCOVERY_BACKUP_ENABLED||(options.env.NNX_BACKUP_AUTOMATION==='1'?'1':'0')};const discovery=require('./discovery-raw-backup.cjs')({...options,env:discoveryEnv});
 let analytics=null;try{if(options.db.prepare("SELECT version FROM nnx_operating_v1.schema_version WHERE version='OPERATING_RECOVERY_ANALYTICS_V1'").get())analytics=require('./creator-analytics.cjs')(options);}catch(e){throw e;}let finance=null;try{if(options.db.prepare("SELECT version FROM nnx_operating_v1.schema_version WHERE version='OPERATING_FINANCE_V1'").get()){finance=require('./operating-finance.cjs')({...options,commerce});commerce.bindFinance(finance.sync);}}catch(error){if(error.message==='FINANCE_SCHEMA_REQUIRED')throw error;throw error;}
 let payouts=null;if(options.db.prepare("SELECT version FROM nnx_operating_v1.schema_version WHERE version='OPERATING_PAYOUTS_V1'").get()){payouts=require('./operating-payouts.cjs')({...options,finance,provider:options.payoutProvider||require('./payout-provider.cjs').create({env:options.env,clock:options.clock})});finance.bindPayouts(payouts);}
 const guard=(fn)=>(actor,i,...rest)=>{commerce.paidOrder(actor,i?.orderId);return fn(actor,i,...rest);};
 const upload=fn=>(actor,req,i)=>{commerce.paidOrder(actor,i?.orderId);return fn(actor,req,i);};
 const attachmentDownload=(actor,id)=>{const f=options.db.prepare('SELECT order_id FROM engine_order_attachments WHERE id=?').get(id);commerce.paidOrder(actor,f?.order_id);return core.work.attachmentDownload(actor,id);};
 return {...core,environment:'PRODUCTION',billing:'TOSS_CONTRACT_GATED',productionSite:true,scheduledJobsDisabled:false,paymentPreview:!commerce.enabled(),commerce,finance,analytics,payouts,
  work:{...core.work,state:commerce.workState,purchase:()=>{throw Error('PAYMENT_VERIFICATION_REQUIRED');},act:guard(core.work.act),upload:upload(core.work.upload),attachmentUpload:upload(core.work.attachmentUpload),attachmentDownload,deliver:guard(core.work.deliver),stageRegistered:guard(core.work.stageRegistered),download:commerce.download},
  subscription,
  briefs:{...core.briefs,act:(actor,i)=>{if(i.action==='briefCheckout')throw Error('PAYMENT_CONTRACT_PENDING');return core.briefs.act(actor,i);}},
  operations:{...core.operations,policy:{...core.operations.policy,liveCollectionEnabled:discoveryEnv.NNX_DISCOVERY_BACKUP_ENABLED==='1'},collect:(actor,i)=>{if(!discovery.state().ready)throw Error('DISCOVERY_PERMISSION_REQUIRED');const count=Number(options.db.prepare('SELECT COUNT(*) n FROM engine_discovery_events').get().n);if(count>=9000)throw Error('DISCOVERY_PERMISSION_REQUIRED');return core.operations.collect(actor,i);},privacy:{...core.operations.privacy,act:(actor,i)=>{if(i.allowed===true&&!discovery.state().ready)throw Error('DISCOVERY_PERMISSION_REQUIRED');return core.operations.privacy.act(actor,i);}}},discoveryBackup:discovery,
  async tick(){const result=core.tick();await subscription.tick();await finance?.tick();await payouts?.tick();await discovery.tick();return result;}};
}
