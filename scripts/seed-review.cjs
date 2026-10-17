'use strict';
if(process.argv[2]!=='--seed-owned-review-samples')throw Error('EXPLICIT_REVIEW_SAMPLE_SEED_REQUIRED');
const policy=require('../review-environment.cjs'),cfg=policy.verifyDirectory(policy.config());
// Initializes only the already-bound, separate review database. No listener or worker starts.
require('../auth.cjs');
const db=require('../database.cjs')(cfg.dir);
try{console.log(JSON.stringify(require('../review-sample.cjs')({db,dir:cfg.dir,sellerPassword:process.env.NNX_REVIEW_SELLER_PASSWORD,buyerPassword:process.env.NNX_REVIEW_BUYER_PASSWORD})));}finally{db.close();}
