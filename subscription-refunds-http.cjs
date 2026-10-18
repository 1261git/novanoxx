'use strict';
module.exports=function({refunds,user,json,origin}){
 return async(req,res,name)=>{
  if(!name.startsWith('/api/auth/subscription-refunds/'))return false;
  try{
   if(!refunds){json(res,503,{error:'REFUND_NOT_CONNECTED'});return true;}
   const actor=user(req);if(!actor){json(res,401,{error:'ACCESS_DENIED'});return true;}
   const end=name.slice('/api/auth/subscription-refunds/'.length);
   if(req.method==='GET'&&['own','admin'].includes(end)){const raw=new URL(req.url,origin).searchParams.get('offset')||'0';if(!/^\d{1,6}$/.test(raw))throw Error('REFUND_INVALID_INPUT');json(res,200,refunds.state(actor.id,{adminView:end==='admin',offset:Number(raw)}));return true;}
   if(req.method!=='POST'){json(res,405,{error:'REFUND_INVALID_INPUT'});return true;}
   if(req.headers.origin!==origin){json(res,403,{error:'ORIGIN_REQUIRED'});return true;}
   if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){json(res,415,{error:'JSON_REQUIRED'});return true;}
   const fields={request:['requestId','subscriptionId','periodStart','amountKrw','reason','confirmed'],review:['id','version','action','amountKrw','rightsAction','reason'],execute:['id','version','confirmed'],reconcile:['id'],close:['id','version','reason'],resolve:['subscriptionId','periodStart','version','expectedRemainingKrw','rightsAction','reason'],recheck:['subscriptionId','periodStart'],'admin-recheck':['subscriptionId','periodStart']};
   if(!fields[end]){json(res,404,{error:'REFUND_INVALID_INPUT'});return true;}
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192){json(res,413,{error:'REFUND_INVALID_INPUT'});return true;}chunks.push(chunk);}
   let i;try{i=JSON.parse(Buffer.concat(chunks));}catch{throw Error('REFUND_INVALID_INPUT');}if(!i||Array.isArray(i)||typeof i!=='object'||Object.keys(i).some(k=>!fields[end].includes(k)))throw Error('REFUND_INVALID_INPUT');
   const value=end==='request'?refunds.request(actor.id,i):end==='review'?refunds.review(actor.id,i):end==='execute'?await refunds.execute(actor.id,i):end==='reconcile'?await refunds.reconcile(actor.id,i.id):end==='close'?await refunds.closeFailed(actor.id,i):end==='resolve'?await refunds.resolve(actor.id,i):await refunds.recheck(actor.id,i,end==='admin-recheck');json(res,200,value);return true;
  }catch(e){const allowed=/^(ACCESS_DENIED|REFUND_|REQUEST_|PAYMENT_|ORIGIN_)/.test(e.message);json(res,e.message==='ACCESS_DENIED'?403:allowed?409:503,{error:allowed?e.message:'REFUND_UNAVAILABLE'});return true;}
 };
};
