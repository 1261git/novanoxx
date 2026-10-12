// Explicit loopback PostgreSQL only. Never reads DATABASE_URL or production files.
const crypto=require('node:crypto');
const {Pool}=require('pg');require('./database/pg-types.cjs')(require('pg'));
const schema=require('./database/sql-dialect.cjs')(require('./sandbox-commerce.cjs').schema);
module.exports=async function connect(options){
 const remote=options.externalSandbox?.host===options.host&&/^dpg-[a-z0-9-]+(?:\.[a-z0-9.-]+)?$/.test(options.host);
 if((options.host!=='127.0.0.1'&&!remote)||!/^nnx_sandbox_[a-z0-9_]+$/.test(options.database)||options.user!=='nnx_sandbox')throw Error('ISOLATED_DATABASE_REQUIRED');
 const pool=new Pool({...options,max:16,connectionTimeoutMillis:5000,statement_timeout:10000,application_name:'nnx-isolated-concurrency'});
 const fail=message=>{throw Error(message)};
 async function tx(fn){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");const result=await fn(c);await c.query('COMMIT');return result;}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
 async function initialize(){await tx(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(771102099)');
  const tables=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
  if(tables.some(x=>x.tablename==='sandbox_environment')){if((await c.query('SELECT marker FROM sandbox_environment')).rows[0]?.marker!=='NNX_REAL_PG_SANDBOX_V1')fail('ENVIRONMENT_MISMATCH');return;}
  if(tables.length)fail('NONEMPTY_DATABASE_REFUSED');
  await c.query(schema);
  await c.query('CREATE TABLE sandbox_environment(marker TEXT PRIMARY KEY); INSERT INTO sandbox_environment VALUES(\'NNX_REAL_PG_SANDBOX_V1\');');
  await c.query('ALTER TABLE assets ADD COLUMN reserved_by TEXT, ADD COLUMN reservation_token TEXT, ADD COLUMN reserved_until TIMESTAMPTZ;');
  await c.query("ALTER TABLE assets ADD CHECK((status='RESERVED' AND reserved_by IS NOT NULL AND reservation_token IS NOT NULL AND reserved_until IS NOT NULL) OR (status<>'RESERVED' AND reserved_by IS NULL AND reservation_token IS NULL AND reserved_until IS NULL));");
  await c.query('ALTER TABLE files ADD COLUMN fixture_data BYTEA NOT NULL;');
 });}
 if(options.initialize)await initialize();
 if((await pool.query('SELECT marker FROM sandbox_environment')).rows[0]?.marker!=='NNX_REAL_PG_SANDBOX_V1'){await pool.end();fail('ENVIRONMENT_MISMATCH');}
 const clear="status='ACTIVE',reserved_by=NULL,reservation_token=NULL,reserved_until=NULL";
 async function reserve({buyerId,assetId}){return tx(async c=>{
  const a=(await c.query('SELECT * FROM assets WHERE id=$1 FOR UPDATE',[assetId])).rows[0];
  const dbNow=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
  if(!a||a.sale_mode!=='EXCLUSIVE'||a.status==='SOLD')fail('ASSET_UNAVAILABLE');
  if(a.seller_id===buyerId)fail('SELF_PURCHASE');
  if(!(await c.query('SELECT user_id FROM wallets WHERE user_id=$1',[buyerId])).rowCount)fail('BUYER_UNKNOWN');
  if(a.status==='RESERVED'&&a.reserved_until>dbNow){if(a.reserved_by===buyerId)return {token:a.reservation_token,expires:a.reserved_until};fail('ASSET_RESERVED');}
  const token=crypto.randomUUID();const result=await c.query("UPDATE assets SET status='RESERVED',reserved_by=$2,reservation_token=$3,reserved_until=clock_timestamp()+interval '10 minutes' WHERE id=$1 RETURNING reserved_until",[assetId,buyerId,token]);return {token,expires:result.rows[0].reserved_until};
 });}
 async function cancel({buyerId,assetId,token}){return tx(async c=>{const result=await c.query(`UPDATE assets SET ${clear} WHERE id=$1 AND status='RESERVED' AND reserved_by=$2 AND reservation_token=$3`,[assetId,buyerId,token]);return result.rowCount===1;});}
 async function expire(){return tx(async c=>(await c.query(`UPDATE assets SET ${clear} WHERE status='RESERVED' AND reserved_until<=clock_timestamp()`)).rowCount);}
 async function purchase({buyerId,assetId,requestId,expectedPrice,contractVersion,token,additionalWork=false,injectFailure=false}){
  if(!/^sandbox_[0-9a-f-]{36}$/.test(requestId)||additionalWork!==false)fail('INVALID_REQUEST');
  return tx(async c=>{
   // Serialize the request key across processes before inspecting its committed result.
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[requestId]);
   const old=(await c.query('SELECT * FROM orders WHERE id=$1',[requestId])).rows[0];
   if(old){if(old.buyer_id!==buyerId||old.asset_id!==assetId||old.price!==expectedPrice||JSON.parse(old.terms).contractVersion!==contractVersion)fail('REQUEST_CONFLICT');return old;}
   const a=(await c.query('SELECT * FROM assets WHERE id=$1 FOR UPDATE',[assetId])).rows[0];
   const dbNow=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
   if(!a||a.status==='SOLD')fail('ASSET_UNAVAILABLE');
   if(a.seller_id===buyerId)fail('SELF_PURCHASE');
   if(a.sale_mode==='EXCLUSIVE'){if(a.status!=='RESERVED'||a.reserved_by!==buyerId||a.reservation_token!==token)fail('RESERVATION_REQUIRED');if(a.reserved_until<=dbNow)fail('RESERVATION_EXPIRED');}else if(a.status!=='ACTIVE')fail('ASSET_UNAVAILABLE');
   if(a.price!==expectedPrice||a.contract_version!==contractVersion)fail('TERMS_CHANGED');
   if((await c.query("SELECT id FROM orders WHERE buyer_id=$1 AND asset_id=$2 AND status='COMPLETED'",[buyerId,assetId])).rowCount)fail('ALREADY_PURCHASED');
   const w=(await c.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE',[buyerId])).rows[0];if(!w||w.balance<a.price)fail('INSUFFICIENT_BALANCE');
   const files=(await c.query("SELECT * FROM files WHERE asset_id=$1 AND kind='original' ORDER BY id FOR SHARE",[assetId])).rows;if(!files.length)fail('NO_DELIVERABLES');
   for(const f of files)if(f.fixture_data.length!==f.size||crypto.createHash('sha256').update(f.fixture_data).digest('hex')!==f.sha256)fail('FILE_CHANGED');
   const now=Date.now(),terms=JSON.stringify({saleMode:a.sale_mode,contractVersion,priceNeon:a.price,neonKrw:100,feeBps:1200,additionalWork:false,files:files.map(f=>({id:f.id,name:f.name,size:f.size,sha256:f.sha256}))});
   await c.query('UPDATE wallets SET balance=balance-$2 WHERE user_id=$1',[buyerId,a.price]);
   await c.query('INSERT INTO orders VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)',[requestId,'SANDBOX',buyerId,a.seller_id,assetId,'COMPLETED',a.sale_mode,a.price,terms,now]);
   await c.query('INSERT INTO ledger VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[crypto.randomUUID(),buyerId,requestId,'PURCHASE',-a.price,w.balance,w.balance-a.price,now]);
   for(const f of files)await c.query('INSERT INTO entitlements VALUES($1,$2,$3,NULL)',[requestId,f.id,buyerId]);
   if(injectFailure)fail('INJECTED_FAILURE');
   await c.query('INSERT INTO settlements VALUES($1,$2,$3,$4,$5,$6)',[requestId,a.seller_id,a.price*100,a.price*12,a.price*88,'PENDING']);
   if(a.sale_mode==='EXCLUSIVE')await c.query("UPDATE assets SET status='SOLD',reserved_by=NULL,reservation_token=NULL,reserved_until=NULL WHERE id=$1",[assetId]);
   for(const type of ['PAID','COMPLETED','ENTITLEMENTS_GRANTED','SETTLEMENT_PENDING'])await c.query('INSERT INTO events VALUES($1,$2,$3,$4)',[crypto.randomUUID(),requestId,type,now]);
   return (await c.query('SELECT * FROM orders WHERE id=$1',[requestId])).rows[0];
  });
 }
 async function refund(buyerId,orderId,{injectFailure=false}={}){return tx(async c=>{
  if(typeof orderId!=='string'||!/^sandbox_[0-9a-f-]{36}$/.test(orderId))fail('INVALID_REQUEST');
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[orderId]);
  const o=(await c.query('SELECT * FROM orders WHERE id=$1 AND buyer_id=$2 FOR UPDATE',[orderId,buyerId])).rows[0];
  if(!o||o.environment!=='SANDBOX')fail('ACCESS_DENIED');
  if(o.status==='REFUNDED')return o;
  if(o.status!=='COMPLETED')fail('INVALID_STATE');
  await c.query('SELECT id FROM assets WHERE id=$1 FOR UPDATE',[o.asset_id]);
  const w=(await c.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE',[buyerId])).rows[0];
  const settlement=(await c.query('SELECT status FROM settlements WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];
  if(!w||settlement?.status!=='PENDING')fail('REFUND_NOT_ALLOWED');
  const now=Date.now();
  await c.query('UPDATE wallets SET balance=balance+$2 WHERE user_id=$1',[buyerId,o.price]);
  await c.query('INSERT INTO ledger VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[crypto.randomUUID(),buyerId,orderId,'REFUND',o.price,w.balance,w.balance+o.price,now]);
  await c.query("UPDATE orders SET status='REFUNDED' WHERE id=$1",[orderId]);
  await c.query('UPDATE entitlements SET revoked=$2 WHERE order_id=$1',[orderId,now]);
  if(injectFailure)fail('INJECTED_REFUND_FAILURE');
  await c.query("UPDATE settlements SET status='CANCELLED' WHERE order_id=$1",[orderId]);
  await c.query('INSERT INTO events VALUES($1,$2,$3,$4)',[crypto.randomUUID(),orderId,'REFUNDED',now]);
  // A refunded exclusive sale remains SOLD pending future administrator review.
  return (await c.query('SELECT * FROM orders WHERE id=$1',[orderId])).rows[0];
 });}
 return {pool,reserve,cancel,expire,purchase,refund,close:()=>pool.end()};
};
