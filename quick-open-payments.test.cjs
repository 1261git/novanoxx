'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const activation=require('./payment-activation.cjs');
const env={NNX_LIVE_PAYMENTS:'1',NNX_QUICK_OPEN_APPROVED:'1',NNX_TOSS_MID:'q_synthetic',NNX_QUICK_OPEN_SELLER_EMAILS:'owner@example.invalid',NNX_OPERATING_RECONCILIATION_APPROVED:'1',NNX_TOSS_LIVE_CLIENT_KEY:'live_ck_synthetic',NNX_TOSS_LIVE_SECRET_KEY:'live_sk_synthetic'};
test('Quick Open needs its own approval, matching MID scope, keys and reconciliation; it never implies billing approval',async()=>{
 assert.equal(activation.enabled(env),true);
 for(const missing of ['NNX_QUICK_OPEN_APPROVED','NNX_TOSS_MID','NNX_QUICK_OPEN_SELLER_EMAILS','NNX_TOSS_LIVE_SECRET_KEY','NNX_OPERATING_RECONCILIATION_APPROVED'])assert.equal(activation.enabled({...env,[missing]:''}),false,missing);
 let calls=0;const provider=require('./financial-provider.cjs').create({env,request:async()=>{calls++;throw Error('must not call');}});
 await assert.rejects(provider.issueBilling({}),/PAYMENT_SCOPE_UNAVAILABLE/);await assert.rejects(provider.chargeBilling({}),/PAYMENT_SCOPE_UNAVAILABLE/);assert.equal(calls,0);
});
test('An approved-looking payment from a different MID cannot grant rights',async()=>{
 const input={orderId:'order_synthetic',amount:1000,paymentKey:'synthetic_payment',idempotencyKey:'nnx_synthetic_123'};let mid='q_other';
 const provider=require('./financial-provider.cjs').create({env,request:async()=>({ok:true,json:async()=>({mId:mid,orderId:input.orderId,totalAmount:1000,paymentKey:input.paymentKey,currency:'KRW',status:'DONE'})})});
 await assert.rejects(provider.confirm(input),/PAYMENT_VERIFICATION_REQUIRED/);mid=env.NNX_TOSS_MID;assert.equal((await provider.confirm(input)).mId,mid);
});
test('Quick Open blocks third-party marketplace orders and Brief before a payable order is created, while merchant assets use exact quotes',()=>{
 const dir=fs.mkdtempSync(path.resolve('../novanoxx-stage10-evidence-20261017/quickopen245-')),db=new(require('./database/postgres.cjs'))({pglite:true,pglitePath:path.join(dir,'pg')});
 try{
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,name TEXT);CREATE TABLE member_restrictions(user_id TEXT PRIMARY KEY,state TEXT);CREATE TABLE creator_assets(id TEXT PRIMARY KEY,user_id TEXT,metadata TEXT,status TEXT,created INTEGER,updated INTEGER);CREATE TABLE creator_files(id TEXT PRIMARY KEY,asset_id TEXT,user_id TEXT,kind TEXT,name TEXT,ext TEXT,size INTEGER,created INTEGER);CREATE TABLE creator_original_fingerprints(file_id TEXT PRIMARY KEY,asset_id TEXT,seller_id TEXT,digest TEXT,size INTEGER,created INTEGER);CREATE TABLE catalog_links(public_id INTEGER PRIMARY KEY,asset_id TEXT);INSERT INTO users VALUES('buyer','buyer@example.invalid','Buyer'),('merchant','owner@example.invalid','Merchant'),('third-party','other@example.invalid','Other');");
  for(const name of ['002-operating-engine.sql','003-operating-connections.sql'])db.exec(fs.readFileSync(path.join('database',name),'utf8'));
  for(const [id,seller,publicId] of [['owned-asset','merchant',1],['other-asset','third-party',2]]){const metadata={title:'Synthetic rights',description:'Synthetic',price:399,days:0,saleMode:'MULTI',rightsConfirmed:true,contract:{sellerId:seller,mode:'MULTI',version:'2026-10-11-v1'},usageRights:{commercial:true,modify:true},customization:{},fulfillment:'REGISTERED_INSTANT',deliverables:'Synthetic file'};db.prepare('INSERT INTO creator_assets VALUES(?,?,?,?,?,?)').run(id,seller,JSON.stringify(metadata),'ACTIVE',1,1);db.prepare('INSERT INTO catalog_links VALUES(?,?)').run(publicId,id);}
  const commerce=require('./operating-commerce.cjs')({db,env,provider:{},isAdmin:()=>false}),input=assetId=>({requestId:crypto.randomUUID(),kind:'ASSET',assetId,optionKeys:[],expectedTotal:399,expectedDays:0});
  assert.equal(commerce.eligible(1001),true);assert.equal(commerce.eligible(1002),false);
  assert.throws(()=>commerce.create('buyer',input(1002)),/PAYMENT_SCOPE_UNAVAILABLE/);assert.throws(()=>commerce.create('buyer',{requestId:crypto.randomUUID(),kind:'BRIEF'}),/PAYMENT_SCOPE_UNAVAILABLE/);assert.equal(db.prepare('SELECT COUNT(*) n FROM nnx_operating_v1.orders').get().n,0);
  assert.throws(()=>commerce.create('buyer',{...input(1001),expectedTotal:1}),/PRICE_CHANGED/);assert.equal(db.prepare('SELECT COUNT(*) n FROM nnx_operating_v1.orders').get().n,0);
  const order=commerce.create('buyer',input(1001));assert.equal(order.amount,39900);assert.equal(order.realBilling,true);assert.equal(db.prepare('SELECT state FROM nnx_operating_v1.payments WHERE order_id=?').get(order.id).state,'REQUESTED');
  // Removing a merchant from the approved scope blocks an already prepared checkout too.
  env.NNX_QUICK_OPEN_SELLER_EMAILS='different@example.invalid';assert.throws(()=>commerce.start('buyer',{id:order.id,agreed:true,policyVersion:order.policyVersion},'https://synthetic.invalid'),/PAYMENT_SCOPE_UNAVAILABLE/);env.NNX_QUICK_OPEN_SELLER_EMAILS='owner@example.invalid';
 }finally{db.close();}
});
