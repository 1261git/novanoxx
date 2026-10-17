'use strict';
const plans=Object.freeze({PLUS:{amount:3000,limit:3},ULTRA:{amount:6900,limit:7},PRO:{amount:9900,limit:null}});
module.exports=({db,fail,version,allowReserved=()=>false})=>{return function quote(actor,i){
  if(i.kind==='SUBSCRIPTION'){
   const p=Object.hasOwn(plans,i.plan)?plans[i.plan]:null;if(!p)fail('INVALID_INPUT');return {kind:i.kind,amount:p.amount,title:'NovaNoxX '+i.plan,plan:i.plan,activeLimit:p.limit,period:'MONTHLY',cancel:'CANCEL_BEFORE_NEXT_CHARGE',provider:'NovaNoxx(노바녹스)',policyVersion:version};
  }
  if(i.kind!=='ASSET'||!Number.isSafeInteger(i.assetId)||i.assetId<1001)fail('INVALID_INPUT');
  const rows=db.prepare('SELECT a.* FROM creator_assets a JOIN catalog_links l ON l.asset_id=a.id WHERE l.public_id=? LIMIT 2').all(i.assetId-1000),a=rows.length===1?rows[0]:null;
  if(!a||!require('./catalog-publication.cjs')(db).visible(a.id)||!(a.status==='ACTIVE'||a.status==='RESERVED'&&allowReserved(actor,i,a))||a.user_id===actor.id)fail('ASSET_UNAVAILABLE',409);
  const m=JSON.parse(a.metadata);if(!Number.isSafeInteger(m.price)||m.price<1||!['EXCLUSIVE','MULTI'].includes(m.saleMode)||m.rightsConfirmed!==true||m.contract?.sellerId!==a.user_id||m.contract?.mode!==m.saleMode||m.contract?.version!=='2026-10-11-v1')fail('INVALID_INPUT');
  if(!Array.isArray(i.optionKeys)||i.optionKeys.length>9||new Set(i.optionKeys).size!==i.optionKeys.length||i.optionKeys.some(k=>!['character','productModel','background','object','logo','brandName','copy','color','other'].includes(k)||!(k==='other'?m.customizationOther:m.customization?.[k])))fail('INVALID_INPUT');
  const q=require('./assets/option-quote.js').quote(m,i.optionKeys),amount=q.total*100;
  if(!Number.isSafeInteger(amount)||amount<100||i.expectedTotal!==q.total||i.expectedDays!==q.days)fail('PRICE_CHANGED',409);
  const seller=db.prepare('SELECT id,name FROM users WHERE id=?').get(a.user_id);if(!seller)fail('ASSET_UNAVAILABLE',409);
  if(db.prepare("SELECT state FROM member_restrictions WHERE user_id=?").get(a.user_id)?.state==='SUSPENDED')fail('ASSET_UNAVAILABLE',409);
  return {kind:i.kind,amount,title:m.title,sellerId:a.user_id,sellerName:seller.name,assetId:a.id,publicId:i.assetId,optionKeys:i.optionKeys,days:q.days,fulfillment:m.fulfillment==='REGISTERED_INSTANT'&&!i.optionKeys.length?'REGISTERED_INSTANT':'WORKFLOW',contract:m.contract,deliverables:m.deliverables,rightsExclusions:m.rightsExclusions||'',saleMode:m.saleMode,policyVersion:version};
 };};
module.exports.plans=plans;
