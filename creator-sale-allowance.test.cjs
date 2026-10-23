'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const env={RENDER_SERVICE_ID:'srv-db5aqunlk1mc739bi0m0',NODE_ENV:'production'};
test('Explicit owner selling allowances leave plans, billing and other seller limits intact',()=>{
 const emails={owner:'kanoe0213@gmail.com',creator:' HISOKA1030@gmail.com ',ordinary:'ordinary@example.invalid',similar:'kanoe0213+other@gmail.com'};
 const rows=id=>Array.from({length:id==='owner'||id==='creator'?25:1},(_,i)=>({id:id+i,status:'ACTIVE',metadata:'{"title":"existing"}'}));
 const db={prepare(sql){return {get(id){if(sql==='SELECT email FROM users WHERE id=?')return emails[id]?{email:emails[id]}:undefined;if(sql==='SELECT id,email FROM users WHERE id=?')return {id,email:emails[id]};if(sql.includes('to_regclass'))return {relation:'asset_publication_policy'};return undefined;},all(id){if(sql.startsWith('SELECT id,status,metadata FROM creator_assets'))return rows(id);throw Error('Unexpected query: '+sql);}};}};
 const service=require('./operating-subscriptions.cjs')({db,env,provider:{}});
 for(const id of ['owner','creator']){
  const p=service.plan(id);assert.equal(p.plan,'FREE');assert.equal(p.assetLimit,null);assert.equal(p.assetLimitOverride,true);assert.equal(p.issue,null);
  assert.doesNotThrow(()=>service.checkActivation({id:'next',user_id:id}));
  assert.equal(service.state(id).realBilling,false);
  assert.throws(()=>service.create(id,{plan:'PLUS'}),/PAYMENT_CONTRACT_PENDING/);
  assert.throws(()=>service.act(id,{action:'simulatePaid',plan:'PRO'}),/PAYMENT_VERIFICATION_REQUIRED/);
 }
 for(const id of ['ordinary','similar']){assert.equal(service.plan(id).assetLimit,1);assert.equal(service.plan(id).assetLimitOverride,false);assert.throws(()=>service.checkActivation({id:'next',user_id:id}),/PLAN_ACTIVE_LIMIT/);}
 const allowed=require('./creator-sale-allowance.cjs');assert.equal(allowed(db,'missing',env),false);assert.equal(allowed(db,'owner',{...env,NNX_REVIEW_MODE:'1'}),false);assert.equal(allowed(db,'owner',{...env,RENDER_SERVICE_ID:'staging'}),false);
});
