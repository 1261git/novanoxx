'use strict';
const crypto=require('node:crypto');
const plans=Object.freeze({PLUS:{amount:3000,limit:3},ULTRA:{amount:6900,limit:7},PRO:{amount:9900,limit:null}});
const version='REVIEW_CHECKOUT_NO_APPROVAL_V1';
module.exports=function({db,user,json,origin,env=process.env,clock=Date.now}){
 if(env.NNX_REVIEW_MODE!=='1'||env.TOSS_SECRET_KEY||env.TOSS_CLIENT_KEY||env.NNX_REVIEW_TOSS_CLIENT_KEY&&!/^test_ck_[A-Za-z0-9_-]+$/.test(env.NNX_REVIEW_TOSS_CLIENT_KEY))throw Error('REVIEW_TEST_CLIENT_KEY_REQUIRED');
 db.exec('CREATE TABLE IF NOT EXISTS review_checkouts(id TEXT PRIMARY KEY,actor TEXT NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL,kind TEXT NOT NULL,amount INTEGER NOT NULL,snapshot TEXT NOT NULL,state TEXT NOT NULL,token_hash TEXT,created INTEGER NOT NULL,expires INTEGER NOT NULL,returned INTEGER,UNIQUE(actor,request_id));');
 const digest=s=>crypto.createHash('sha256').update(s).digest('hex'),fail=(code,status=400)=>{throw Object.assign(Error(code),{status});};
 function member(req){const actor=user(req);if(!actor)fail('ACCESS_DENIED',401);return actor;}
 function response(row){return {id:row.id,kind:row.kind,amount:row.amount,snapshot:JSON.parse(row.snapshot),state:row.state,expires:row.expires,policyVersion:version,reviewOnly:true,approved:false,realBilling:false};}
 function quote(actor,i){
  if(i.kind==='SUBSCRIPTION'){
   const p=Object.hasOwn(plans,i.plan)?plans[i.plan]:null;if(!p)fail('INVALID_INPUT');return {kind:i.kind,amount:p.amount,title:'NovaNoxX '+i.plan,plan:i.plan,activeLimit:p.limit,period:'MONTHLY',cancel:'CANCEL_BEFORE_NEXT_CHARGE',provider:'NovaNoxx(노바녹스)',policyVersion:version};
  }
  if(i.kind!=='ASSET'||!Number.isSafeInteger(i.assetId)||i.assetId<1001)fail('INVALID_INPUT');
  const rows=db.prepare('SELECT a.* FROM creator_assets a JOIN catalog_links l ON l.asset_id=a.id WHERE l.public_id=? LIMIT 2').all(i.assetId-1000),a=rows.length===1?rows[0]:null;
  if(!a||a.status!=='ACTIVE'||a.user_id===actor.id)fail('ASSET_UNAVAILABLE',409);
  const m=JSON.parse(a.metadata);if(!Number.isSafeInteger(m.price)||m.price<1||!['EXCLUSIVE','MULTI'].includes(m.saleMode)||m.rightsConfirmed!==true||m.contract?.sellerId!==a.user_id||m.contract?.mode!==m.saleMode||m.contract?.version!=='2026-10-11-v1')fail('INVALID_INPUT');
  if(!Array.isArray(i.optionKeys)||i.optionKeys.length>9||new Set(i.optionKeys).size!==i.optionKeys.length||i.optionKeys.some(k=>!['character','productModel','background','object','logo','brandName','copy','color','other'].includes(k)||!(k==='other'?m.customizationOther:m.customization?.[k])))fail('INVALID_INPUT');
  const q=require('./assets/option-quote.js').quote(m,i.optionKeys),amount=q.total*100;
  if(!Number.isSafeInteger(amount)||amount<100||i.expectedTotal!==q.total||i.expectedDays!==q.days)fail('PRICE_CHANGED',409);
  const seller=db.prepare('SELECT id,name FROM users WHERE id=?').get(a.user_id);if(!seller)fail('ASSET_UNAVAILABLE',409);
  if(db.prepare("SELECT state FROM member_restrictions WHERE user_id=?").get(a.user_id)?.state==='SUSPENDED')fail('ASSET_UNAVAILABLE',409);
  return {kind:i.kind,amount,title:m.title,sellerId:a.user_id,sellerName:seller.name,assetId:a.id,publicId:i.assetId,optionKeys:i.optionKeys,days:q.days,fulfillment:m.fulfillment==='REGISTERED_INSTANT'&&!i.optionKeys.length?'REGISTERED_INSTANT':'WORKFLOW',contract:m.contract,deliverables:m.deliverables,rightsExclusions:m.rightsExclusions||'',saleMode:m.saleMode,policyVersion:version};
 }
 return async(req,res,name)=>{
  if(!name.startsWith('/api/auth/review/'))return false;
  try{
   if(name==='/api/auth/review/return'&&req.method==='GET'){
    // Cross-site redirects do not carry Strict session cookies. The same-origin POST does.
    const q=new URL(req.url,origin).searchParams,data={id:q.get('id'),token:q.get('state'),outcome:q.get('outcome'),orderId:q.get('orderId'),amount:q.get('amount'),customerKey:q.get('customerKey')};
    if(!/^review_[0-9a-f-]{36}$/.test(data.id||'')||!/^[A-Za-z0-9_-]{43}$/.test(data.token||'')||!['success','fail'].includes(data.outcome))fail('INVALID_INPUT');
    const nonce=crypto.randomBytes(18).toString('base64'),literal=JSON.stringify(data).replaceAll('<','\\u003c');
    const messages={ko:['반환을 확인하고 있습니다. 결제는 승인되지 않았습니다.','로그인 후 심사용 주문서를 다시 열어주세요. 결제는 승인되지 않았습니다.'],en:['Checking the review return. No payment was approved.','Please sign in and reopen the review checkout. No payment was approved.'],es:['Comprobando el retorno de revisión. No se autorizó ningún pago.','Inicia sesión y vuelve a abrir el pago de revisión. No se autorizó ningún pago.'],'zh-Hans':['正在检查审核返回。未批准任何付款。','请登录后重新打开审核支付。未批准任何付款。'],vi:['Đang kiểm tra chuyển về từ xét duyệt. Không có thanh toán nào được phê duyệt.','Vui lòng đăng nhập và mở lại thanh toán xét duyệt. Không có thanh toán nào được phê duyệt.'],de:['Die Rückkehr von der Prüfung wird geprüft. Keine Zahlung wurde freigegeben.','Bitte anmelden und die Prüfzahlung erneut öffnen. Keine Zahlung wurde freigegeben.']};
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`});
    res.end(`<!doctype html><meta charset="utf-8"><title>NovaNoxX</title><p id="result">NovaNoxX · Review</p><a href="/#/creator-plan">NovaNoxX</a><script nonce="${nonce}">const value=${literal},messages=${JSON.stringify(messages)};let language='ko';try{language=localStorage.getItem('nnx-ui-language')||'ko';}catch{}const text=messages[language]||messages.ko;document.documentElement.lang=language;document.getElementById('result').textContent=text[0];history.replaceState(null,'','/api/auth/review/return');fetch('/api/auth/review/return',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}).then(r=>r.json()).then(r=>{if(r.error)throw Error();location.replace('/?review_result='+encodeURIComponent(r.state)+'#/'+(r.kind==='SUBSCRIPTION'?'creator-plan':'orders'));}).catch(()=>{document.getElementById('result').textContent=text[1];});</script>`);return true;
   }
   const actor=member(req);
   if(name==='/api/auth/review/status'&&req.method==='GET'){json(res,200,{reviewOnly:true,ready:!!env.NNX_REVIEW_TOSS_CLIENT_KEY,plans,checkouts:db.prepare('SELECT * FROM review_checkouts WHERE actor=? ORDER BY created DESC,id LIMIT 20').all(actor.id).map(response)});return true;}
   if(req.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
   if(req.headers.origin!==origin)fail('ORIGIN_REQUIRED',403);
   if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')fail('JSON_REQUIRED',415);
   let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>4096)fail('BODY_TOO_LARGE',413);chunks.push(c);}let i;try{i=JSON.parse(Buffer.concat(chunks));}catch{fail('INVALID_INPUT');}
   if(!i||typeof i!=='object'||Array.isArray(i))fail('INVALID_INPUT');
   if(name==='/api/auth/review/checkout'){
    if(!/^[0-9a-f-]{36}$/.test(i.requestId||'')||Object.keys(i).some(k=>!['kind','plan','assetId','optionKeys','expectedTotal','expectedDays','requestId'].includes(k)))fail('INVALID_INPUT');
    const existing=db.prepare('SELECT * FROM review_checkouts WHERE actor=? AND request_id=?').get(actor.id,i.requestId),payload=JSON.stringify(i);
    if(existing){if(existing.payload!==payload)fail('REQUEST_CONFLICT',409);json(res,200,response(existing));return true;}
    if(db.prepare('SELECT COUNT(*) n FROM review_checkouts WHERE actor=? AND created>?').get(actor.id,clock()-60000).n>=10)fail('RATE_LIMITED',429);
    const snap=quote(actor,i),id='review_'+crypto.randomUUID(),now=clock();db.prepare('INSERT INTO review_checkouts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,actor.id,i.requestId,payload,snap.kind,snap.amount,JSON.stringify(snap),'PREPARED',null,now,now+1800000,null);
    json(res,200,response(db.prepare('SELECT * FROM review_checkouts WHERE id=?').get(id)));return true;
   }
   if(!['/api/auth/review/start','/api/auth/review/return'].includes(name))fail('NOT_FOUND',404);
   const row=db.prepare('SELECT * FROM review_checkouts WHERE id=? AND actor=?').get(i.id,actor.id);if(!row)fail('NOT_FOUND',404);if(clock()>row.expires)fail('CHECKOUT_EXPIRED',409);
   if(name.endsWith('/start')){
    if(Object.keys(i).some(k=>!['id','agreed','policyVersion'].includes(k))||i.agreed!==true||i.policyVersion!==version)fail('TERMS_REQUIRED');
    if(!env.NNX_REVIEW_TOSS_CLIENT_KEY)fail('REVIEW_KEY_REQUIRED',503);
    if(!['PREPARED','STARTED'].includes(row.state))fail('CHECKOUT_CLOSED',409);
    const snap=quote(actor,JSON.parse(row.payload));if(JSON.stringify(snap)!==row.snapshot)fail('PRICE_CHANGED',409);
    const token=crypto.randomBytes(32).toString('base64url'),key='review_'+digest(row.id+':'+actor.id).slice(0,40),url=outcome=>origin+'/api/auth/review/return?id='+encodeURIComponent(row.id)+'&state='+encodeURIComponent(token)+'&outcome='+outcome;
    db.prepare("UPDATE review_checkouts SET state='STARTED',token_hash=? WHERE id=? AND actor=?").run(digest(token),row.id,actor.id);
    json(res,200,{...response({...row,state:'STARTED'}),clientKey:env.NNX_REVIEW_TOSS_CLIENT_KEY,customerKey:key,successUrl:url('success'),failUrl:url('fail')});return true;
   }
   if(Object.keys(i).some(k=>!['id','token','outcome','orderId','amount','customerKey'].includes(k))||!/^[A-Za-z0-9_-]{43}$/.test(i.token||''))fail('INVALID_INPUT');
   if(row.token_hash!==digest(i.token))fail('RETURN_STATE_INVALID',403);
   if(!['success','fail'].includes(i.outcome))fail('INVALID_INPUT');
   if(i.outcome==='success'&&(row.kind==='ASSET'?(i.orderId!==row.id||String(i.amount)!==String(row.amount)):i.customerKey!=='review_'+digest(row.id+':'+actor.id).slice(0,40)))fail('RETURN_DETAILS_MISMATCH',409);
   const state=i.outcome==='success'?'RETURNED_UNVERIFIED_NO_APPROVAL':'CANCELED_NO_APPROVAL';
   if(row.state!==state){if(row.state!=='STARTED')fail('CHECKOUT_CLOSED',409);db.prepare('UPDATE review_checkouts SET state=?,returned=? WHERE id=? AND actor=?').run(state,clock(),row.id,actor.id);}
   // No payment confirm, billing key issuance, plan activation, wallet credit or entitlement grant.
   json(res,200,response({...row,state}));return true;
  }catch(error){json(res,error.status||503,{error:error.status?error.message:'REVIEW_UNAVAILABLE',approved:false,realBilling:false});return true;}
 };
};
module.exports.plans=plans;
