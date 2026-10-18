'use strict';
const crypto=require('node:crypto');
module.exports=function({db,clock=Date.now,env=process.env}){
 const ready=!!db.prepare("SELECT version FROM nnx_operating_v1.schema_version WHERE version='OPERATING_NOTIFICATIONS_V1'").get();
 if(!ready&&env.NNX_LIVE_PAYMENTS==='1')throw Error('OPERATING_NOTIFICATION_SCHEMA_REQUIRED');
 function emit({kind,reference,source}){
  if(!ready)return;
  if(!['ORDER','DELIVERY','REFUND','ORDER_UPDATE','PAYOUT','SUBSCRIPTION'].includes(kind)||typeof reference!=='string'||reference.length>100||typeof source!=='string'||source.length>180)throw Error('OPERATING_NOTIFICATION_INVALID');
  let ids=[];
  if(kind==='PAYOUT'){const p=db.prepare('SELECT seller_id FROM nnx_operating_v1.payouts WHERE id=?').get(reference);if(p)ids=[p.seller_id];}
  else if(kind==='SUBSCRIPTION'){const s=db.prepare('SELECT user_id FROM nnx_operating_v1.subscriptions WHERE id=?').get(reference);if(s)ids=[s.user_id];}
  else{const o=db.prepare("SELECT o.buyer_id,o.seller_id FROM nnx_operating_v1.orders o JOIN nnx_operating_v1.payments p ON p.order_id=o.id WHERE o.id=? AND p.environment='LIVE' AND p.state IN ('APPROVED','REFUNDED')").get(reference);if(o)ids=[o.buyer_id,o.seller_id];}
  for(const id of new Set(ids))db.prepare("INSERT INTO nnx_operating_v1.notification_outbox(id,source_key,recipient_id,kind,reference_id,created) VALUES(?,?,?,?,?,?) ON CONFLICT(source_key) DO NOTHING").run(crypto.randomUUID(),'operating:'+source+':'+id,id,kind,reference,clock());
 }
 function sync(mail){if(!ready||!mail)return {queued:0};let queued=0;mail.tx(()=>{
  for(const r of db.prepare("SELECT * FROM nnx_operating_v1.notification_outbox WHERE state='PENDING' ORDER BY created,id LIMIT 25").all()){
   const restricted=db.prepare('SELECT state FROM member_restrictions WHERE user_id=?').get(r.recipient_id);
   const skipped=['WITHDRAWN','SUSPENDED'].includes(restricted?.state);
   const id=skipped?null:mail.notificationInside({sourceKey:r.source_key,userId:r.recipient_id,kind:r.kind,orderId:r.reference_id});
   db.prepare('UPDATE nnx_operating_v1.notification_outbox SET state=?,processed=? WHERE id=?').run(id?'QUEUED':'SKIPPED',clock(),r.id);if(id)queued++;
  }
 });return {queued};}
 return {emit,sync,ready};
};
