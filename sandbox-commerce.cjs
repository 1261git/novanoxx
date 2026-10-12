// Isolated executable prototype. Never imported by server.cjs or auth.cjs.
// PGlite is selected explicitly, so DATABASE_URL and the production disk are unused.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Postgres=require('./database/postgres.cjs');
const schema=`
CREATE TABLE wallets(user_id TEXT PRIMARY KEY,balance INTEGER NOT NULL CHECK(balance>=0));
CREATE TABLE assets(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),sale_mode TEXT NOT NULL CHECK(sale_mode IN ('EXCLUSIVE','MULTI')),status TEXT NOT NULL CHECK(status IN ('ACTIVE','RESERVED','SOLD')),contract_version TEXT NOT NULL);
CREATE TABLE files(id TEXT PRIMARY KEY,asset_id TEXT NOT NULL REFERENCES assets(id),kind TEXT NOT NULL CHECK(kind IN ('original','preview')),name TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL);
CREATE TABLE orders(id TEXT PRIMARY KEY,environment TEXT NOT NULL CHECK(environment='SANDBOX'),buyer_id TEXT NOT NULL REFERENCES wallets(user_id),seller_id TEXT NOT NULL,asset_id TEXT NOT NULL REFERENCES assets(id),status TEXT NOT NULL CHECK(status IN ('PAID','COMPLETED','REFUNDED')),sale_mode TEXT NOT NULL CHECK(sale_mode IN ('EXCLUSIVE','MULTI')),price INTEGER NOT NULL,terms TEXT NOT NULL,created INTEGER NOT NULL,completed INTEGER NOT NULL,CHECK(buyer_id<>seller_id));
CREATE UNIQUE INDEX exclusive_sale ON orders(asset_id) WHERE status IN ('PAID','COMPLETED') AND sale_mode='EXCLUSIVE';
CREATE TABLE ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES wallets(user_id),order_id TEXT REFERENCES orders(id),kind TEXT NOT NULL CHECK(kind IN ('OPENING','PURCHASE','REFUND')),delta INTEGER NOT NULL,balance_before INTEGER NOT NULL CHECK(balance_before>=0),balance_after INTEGER NOT NULL CHECK(balance_after>=0),created INTEGER NOT NULL,CHECK(balance_after=balance_before+delta),UNIQUE(order_id,kind));
CREATE TABLE entitlements(order_id TEXT NOT NULL REFERENCES orders(id),file_id TEXT NOT NULL REFERENCES files(id),buyer_id TEXT NOT NULL,revoked INTEGER,PRIMARY KEY(order_id,file_id));
CREATE TABLE settlements(order_id TEXT PRIMARY KEY REFERENCES orders(id),seller_id TEXT NOT NULL,gross_krw INTEGER NOT NULL,fee_krw INTEGER NOT NULL,net_krw INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('PENDING','CANCELLED')),CHECK(net_krw=gross_krw-fee_krw));
CREATE TABLE events(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),type TEXT NOT NULL,created INTEGER NOT NULL);
`;
module.exports=function createSandboxCommerce(options={}){
 const base=path.join(__dirname,'.sandbox-commerce');fs.mkdirSync(base,{recursive:true});
 let root;
 if(options.resumeRoot){root=fs.realpathSync(options.resumeRoot);if(path.dirname(root)!==fs.realpathSync(base)||!path.basename(root).startsWith('nnx-commerce-sandbox-'))throw Error('INVALID_SANDBOX_ROOT')}
 else root=fs.mkdtempSync(path.join(base,'nnx-commerce-sandbox-'));
 fs.mkdirSync(path.join(root,'files'),{recursive:true});
 const db=new Postgres({pglite:true,pglitePath:path.join(root,'db')});
 if(!options.resumeRoot)db.exec(schema);
 const fail=code=>{throw Error(code)};
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value}catch(error){db.exec('ROLLBACK');throw error}};
 const event=(id,type)=>db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(crypto.randomUUID(),id,type,Date.now());
 const wallet=id=>db.prepare('SELECT balance FROM wallets WHERE user_id=?').get(id)?.balance;
 function addWallet(userId,amount){
  if(typeof userId!=='string'||!userId||!Number.isSafeInteger(amount)||amount<0||amount>1000000000)fail('INVALID_WALLET');
  transaction(()=>{db.prepare('INSERT INTO wallets VALUES(?,?)').run(userId,amount);db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),userId,null,'OPENING',amount,0,amount,Date.now())});
 }
 function addFile(assetId,{name='fixture.txt',kind='original',data=Buffer.from('Sandbox fixture')}={}){
  if(!db.prepare('SELECT id FROM assets WHERE id=?').get(assetId)||!['original','preview'].includes(kind)||!Buffer.isBuffer(data))fail('INVALID_FILE');
  const id=crypto.randomUUID(),sha=crypto.createHash('sha256').update(data).digest('hex');
  fs.writeFileSync(path.join(root,'files',id),data,{flag:'wx'});
  try{db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?)').run(id,assetId,kind,name,data.length,sha)}catch(e){fs.unlinkSync(path.join(root,'files',id));throw e}
  return id;
 }
 function addAsset({id,sellerId,price,saleMode='MULTI',contractVersion='sandbox-contract-v1',files=[]}){
  if(!id||!sellerId||!Number.isSafeInteger(price)||price<1||price>1000000||!['EXCLUSIVE','MULTI'].includes(saleMode)||!contractVersion)fail('INVALID_ASSET');
  db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?)').run(id,sellerId,price,saleMode,'ACTIVE',contractVersion);
  return files.map(file=>addFile(id,file));
 }
 function getOrder(buyerId,id){
  const row=db.prepare('SELECT * FROM orders WHERE id=? AND buyer_id=?').get(id,buyerId);
  if(!row)fail('ORDER_NOT_FOUND');
  return {...row,terms:JSON.parse(row.terms),balance:wallet(buyerId),settlement:db.prepare('SELECT * FROM settlements WHERE order_id=?').get(id)};
 }
 function purchase({buyerId,assetId,requestId,expectedPrice,contractVersion,additionalWork=false}){
  if(typeof requestId!=='string'||!/^sandbox_[0-9a-f-]{36}$/.test(requestId)||additionalWork!==false)fail('INVALID_REQUEST');
  return transaction(()=>{
   const old=db.prepare('SELECT * FROM orders WHERE id=?').get(requestId);
   if(old){if(old.buyer_id!==buyerId||old.asset_id!==assetId||old.price!==expectedPrice||JSON.parse(old.terms).contractVersion!==contractVersion)fail('REQUEST_CONFLICT');return getOrder(buyerId,requestId)}
   const a=db.prepare('SELECT * FROM assets WHERE id=?').get(assetId);
   if(!a||a.status!=='ACTIVE')fail('ASSET_UNAVAILABLE');
   if(a.seller_id===buyerId)fail('SELF_PURCHASE');
   if(a.price!==expectedPrice||a.contract_version!==contractVersion)fail('TERMS_CHANGED');
   if(db.prepare("SELECT id FROM orders WHERE buyer_id=? AND asset_id=? AND status='COMPLETED'").get(buyerId,assetId))fail('ALREADY_PURCHASED');
   const before=wallet(buyerId);if(before===undefined||before<a.price)fail('INSUFFICIENT_BALANCE');
   const files=db.prepare("SELECT * FROM files WHERE asset_id=? AND kind='original' ORDER BY id").all(assetId);
   if(!files.length)fail('NO_DELIVERABLES');
   for(const f of files){const data=fs.readFileSync(path.join(root,'files',f.id));if(data.length!==Number(f.size)||crypto.createHash('sha256').update(data).digest('hex')!==f.sha256)fail('FILE_CHANGED')}
   const now=Date.now(),terms=JSON.stringify({saleMode:a.sale_mode,contractVersion:a.contract_version,priceNeon:a.price,neonKrw:100,feeBps:1200,additionalWork:false,files:files.map(f=>({id:f.id,name:f.name,size:f.size,sha256:f.sha256}))});
   if(a.sale_mode==='EXCLUSIVE'&&db.prepare("UPDATE assets SET status='RESERVED' WHERE id=? AND status='ACTIVE'").run(assetId).changes!==1)fail('ASSET_UNAVAILABLE');
   if(db.prepare('UPDATE wallets SET balance=balance-? WHERE user_id=? AND balance>=?').run(a.price,buyerId,a.price).changes!==1)fail('INSUFFICIENT_BALANCE');
   db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(requestId,'SANDBOX',buyerId,a.seller_id,assetId,'PAID',a.sale_mode,a.price,terms,now,now);
   event(requestId,'PAID');
   db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),buyerId,requestId,'PURCHASE',-a.price,before,before-a.price,now);
   db.prepare("UPDATE orders SET status='COMPLETED' WHERE id=?").run(requestId);event(requestId,'COMPLETED');
   for(const f of files)db.prepare('INSERT INTO entitlements VALUES(?,?,?,NULL)').run(requestId,f.id,buyerId);
   // Integer NEON * 100 KRW * 12% = integer NEON * 12 KRW; no rounding needed here.
   db.prepare('INSERT INTO settlements VALUES(?,?,?,?,?,?)').run(requestId,a.seller_id,a.price*100,a.price*12,a.price*88,'PENDING');
   if(a.sale_mode==='EXCLUSIVE')db.prepare("UPDATE assets SET status='SOLD' WHERE id=?").run(assetId);
   event(requestId,'ENTITLEMENTS_GRANTED');event(requestId,'SETTLEMENT_PENDING');
   return getOrder(buyerId,requestId);
  });
 }
 function download(buyerId,orderId,fileId){
  const f=db.prepare("SELECT f.* FROM files f JOIN entitlements e ON e.file_id=f.id JOIN orders o ON o.id=e.order_id WHERE e.order_id=? AND e.buyer_id=? AND f.id=? AND e.revoked IS NULL AND o.status='COMPLETED' AND o.environment='SANDBOX' AND f.kind='original'").get(orderId,buyerId,fileId);
  if(!f)fail('ACCESS_DENIED');
  const data=fs.readFileSync(path.join(root,'files',f.id));if(crypto.createHash('sha256').update(data).digest('hex')!==f.sha256)fail('FILE_CHANGED');
  return {name:f.name,data};
 }
 function refund(buyerId,orderId){return transaction(()=>{
  const o=getOrder(buyerId,orderId);if(o.status==='REFUNDED')return o;
  if(o.status!=='COMPLETED')fail('INVALID_STATE');
  const before=wallet(buyerId),now=Date.now();
  db.prepare('UPDATE wallets SET balance=balance+? WHERE user_id=?').run(o.price,buyerId);
  db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),buyerId,orderId,'REFUND',o.price,before,before+o.price,now);
  db.prepare("UPDATE orders SET status='REFUNDED' WHERE id=?").run(orderId);
  db.prepare('UPDATE entitlements SET revoked=? WHERE order_id=?').run(now,orderId);
  db.prepare("UPDATE settlements SET status='CANCELLED' WHERE order_id=?").run(orderId);event(orderId,'REFUNDED');
  // Exclusive resale remains blocked until a future administrator review flow exists.
  return getOrder(buyerId,orderId);
 })}
 return {root,db,addWallet,addAsset,addFile,purchase,getOrder,download,refund,close:()=>db.close()};
};
module.exports.schema=schema;
