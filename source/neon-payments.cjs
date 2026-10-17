const crypto=require('node:crypto');
module.exports=function(db,user,json,options={}){
 const env=options.env||process.env,base=require('./deployment-config.cjs').base,request=options.fetch||fetch;
 db.exec("CREATE TABLE IF NOT EXISTS neon_topups(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,neon INTEGER NOT NULL,amount INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'PENDING',payment_key TEXT UNIQUE,created INTEGER NOT NULL,paid INTEGER); CREATE TABLE IF NOT EXISTS neon_test_wallet(user_id TEXT PRIMARY KEY,balance INTEGER NOT NULL DEFAULT 0);");
 db.exec('CREATE TABLE IF NOT EXISTS neon_test_grants(campaign TEXT NOT NULL,user_id TEXT NOT NULL,neon INTEGER NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(campaign,user_id))');
 if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get())require('./admin-test-grant.cjs')(db);
 const ready=()=>/^test_ck_/.test(env.TOSS_CLIENT_KEY||'')&&/^test_sk_/.test(env.TOSS_SECRET_KEY||'');
 const balance=id=>db.prepare('SELECT balance FROM neon_test_wallet WHERE user_id=?').get(id)?.balance||0;
 db.exec('CREATE TABLE IF NOT EXISTS neon_test_orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,asset_id INTEGER NOT NULL,title TEXT NOT NULL,price INTEGER NOT NULL,created INTEGER NOT NULL,UNIQUE(user_id,asset_id)); CREATE TABLE IF NOT EXISTS neon_test_ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,order_id TEXT UNIQUE NOT NULL,delta INTEGER NOT NULL,balance_before INTEGER NOT NULL,balance_after INTEGER NOT NULL,created INTEGER NOT NULL);');
 async function pg(url,method,data,id){const r=await request('https://api.tosspayments.com/v1/payments/'+url,{method,headers:{Authorization:'Basic '+Buffer.from(env.TOSS_SECRET_KEY+':').toString('base64'),'Content-Type':'application/json',...(id?{'Idempotency-Key':id}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});const value=await r.json();return {ok:r.ok,value};}
 return async(req,res,name)=>{
  if(!name.startsWith('/api/auth/neon/'))return false;
  const u=user(req);if(!u){json(res,401,{error:'로그인이 필요해요.'});return true;}
  if(name==='/api/auth/neon/orders'&&req.method==='GET'){json(res,200,{testBalance:balance(u.id),orders:db.prepare('SELECT id,asset_id AS assetId,title,price,created FROM neon_test_orders WHERE user_id=? ORDER BY created DESC').all(u.id)});return true;}
  if(name==='/api/auth/neon/status'&&req.method==='GET'){json(res,200,{mode:'test',ready:ready(),testBalance:balance(u.id),history:db.prepare("SELECT neon,amount,paid,kind FROM (SELECT neon,amount,paid,'payment' AS kind FROM neon_topups WHERE user_id=? AND state='PAID' UNION ALL SELECT neon,0 AS amount,created AS paid,'admin' AS kind FROM neon_test_grants WHERE user_id=?) ORDER BY paid DESC LIMIT 20").all(u.id,u.id)});return true;}
  if(req.method!=='POST'||req.headers.origin!==base){json(res,403,{error:'요청 출처를 확인해주세요.'});return true;}
  if(!ready()){json(res,503,{error:'테스트 결제 연결을 준비 중이에요.'});return true;}
  let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>4096){json(res,413,{error:'요청이 너무 커요.'});return true;}chunks.push(c);}let d;try{d=JSON.parse(Buffer.concat(chunks))}catch{json(res,400,{error:'입력값을 확인해주세요.'});return true;}
  if(name==='/api/auth/neon/purchase'){
   if(!Number.isSafeInteger(d.assetId)||typeof d.requestId!=='string'||!/^buy_[0-9a-f-]{36}$/.test(d.requestId)){json(res,400,{error:'구매 요청을 확인해주세요.'});return true;}
   db.exec('BEGIN IMMEDIATE');try{
    const existing=db.prepare('SELECT * FROM neon_test_orders WHERE id=?').get(d.requestId);if(existing){db.exec('ROLLBACK');json(res,existing.user_id===u.id&&existing.asset_id===d.assetId?200:409,existing.user_id===u.id&&existing.asset_id===d.assetId?{ok:true,orderId:existing.id,testBalance:balance(u.id)}:{error:'다른 구매에 사용된 요청이에요.'});return true;}
    let asset=require('./test-purchase-assets.json').find(a=>a.id===d.assetId);
    if(d.assetId>=1001){const row=db.prepare("SELECT a.metadata,a.status FROM creator_assets a JOIN catalog_links c ON c.asset_id=a.id WHERE c.public_id=?").get(d.assetId-1000);if(row){const m=JSON.parse(row.metadata);asset={id:d.assetId,title:m.title,price:m.price,sold:row.status!=='ACTIVE'};}}
    if(!asset||asset.sold){db.exec('ROLLBACK');json(res,409,{error:'구매 가능한 에셋이 아니에요.'});return true;}
    if(db.prepare('SELECT id FROM neon_test_orders WHERE user_id=? AND asset_id=?').get(u.id,d.assetId)){db.exec('ROLLBACK');json(res,409,{error:'이미 테스트 구매한 에셋이에요. 주문 내역에서 확인해주세요.'});return true;}
    const before=balance(u.id);if(before<asset.price){db.exec('ROLLBACK');json(res,409,{error:'테스트 NEON 잔액이 부족해요. 테스트 충전 후 구매해주세요.'});return true;}
    const now=Date.now();db.prepare('UPDATE neon_test_wallet SET balance=balance-? WHERE user_id=? AND balance>=?').run(asset.price,u.id,asset.price);db.prepare('INSERT INTO neon_test_orders VALUES(?,?,?,?,?,?)').run(d.requestId,u.id,asset.id,asset.title,asset.price,now);db.prepare('INSERT INTO neon_test_ledger VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),u.id,d.requestId,-asset.price,before,before-asset.price,now);options.notify?.({sourceKey:'neon-purchase:'+d.requestId,userId:u.id,kind:'ORDER',orderId:d.requestId});db.exec('COMMIT');json(res,200,{ok:true,orderId:d.requestId,testBalance:balance(u.id)});
   }catch(e){db.exec('ROLLBACK');throw e;}return true;
  }
  if(name==='/api/auth/neon/order'){
   if(![100,300,500,1000].includes(d.neon)){json(res,400,{error:'충전 수량을 선택해주세요.'});return true;}
   if(db.prepare('SELECT COUNT(*) AS n FROM neon_topups WHERE user_id=? AND created>?').get(u.id,Date.now()-60000).n>=10){json(res,429,{error:'잠시 후 다시 시도해주세요.'});return true;}
   const id='nnx_'+crypto.randomUUID();db.prepare('INSERT INTO neon_topups(id,user_id,neon,amount,created) VALUES(?,?,?,?,?)').run(id,u.id,d.neon,d.neon*100,Date.now());json(res,200,{id,neon:d.neon,amount:d.neon*100,clientKey:env.TOSS_CLIENT_KEY,customerKey:'nnx_'+crypto.createHash('sha256').update(u.id).digest('hex').slice(0,40),successUrl:base+'/?neon_result=success',failUrl:base+'/?neon_result=fail'});return true;
  }
  if(name==='/api/auth/neon/confirm'){
   const order=db.prepare('SELECT * FROM neon_topups WHERE id=? AND user_id=?').get(typeof d.orderId==='string'?d.orderId:'',u.id);
   if(!order){json(res,404,{error:'충전 주문을 찾을 수 없어요.'});return true;}
   if(!Number.isSafeInteger(d.amount)||d.amount!==order.amount||typeof d.paymentKey!=='string'||d.paymentKey.length<1||d.paymentKey.length>200){json(res,400,{error:'결제 정보가 주문과 일치하지 않아요.'});return true;}
   if(order.state==='PAID'){if(order.payment_key!==d.paymentKey){json(res,409,{error:'이미 처리된 주문이에요.'});return true;}json(res,200,{ok:true,testBalance:balance(u.id)});return true;}
   if(order.payment_key&&order.payment_key!==d.paymentKey){json(res,409,{error:'다른 결제로 처리 중인 주문이에요.'});return true;}
   try{db.prepare('UPDATE neon_topups SET payment_key=? WHERE id=? AND payment_key IS NULL').run(d.paymentKey,order.id);}catch{json(res,409,{error:'이미 사용한 결제 정보예요.'});return true;}
   try{
    let result=await pg('confirm','POST',{paymentKey:d.paymentKey,orderId:order.id,amount:order.amount},order.id);
    if(!result.ok)result=await pg(encodeURIComponent(d.paymentKey),'GET');
    const p=result.value;if(!result.ok||p.status!=='DONE'||p.orderId!==order.id||p.paymentKey!==d.paymentKey||p.totalAmount!==order.amount||p.balanceAmount!==order.amount||p.currency!=='KRW'){json(res,400,{error:'결제 승인을 확인하지 못했어요. 잔액은 지급되지 않았습니다.'});return true;}
    db.exec('BEGIN IMMEDIATE');try{const changed=db.prepare("UPDATE neon_topups SET state='PAID',paid=? WHERE id=? AND state='PENDING'").run(Date.now(),order.id).changes;if(changed){db.prepare('INSERT INTO neon_test_wallet(user_id,balance) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET balance=neon_test_wallet.balance+excluded.balance').run(u.id,order.neon);options.notify?.({sourceKey:'neon-topup:'+order.id,userId:u.id,kind:'ORDER_UPDATE',orderId:order.id});}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    json(res,200,{ok:true,testBalance:balance(u.id)});
   }catch{json(res,503,{error:'결제 확인이 지연되고 있어요. 같은 주문으로 다시 확인해주세요.'});}return true;
  }
  json(res,404,{error:'지원하지 않는 요청이에요.'});return true;
 };
};
