'use strict';
// Explicit backend binding only. No connection strings, provider keys or fixture creation.
module.exports=function({user,json,origin,isAdmin=require('./admin-policy.cjs')}){
 let services=null;
 function configure(value){if(services)throw Error('ENGINE_ALREADY_BOUND');if(value?.environment!=='SANDBOX'||value?.billing!=='SIMULATED_NO_CHARGE'||!value.work||['state','act','download'].some(k=>typeof value.work[k]!=='function')||!value.subscription||['state','act'].some(k=>typeof value.subscription[k]!=='function'))throw Error('EXPLICIT_TEST_ENGINE_REQUIRED');services=value;}
 const status=()=>({connected:!!services,environment:services?'SANDBOX':null,billing:services?'SIMULATED_NO_CHARGE':null,liveTrading:false,realBilling:false});
 const errors={PLAN_TRIAL_USED:409,PLAN_STATE_CONFLICT:409,PLAN_NOT_DUE:409,PLAN_INVALID_INPUT:400,PLAN_ASSET_CONFLICT:409,PLAN_RENEWAL_RESULT_REQUIRED:409,ACCESS_DENIED:403,PLAN_ACCESS_DENIED:403,INVALID_INPUT:400,INVALID_ACTION:400,INVALID_STATE:409,REQUEST_CONFLICT:409,PLAN_REQUEST_CONFLICT:409,PLAN_KEEP_SELECTION_REQUIRED:409,PLAN_ACTIVE_LIMIT:409,PLAN_PERIOD_ENDED:409,INSUFFICIENT_BALANCE:409,MATERIALS_REQUIRED:409,MATERIALS_LOCKED:409,REFUND_ON_HOLD:409,REVIEW_EXPIRED:409,FILE_CORRUPT:409,STALE_PREVIEW:409,REVISION_NOT_ALLOWED:409,REVISION_LIMIT:409};
 const publicState=async actor=>{
  const state=await services.work.state(actor);if(state.environment!=='SANDBOX'||!Array.isArray(state.orders))throw Error('ENGINE_STATE_INVALID');
  return {environment:'SANDBOX',liveTrading:false,orders:state.orders.filter(o=>o.buyer===actor||o.seller===actor).map(o=>({id:o.id,buyer:o.buyer,seller:o.seller,status:o.status,price:o.price,delivery:o.delivery,reviewUntil:o.review_until,dueAt:o.due_at,deliverables:o.terms?.deliverables||[],materialFields:(o.terms?.options||[]).map(x=>x.material),materialsSubmitted:!!o.materials,files:(o.files||[]).filter(f=>f.kind!=='FINAL'||o.seller===actor||o.status==='COMPLETED').map(f=>({id:f.id,name:f.name,kind:f.kind,size:f.size,version:f.version})),messages:(o.messages||[]).map(m=>({actor:m.actor,body:m.body,created:m.created}))}))};
 };
 async function handle(req,res,name){
  if(!['/api/auth/engine/status','/api/auth/engine/orders','/api/auth/engine/order-action','/api/auth/engine/file','/api/auth/engine/subscription','/api/auth/engine/subscription-action','/api/auth/engine/subscription-admin','/api/auth/engine/subscription-admin-action'].includes(name))return false;
  const actor=user(req);if(!actor){json(res,401,{error:'로그인이 필요합니다.'});return true;}
  const admin=name.includes('subscription-admin');if(admin&&!isAdmin(actor)){json(res,403,{error:'관리자 권한이 필요합니다.'});return true;}
  if(req.headers.origin&&req.headers.origin!==origin){json(res,403,{error:'요청 출처를 확인해주세요.'});return true;}
  const end=name.split('/').pop();if(end==='status'&&req.method==='GET'){json(res,200,status());return true;}
  if(!services){json(res,503,{error:'ENGINE_NOT_CONNECTED',...status()});return true;}
  try{
   if(req.method==='GET'){
    if(end==='orders'){json(res,200,await publicState(actor.id));return true;}
    if(end==='subscription'){const result=await services.subscription.state(actor.id);if(result.environment!=='SANDBOX'||result.billing!=='SIMULATED_NO_CHARGE')throw Error('ENGINE_STATE_INVALID');json(res,200,result);return true;}
    if(end==='subscription-admin'){if(!services.subscription.worker){json(res,503,{error:'SUBSCRIPTION_WORKER_NOT_CONNECTED'});return true;}json(res,200,await services.subscription.worker.state(actor.id));return true;}
    if(end==='file'){
     const id=new URL(req.url,origin).searchParams.get('id');if(!id||id.length>100){json(res,400,{error:'INVALID_INPUT'});return true;}
     const state=await publicState(actor.id),order=state.orders.find(o=>o.files.some(f=>f.id===id));if(!order){json(res,403,{error:'ACCESS_DENIED'});return true;}
     // Backend rechecks participant, current delivery and non-revoked entitlement on every request.
     const file=await services.work.download(actor.id,id);if(!Buffer.isBuffer(file.data)||file.data.length>300*1024*1024||typeof file.name!=='string')throw Error('ENGINE_FILE_INVALID');
     res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':file.data.length,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(file.data);return true;
    }
   }
   if(req.method!=='POST'||!end.endsWith('action')){json(res,405,{error:'지원하지 않는 요청입니다.'});return true;}
   if(req.headers.origin!==origin){json(res,403,{error:'요청 출처를 확인해주세요.'});return true;}if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){json(res,415,{error:'JSON 요청이 필요합니다.'});return true;}
   let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>16384){json(res,413,{error:'요청이 너무 큽니다.'});return true;}chunks.push(c);}let input;try{input=JSON.parse(Buffer.concat(chunks));}catch{}
   if(!input||Array.isArray(input)||typeof input!=='object'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId||'')||Object.keys(input).some(k=>['actor','buyer','seller','userId','injectFailure','syntheticEvidence','watermarkedFull'].includes(k))){json(res,400,{error:'INVALID_INPUT'});return true;}
   let result;
   if(end==='order-action'){
    const fields={submit:['materials','confirmed'],start:[],message:['body'],error:['reason'],revision:['reason','withinAgreedScope'],confirm:[]};if(!Object.hasOwn(fields,input.action)||Object.keys(input).some(k=>!['requestId','action','orderId',...fields[input.action]].includes(k))){json(res,400,{error:'INVALID_ACTION'});return true;}
    const snapshot=await publicState(actor.id);if(!snapshot.orders.some(o=>o.id===input.orderId)){json(res,403,{error:'ACCESS_DENIED'});return true;}result=await services.work.act(actor.id,input);
   }else if(end==='subscription-action'){
    // Existing TEST plan engine retains state transition, asset selection and idempotency rules.
    const fields={trial:[],cancelAtEnd:[],settleEnd:['keepAssetIds'],reactivate:['assetId'],simulatePaid:['plan','keepAssetIds']};if(!Object.hasOwn(fields,input.action)||Object.keys(input).some(k=>!['requestId','action',...fields[input.action]].includes(k))){json(res,400,{error:'PLAN_INVALID_INPUT'});return true;}result=await services.subscription.act(actor.id,input);
   }else{json(res,503,{error:'SUBSCRIPTION_ADMIN_MUTATION_REQUIRES_DEDICATED_ADAPTER'});return true;}
   json(res,200,{environment:'SANDBOX',realBilling:false,result});
  }catch(error){json(res,errors[error.message]||503,{error:errors[error.message]?error.message:'ENGINE_UNAVAILABLE'});}return true;
 }
 return {handle,configure,status};
};
