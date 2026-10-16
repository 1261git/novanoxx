'use strict';
// Read existing transactional notification sources. Never changes business rows/inbox.
module.exports=async function create({mail,pool}){
 const source='operations-v1';
 const exists=mail.db.prepare('SELECT cursor FROM mail_source_cursors WHERE source=?').get(source);
 if(!exists){const max=Number((await pool.query('SELECT COALESCE(MAX(id),0) AS id FROM nnx_operations_test.outbox')).rows[0].id);mail.tx(()=>mail.db.prepare('INSERT OR IGNORE INTO mail_source_cursors VALUES(?,?)').run(source,max));}
 async function sync(){const cursor=mail.db.prepare('SELECT cursor FROM mail_source_cursors WHERE source=?').get(source).cursor;
  const rows=(await pool.query('SELECT id,source,event_id,recipient,order_id,kind FROM nnx_operations_test.outbox WHERE id>$1 ORDER BY id LIMIT 100',[cursor])).rows;
  for(const r of rows){
   const kind=/REFUND/.test(r.kind)?'REFUND':/DELIVER|PREVIEW|REVIEW/.test(r.kind)?'DELIVERY':/PAID|PURCHASE|CREATED/.test(r.kind)?'ORDER':'ORDER_UPDATE';
   mail.notification({sourceKey:'operations:'+r.id,userId:r.recipient,kind,orderId:r.order_id});
   // Receipt first; crash before this step safely replays the same unique source key.
   mail.tx(()=>mail.db.prepare('UPDATE mail_source_cursors SET cursor=CASE WHEN cursor<? THEN ? ELSE cursor END WHERE source=?').run(Number(r.id),Number(r.id),source));
  }return rows.length;
 }
 return {sync};
};
