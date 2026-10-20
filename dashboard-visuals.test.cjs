'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const create=()=>new(require('./database/postgres.cjs'))({pglite:true});
const end=Date.parse('2026-10-20T02:00:00Z'),start=Date.parse('2026-10-18T15:00:00Z');
test('Extra chart series use KST login/billing buckets, current refunds and approved cycles only',()=>{
 const db=create();try{
  db.exec('CREATE TABLE login_events(user_id TEXT,occurred BIGINT);CREATE SCHEMA nnx_operating_v1;CREATE TABLE nnx_operating_v1.subscription_cycles(period_start TIMESTAMPTZ,amount_krw BIGINT,state TEXT,provider_payment_key TEXT);CREATE TABLE nnx_operating_v1.billing_payment_sync(payment_key TEXT,refunded_krw BIGINT);');
  for(const time of ['2026-10-19T14:59:00Z','2026-10-19T15:01:00Z','2026-10-21T00:00:00Z'])db.prepare('INSERT INTO login_events VALUES(?,?)').run('private-member',Date.parse(time));
  for(const [key,amount,state,at]of [['paid',50000,'APPROVED','2026-10-19T15:01:00Z'],['failed',999999,'FAILED','2026-10-19T15:01:00Z'],['future',999999,'APPROVED','2026-10-21T00:00:00Z']])db.prepare('INSERT INTO nnx_operating_v1.subscription_cycles VALUES(?,?,?,?)').run(at,amount,state,key);db.prepare('INSERT INTO nnx_operating_v1.billing_payment_sync VALUES(?,?)').run('paid',5000);
  const series=[{date:'2026-10-19'},{date:'2026-10-20'}];require('./dashboard-extra-series.cjs')({db,series,start,end});assert.deepEqual(series.map(r=>r.logins),[1,1]);assert.deepEqual(series.map(r=>r.subscriptionGrossKrw),[0,50000]);assert.deepEqual(series.map(r=>r.subscriptionRefundedKrw),[0,5000]);
  const hourly=Array.from({length:24},(_,i)=>({date:String(i).padStart(2,'0')+':00'}));require('./dashboard-extra-series.cjs')({db,series:hourly,start:Date.parse('2026-10-19T15:00:00Z'),end,hourly:true});assert.equal(hourly[0].logins,1);assert.equal(hourly[0].subscriptionGrossKrw,50000);assert.equal(hourly[0].subscriptionRefundedKrw,5000);
 }finally{db.close();}
});
test('Category shares and high/low rankings reconcile, include zero views, exclude TEST/drafts/future/out-of-period',()=>{
 const db=create();try{
  db.exec('CREATE TABLE creator_assets(id TEXT,metadata TEXT,status TEXT,created BIGINT);CREATE TABLE catalog_links(asset_id TEXT,public_id BIGINT);CREATE TABLE asset_publication_policy(asset_id TEXT,visibility TEXT);CREATE SCHEMA nnx_operating_v1;CREATE TABLE nnx_operating_v1.asset_view_days(asset_id TEXT,day TEXT,views BIGINT);');
  for(const [id,category,status,created,visibility,n]of [['a','VIDEO','ACTIVE',start,'PUBLIC',1],['b','2D','SOLD',start,'PUBLIC',2],['c','VIDEO','ACTIVE',start,'PUBLIC',3],['draft','VIDEO','DRAFT',start,'PUBLIC',4],['test','VIDEO','ACTIVE',start,'TEST_ARCHIVE',5],['future','VIDEO','ACTIVE',end+1000,'PUBLIC',6]]){db.prepare('INSERT INTO creator_assets VALUES(?,?,?,?)').run(id,JSON.stringify({title:'Asset '+id,category}),status,created);db.prepare('INSERT INTO catalog_links VALUES(?,?)').run(id,n);db.prepare('INSERT INTO asset_publication_policy VALUES(?,?)').run(id,visibility);}
  for(const [id,day,views]of [['a','2026-10-20',5],['b','2026-10-19',2],['a','2026-10-18',999],['a','2026-10-21',999],['draft','2026-10-20',999],['test','2026-10-20',999],['future','2026-10-20',999]])db.prepare('INSERT INTO nnx_operating_v1.asset_view_days VALUES(?,?,?)').run(id,day,views);
  const r=require('./dashboard-engagement.cjs')({db,period:{start,end}});assert.equal(r.totalViews,7);assert.equal(r.categories.reduce((n,c)=>n+c.views,0),7);assert.equal(r.categories.find(c=>c.category==='VIDEO').views,5);assert.deepEqual(r.mostViewed.map(a=>a.publicId),[1001,1002,1003]);assert.equal(r.leastViewed[0].publicId,1003);assert.equal(r.leastViewed[0].views,0);assert(!JSON.stringify(r).includes('999'));assert.match(r.basis,/NOT_UNIQUE/);
 }finally{db.close();}
});
