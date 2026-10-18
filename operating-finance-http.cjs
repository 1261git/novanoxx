'use strict';
module.exports=function({finance,user,json,origin}){
 let minute=0,received=0;
 return async(req,res,name)=>{
  if(!name.startsWith('/api/auth/finance/'))return false;
  try{
   if(!finance){json(res,503,{error:'FINANCE_NOT_CONNECTED'});return true;}
   const end=name.slice('/api/auth/finance/'.length),paths=['webhook','status','seller','buyer','admin','refunds','refund-request','refund-review','refund-execute','refund-reconcile','refund-close','sync'];if(!paths.includes(end)){json(res,404,{error:'INVALID_INPUT'});return true;}
   if(end==='webhook'){const now=Math.floor(Date.now()/60000);if(now!==minute){minute=now;received=0;}if(++received>30){json(res,429,{error:'WEBHOOK_BUSY'});return true;}}
   const actor=end==='webhook'?null:user(req);if(end!=='webhook'&&!actor){json(res,401,{error:'ACCESS_DENIED'});return true;}
   if(req.method==='GET'&&end!=='webhook'){
    const q=new URL(req.url,origin).searchParams,offset=q.get('offset')||'0';if(!/^\d{1,6}$/.test(offset))throw Error('INVALID_INPUT');const i={offset:Number(offset),q:q.get('q')||'',view:q.get('view')||'orders'};
    const result=end==='status'?finance.status():end==='seller'?finance.seller(actor.id,i):end==='buyer'?finance.buyer(actor.id,i):end==='admin'?finance.adminState(actor.id,i):end==='refunds'?finance.refunds(actor.id,i):null;if(!result){json(res,405,{error:'INVALID_INPUT'});return true;}json(res,200,result);return true;
   }
   if(req.method!=='POST'){json(res,405,{error:'INVALID_INPUT'});return true;}if(end!=='webhook'&&req.headers.origin!==origin){json(res,403,{error:'ORIGIN_REQUIRED'});return true;}if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){json(res,415,{error:'JSON_REQUIRED'});return true;}
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>(end==='webhook'?32768:8192)){json(res,413,{error:'INVALID_INPUT'});return true;}chunks.push(chunk);}let i;try{i=JSON.parse(Buffer.concat(chunks));}catch{throw Error('INVALID_INPUT');}if(!i||Array.isArray(i)||typeof i!=='object')throw Error('INVALID_INPUT');if(end==='webhook'){json(res,200,finance.receive(i,req.headers));return true;}
   const fields={'refund-request':['requestId','orderId','amountKrw','reason'],'refund-review':['requestId','id','version','action','reason','rightsAction'],'refund-execute':['requestId','id','version','confirmed'],'refund-reconcile':['id'],'refund-close':['requestId','id','version','confirmed','reason'],sync:['orderId']};if(!fields[end]||Object.keys(i).some(k=>!fields[end].includes(k)))throw Error('INVALID_INPUT');
   const result=end==='refund-request'?finance.request(actor.id,i):end==='refund-review'?finance.review(actor.id,i):end==='refund-execute'?await finance.execute(actor.id,i):end==='refund-close'?await finance.closeFailed(actor.id,i):end==='refund-reconcile'?await finance.reconcileRefund(actor.id,i.id):await finance.adminSync(actor.id,i.orderId);json(res,200,result);return true;
  }catch(e){const code=e.message,allowed=/^(ACCESS_DENIED|INVALID_|ORIGIN_|REFUND_|REQUEST_|PAYMENT_|LIVE_|WEBHOOK_|FINANCE_)/.test(code);json(res,code==='ACCESS_DENIED'?403:code==='WEBHOOK_BUSY'?503:allowed?409:503,{error:allowed?code:'FINANCE_UNAVAILABLE'});return true;}
 };
};
