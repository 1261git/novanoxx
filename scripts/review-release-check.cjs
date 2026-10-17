'use strict';
// Read-only release inventory. --target checks an explicitly initialized isolated target.
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const plan=require('../docs/review-release-plan.json');
const files=['review-environment.cjs','review-engine.cjs','sandbox-engine-core.cjs','review-checkout.cjs','review-sample.cjs','assets/review-checkout.js','assets/review-checkout.css','database/002-operating-engine.sql','.env.review.example'];
const missing=files.filter(f=>!fs.existsSync(path.join(root,f))),result={codeFilesPresent:missing.length===0,missing,targetChecked:false,providerWindowVerified:false,deploymentExecuted:false,operatingBindingEnabled:false,releaseGates:plan.releaseGates};
if(process.argv.includes('--target')){
 let db;try{const policy=require('../review-environment.cjs'),cfg=policy.verifyDirectory(policy.config());db=require('../database.cjs')(cfg.dir);result.targetChecked=true;result.testClientKeyConfigured=!!process.env.NNX_REVIEW_TOSS_CLIENT_KEY;result.accounts=Number(db.prepare('SELECT COUNT(*) n FROM users').get().n);result.activeCatalog=Number(db.prepare("SELECT COUNT(*) n FROM creator_assets a JOIN catalog_links c ON c.asset_id=a.id WHERE a.status='ACTIVE'").get().n);result.localTargetChecksPass=result.testClientKeyConfigured&&result.accounts>=2&&result.activeCatalog>=1;}catch{result.targetError='TARGET_NOT_PREPARED_OR_CONFIGURATION_INVALID';process.exitCode=1;}finally{db?.close();}
}
if(missing.length)process.exitCode=1;
console.log(JSON.stringify(result,null,2));
