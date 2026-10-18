'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('Ambiguous provider responses never become definite rejection and redirects cannot forward credentials',async()=>{
 const env={NNX_LIVE_PAYMENTS:'1',NNX_PAYMENT_CONTRACT_APPROVED:'1',NNX_OPERATING_RECONCILIATION_APPROVED:'1',NNX_TOSS_LIVE_CLIENT_KEY:'live_ck_synthetic',NNX_TOSS_LIVE_SECRET_KEY:'live_sk_synthetic'};
 for(const [status,code] of [[408,'TIMEOUT'],[409,'CONFLICT'],[425,'EARLY'],[429,'LIMIT'],[500,'INTERNAL'],[400,'ALREADY_PROCESSED_PAYMENT'],[400,'IDEMPOTENT_REQUEST_PROCESSING']]){
  let calls=0;const p=require('./financial-provider.cjs').create({env,request:async(url,o)=>{calls++;assert.equal(o.redirect,'error');return {ok:false,status,json:async()=>({code})};}});
  await assert.rejects(p.confirm({orderId:'live_synthetic',paymentKey:'synthetic',amount:100,idempotencyKey:'nnx_synthetic_key'}),/PAYMENT_RECONCILIATION_REQUIRED/);assert.equal(calls,1);
 }
 const rejected=require('./financial-provider.cjs').create({env,request:async()=>({ok:false,status:400,json:async()=>({code:'INVALID_CARD_NUMBER'})})});await assert.rejects(rejected.confirm({orderId:'live_synthetic',paymentKey:'synthetic',amount:100,idempotencyKey:'nnx_synthetic_key'}),/PAYMENT_PROVIDER_REJECTED/);
});
test('Financial management is limited to the nominated owner independently of legacy TEST administrators',()=>{
 const admin=require('./operating-admin-policy.cjs');assert.equal(admin({email:' NovaNoxx2026@gmail.com '}),true);assert.equal(admin({email:'kanoe0213@gmail.com'}),false);assert.equal(admin(null),false);
});
