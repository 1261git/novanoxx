'use strict';
module.exports=function(options){
 const policy=require('./review-environment.cjs'),cfg=policy.verifyDirectory(policy.config(options.env));
 if(require('node:path').resolve(options.dir)!==cfg.dir)throw Error('REVIEW_DIRECTORY_BINDING_MISMATCH');policy.verifyDatabase(options.db,cfg);
 const engine=require('./sandbox-engine-core.cjs')(options);
 const blocked=()=>{throw Error('DISCOVERY_PERMISSION_REQUIRED');};
 const operations=engine.operations;
 engine.operations={...operations,collect:blocked,privacy:{...operations.privacy,act:(actor,input)=>{if(input.allowed===true)blocked();return operations.privacy.act(actor,input);}}};
 // A review service is never a scheduler for real financial operations.
 return {...engine,reviewOnly:true};
};
