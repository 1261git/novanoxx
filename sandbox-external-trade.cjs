// Dedicated external TEST backend. Not imported by production or the deployed cloud entry.
module.exports=async function externalTrade(config,options={}){
 const token=require('./sandbox-external-test-context.cjs').authorize(config,options);
 // Refuse unmarked/ambiguous targets before feature schema creation; never initialize a DB.
 const c=new(require('pg').Client)(config);await c.connect();try{await c.query('BEGIN READ ONLY');const r=await c.query('SELECT marker FROM public.sandbox_environment');if(r.rowCount!==1||r.rows[0].marker!=='NNX_REAL_PG_SANDBOX_V1')throw Error('EXTERNAL_TEST_MARKER_REQUIRED');await c.query('COMMIT');}finally{await c.end();}
 let workOrders,operations,operationsAdmin,autoConfirmOperations;
 try{
  const mediaRuntime=options.useLinuxVideo?require('./sandbox-linux-video.cjs')(config,token,options.runtimeRoot):options.mediaRuntime;
  workOrders=await require('./sandbox-work-orders.cjs')(config,{syntheticOnly:true,extended:true,autoConfirmEnabled:true,externalTest:token,mediaRuntime});
  operations=await require('./sandbox-operations.cjs')(config,{externalTest:token});
  operationsAdmin=await require('./sandbox-operations-admin.cjs')(operations);
  autoConfirmOperations=await require('./sandbox-auto-confirm-ops.cjs')(operations,operationsAdmin);workOrders.configureAutoConfirm(autoConfirmOperations);
  let closed=false;
  return {environment:'SANDBOX',mode:'EXTERNAL_TEST',workOrders,operations,operationsAdmin,autoConfirmOperations,
   // Existing authentication layer must configure Google+allowlist verifiers before exposure.
   fileStoreFactory:db=>require('./sandbox-registered-file-store.cjs').create(db,config,token),
   requirements:['VERIFIED_ADMIN_BINDING','LINUX_VIDEO_RUNTIME','CLOUD_WORKER_AND_HTTP_WIRING','EXTERNAL_BACKUP_RESTORE'],
   close:async()=>{if(closed)return;await workOrders.close();await operations.close();closed=true;}};
 }catch(e){if(workOrders)await workOrders.close().catch(()=>{});if(operations)await operations.close().catch(()=>{});throw e;}
};
