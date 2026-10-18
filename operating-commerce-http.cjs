'use strict';
const crypto=require('node:crypto');
module.exports=function({commerce,subscription,user,json,origin}){
 return async(req,res,name)=>{
  if(!name.startsWith('/api/auth/commerce/'))return false;
  try{
   if(name.endsWith('/return')&&req.method==='GET'){
    const q=new URL(req.url,origin).searchParams,data=Object.fromEntries(['id','state','outcome','orderId','amount','paymentKey','authKey','customerKey'].map(k=>[k,q.get(k)]));data.token=data.state;delete data.state;
    if(!/^(live_|subreq_|subcard_)[a-f0-9-]{36}$/i.test(data.id||'')||!/^[A-Za-z0-9_-]{43}$/.test(data.token||'')||!['success','fail'].includes(data.outcome))throw Error('INVALID_INPUT');
    const nonce=crypto.randomBytes(18).toString('base64');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`});
    res.end(`<!doctype html><meta charset="utf-8"><title>NovaNoxX</title><p id="result">NovaNoxX · 확인 중 / Checking</p><a href="/#/orders">NovaNoxX</a><script nonce="${nonce}">const value=${JSON.stringify(data).replaceAll('<','\\u003c')};history.replaceState(null,'','/api/auth/commerce/return');fetch('/api/auth/commerce/return',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);location.replace('/?payment_result='+encodeURIComponent(data.state)+'#/'+(data.kind==='SUBSCRIPTION'?'creator-plan':'orders'));}).catch(e=>{document.getElementById('result').textContent='확인이 필요합니다. 중복 결제를 진행하지 마세요. / Confirmation required. Do not pay again. '+e.message;});</script>`);return true;
   }
   const actor=user(req);if(!actor){json(res,401,{error:'ACCESS_DENIED'});return true;}
   if(name.endsWith('/status')&&req.method==='GET'){json(res,200,{realBilling:commerce.enabled(),subscriptionBilling:subscription.enabled(),plans:require('./commerce-quote.cjs').plans,checkouts:commerce.state(actor.id)});return true;}
   if(name.endsWith('/settlements')&&req.method==='GET'){json(res,200,{automaticPayout:false,rows:commerce.settlementState(actor.id)});return true;}
   if(req.method!=='POST'||req.headers.origin!==origin){json(res,403,{error:'ORIGIN_REQUIRED'});return true;}if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){json(res,415,{error:'JSON_REQUIRED'});return true;}
   let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>8192)throw Error('INVALID_INPUT');chunks.push(c);}let i;try{i=JSON.parse(Buffer.concat(chunks));}catch{throw Error('INVALID_INPUT');}if(!i||typeof i!=='object'||Array.isArray(i))throw Error('INVALID_INPUT');
   const end=name.split('/').pop(),fields={checkout:['requestId','kind','plan','assetId','optionKeys','expectedTotal','expectedDays','expectedFulfillment','purchaseCountry','briefId','version','offerVersion','contractMode','contractVersion','confirmed','expectedNeon'],start:['id','agreed','policyVersion'],'subscription-retry':['requestId','sourcePeriod','expectedAmount','agreed','policyVersion'],'subscription-reconcile':[],recover:['id'],reconcile:['id'],return:['id','token','outcome','orderId','amount','paymentKey','authKey','customerKey']};if(!fields[end]||Object.keys(i).some(k=>!fields[end].includes(k)))throw Error('INVALID_INPUT');
   const service=(end==='checkout'?['SUBSCRIPTION','CARD_UPDATE'].includes(i.kind):/^sub(req|card)_/.test(String(i.id)))?subscription:commerce;
   const result=end==='subscription-retry'?await subscription.retry(actor.id,i):end==='subscription-reconcile'?await subscription.reconcile(actor.id):end==='recover'?await commerce.recover(actor.id,i.id):end==='reconcile'?await commerce.reconcilePayment(actor.id,i.id):end==='checkout'?service.create(actor.id,i):end==='start'?service.start(actor.id,i,origin):await service.confirm(actor.id,i);json(res,200,result);return true;
  }catch(e){const code=e.message,allowed=/^(ACCESS_DENIED|INVALID_|PLAN_|PAYMENT_|BILLING_|LIVE_|CHECKOUT_|PRICE_|TERMS_|REQUEST_|ASSET_|OPERATING_)/.test(code);json(res,code==='ACCESS_DENIED'?403:allowed?409:503,{error:allowed?code:'COMMERCE_UNAVAILABLE'});return true;}
 };
};
