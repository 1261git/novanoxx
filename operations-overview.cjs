'use strict';
const crypto=require('node:crypto');
module.exports=function({db,user,json,isAdmin=require('./admin-policy.cjs')}){
 db.exec('CREATE TABLE IF NOT EXISTS admin_access_audit(id TEXT PRIMARY KEY,admin_id TEXT NOT NULL,view TEXT NOT NULL,created INTEGER NOT NULL);');
 const mask=value=>{const [name,domain]=String(value||'').split('@');return domain?name.slice(0,1)+'***@'+domain:'—';};
 return async(req,res,name)=>{
  if(!['/api/auth/admin/operations','/api/auth/admin/members','/api/auth/admin/transactions','/api/auth/admin/audit'].includes(name))return false;
  const actor=user(req);if(!actor){json(res,401,{error:'로그인이 필요합니다.'});return true;}if(!isAdmin(actor)){json(res,403,{error:'관리자 권한이 필요합니다.'});return true;}
  if(req.method!=='GET'){json(res,405,{error:'지원하지 않는 요청입니다.'});return true;}
  const query=new URL(req.url,'http://localhost').searchParams,raw=query.get('offset')||'0',search=(query.get('q')||'').trim();if(!/^\d{1,6}$/.test(raw)||Number(raw)>100000||search.length>120){json(res,400,{error:'입력값을 확인해주세요.'});return true;}const offset=Number(raw),limit=25;
  let result;
  if(name.endsWith('/operations'))result={source:'CURRENT_APPLICATION_DATABASE',liveTradingConnected:false,counts:{members:db.prepare('SELECT COUNT(*) AS n FROM users').get().n,assets:db.prepare('SELECT status,COUNT(*) AS n FROM creator_assets GROUP BY status').all(),testOrders:db.prepare('SELECT COUNT(*) AS n FROM neon_test_orders').get().n},capabilities:{members:'READ_ONLY',transactions:'TEST_READ_ONLY',audit:'READ_ONLY',walletAdjustment:false,roleChanges:false,realRefunds:false,realPayouts:false}};
  else if(name.endsWith('/members')){const pattern='%'+search+'%';const rows=db.prepare("SELECT u.id,u.name,u.email,s.plan,s.neon_balance,r.state AS account_state,(SELECT balance FROM neon_test_wallet w WHERE w.user_id=u.id) AS test_balance,(SELECT MAX(occurred) FROM login_events l WHERE l.user_id=u.id) AS last_login FROM users u LEFT JOIN account_status s ON s.user_id=u.id LEFT JOIN member_restrictions r ON r.user_id=u.id WHERE LOWER(u.name) LIKE LOWER(?) OR LOWER(u.email) LIKE LOWER(?) ORDER BY u.id LIMIT ? OFFSET ?").all(pattern,pattern,limit+1,offset);result={members:rows.slice(0,limit).map(row=>({id:row.id,name:row.name,state:row.account_state||'ACTIVE',emailMasked:mask(row.email),plan:row.plan??null,neonBalance:row.neon_balance??null,testBalance:row.test_balance??null,lastLoginAt:row.last_login??null})),nextOffset:rows.length>limit?offset+limit:null};}
  else if(name.endsWith('/transactions')){const rows=db.prepare('SELECT o.id,o.user_id,o.asset_id,o.title,o.price,o.created FROM neon_test_orders o ORDER BY o.created DESC,o.id LIMIT ? OFFSET ?').all(limit+1,offset);result={mode:'TEST',realPayment:false,orders:rows.slice(0,limit).map(row=>({id:row.id,memberId:row.user_id,assetId:row.asset_id,title:row.title,neon:row.price,created:row.created})),nextOffset:rows.length>limit?offset+limit:null};}
  else{const reviews=db.prepare('SELECT id,asset_id,admin_id,action,reason,before_state,after_state,created FROM creator_review_events ORDER BY created DESC,id LIMIT ? OFFSET ?').all(limit+1,offset);const access=db.prepare('SELECT id,admin_id,view,created FROM admin_access_audit ORDER BY created DESC,id LIMIT ? OFFSET ?').all(limit+1,offset);result={reviews:reviews.slice(0,limit),access:access.slice(0,limit),nextOffset:reviews.length>limit||access.length>limit?offset+limit:null};}
  // Record successful administrative reads before returning data. No query text or credentials are retained.
  db.prepare('INSERT INTO admin_access_audit VALUES(?,?,?,?)').run(crypto.randomUUID(),actor.id,name.split('/').pop(),Date.now());json(res,200,result);return true;
 };
};
