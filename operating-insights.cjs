'use strict';
const ms=v=>typeof v==='number'?v:new Date(v).getTime();
function activeDuration(published,paid,events){if(!Number.isFinite(published)||!Number.isFinite(paid)||paid<published)return null;let state='ACTIVE',at=published,total=0;for(const e of events.filter(e=>e.at>=published&&e.at<paid).sort((a,b)=>a.at-b.at)){if(state==='ACTIVE')total+=e.at-at;state=e.state;at=e.at;}if(state==='ACTIVE')total+=paid-at;return total;}
module.exports=function({db,clock=Date.now}){
 return function insights(days){const from=new Date(clock()-days*86400000).toISOString();
  const orders=db.prepare("SELECT o.*,p.approved_at,COALESCE(s.refunded_krw,0) refunded_krw FROM nnx_operating_v1.orders o JOIN nnx_operating_v1.payments p ON p.order_id=o.id LEFT JOIN nnx_operating_v1.payment_sync s ON s.order_id=o.id WHERE p.environment='LIVE' AND p.state IN ('APPROVED','REFUNDED') AND p.approved_at>=? ORDER BY p.approved_at,o.id").all(from);
  const mean=a=>a.length?a.reduce((n,v)=>n+v,0)/a.length:null,completion={MARKETPLACE:[],BRIEF:[]},available=[];let incomplete=0;
  const allEvents=db.prepare('SELECT order_id,kind,created FROM engine_events WHERE created>=? ORDER BY created,id').all(new Date(from).getTime());
  for(const o of orders){const approved=ms(o.approved_at);if(o.state!=='COMPLETED')continue;
   const end=allEvents.find(e=>e.order_id===o.id&&e.kind==='COMPLETED'&&Number(e.created)>=approved);if(end)completion[o.source_kind]?.push(Number(end.created)-approved);else incomplete++;
   if(o.source_kind!=='MARKETPLACE'||!o.asset_id)continue;const asset=db.prepare('SELECT metadata FROM creator_assets WHERE id=?').get(o.asset_id),meta=asset&&(typeof asset.metadata==='string'?JSON.parse(asset.metadata):asset.metadata);if(meta?.saleMode==='MULTI')continue;
   // A previous paid reservation/refund needs a complete availability timeline.
   // Legacy records do not prove its exact reopening time; exclude that sample.
   if(db.prepare("SELECT p.id FROM nnx_operating_v1.orders o JOIN nnx_operating_v1.payments p ON p.order_id=o.id WHERE o.asset_id=? AND o.id<>? AND p.environment='LIVE' AND p.approved_at<? LIMIT 1").get(o.asset_id,o.id,o.approved_at)){incomplete++;continue;}
   const first=db.prepare("SELECT MIN(occurred) at FROM review_audit WHERE asset_id=? AND decision='approve'").get(o.asset_id)?.at;if(first==null){incomplete++;continue;}
   const history=db.prepare('SELECT after_state,created FROM creator_review_events WHERE asset_id=? ORDER BY created,id').all(o.asset_id).map(e=>({state:e.after_state,at:Number(e.created)}));
   const duration=activeDuration(Number(first),approved,history);if(duration!==null)available.push(duration);else incomplete++;
  }
  const gross=orders.reduce((n,o)=>n+Number(o.amount_krw),0),refunds=orders.reduce((n,o)=>n+Number(o.refunded_krw),0);
  const fees=orders.filter(o=>o.state!=='REFUNDED').reduce((n,o)=>n+Number(o.fee_krw),0);
  const cohort=db.prepare("SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN p.state IN ('APPROVED','REFUNDED') THEN 1 ELSE 0 END),0) paid FROM nnx_operating_v1.orders o JOIN nnx_operating_v1.payments p ON p.order_id=o.id WHERE p.environment='LIVE' AND o.created_at>=?").get(from);
  const plans=db.prepare("SELECT plan,COUNT(*) count FROM nnx_operating_v1.subscriptions WHERE state='ACTIVE' GROUP BY plan ORDER BY plan").all();
  const assets=db.prepare("SELECT a.status,COUNT(*) count FROM creator_assets a LEFT JOIN asset_publication_policy p ON p.asset_id=a.id WHERE COALESCE(p.visibility,'PUBLIC')='PUBLIC' GROUP BY a.status ORDER BY a.status").all();
  const completedFees=orders.filter(o=>o.state==='COMPLETED').reduce((n,o)=>n+Math.floor((Number(o.amount_krw)-Number(o.refunded_krw))*12/100),0);
  const billingReady=!!db.prepare("SELECT to_regclass('nnx_operating_v1.billing_payment_sync') relation").get().relation;
  const billing=billingReady?db.prepare("SELECT COALESCE(SUM(c.amount_krw),0) gross,COALESCE(SUM(COALESCE(s.refunded_krw,0)),0) refunded FROM nnx_operating_v1.subscription_cycles c LEFT JOIN nnx_operating_v1.billing_payment_sync s ON s.payment_key=c.provider_payment_key WHERE c.state='APPROVED' AND c.period_start>=?").get(from):null;
  return {approvedOrders:orders.length,grossKrw:gross,refundedKrw:refunds,netSalesKrw:gross-refunds,completedOrderFeeKrw:completedFees,subscriptionGrossKrw:billing?Number(billing.gross):null,subscriptionRefundedKrw:billing?Number(billing.refunded):null,subscriptionNetKrw:billing?Number(billing.gross)-Number(billing.refunded):null,bookedFeesBeforeRefundAdjustmentKrw:fees,activePlans:plans,assetStates:assets,distinctBuyers:new Set(orders.map(o=>o.buyer_id)).size,distinctSellers:new Set(orders.map(o=>o.seller_id)).size,averagePaidOrderKrw:orders.length?gross/orders.length:null,checkoutCohort:{started:Number(cohort.total),paid:Number(cohort.paid),conversion:Number(cohort.total)?Number(cohort.paid)/Number(cohort.total):null,basis:'ORDER_CREATED_PERIOD_CURRENT_APPROVAL_STATE'},averageExclusiveAvailableMs:mean(available),exclusiveSamples:available.length,averageCompletionMs:{MARKETPLACE:mean(completion.MARKETPLACE),BRIEF:mean(completion.BRIEF)},completionSamples:{MARKETPLACE:completion.MARKETPLACE.length,BRIEF:completion.BRIEF.length},incompleteHistory:incomplete,basis:'LIVE_APPROVED_AT_PERIOD_CURRENT_REFUND_STATUS',estimatedPlatformIncome:false};
 };
};
module.exports.activeDuration=activeDuration;
