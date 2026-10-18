'use strict';
const crypto=require('node:crypto');
const POLICY='ACCOUNT_WITHDRAWAL_V1',DAY=86400000;
// No provider calls: unresolved money, disputes and paid subscription periods must
// finish first. Historical transactions/files are never promoted, moved or erased.
module.exports=function({db,user,json,origin,isAdmin,sessionHash,clock=Date.now}){
 const challenges=new Map(),digest=s=>crypto.createHash('sha256').update(s).digest('hex');
 const exists=t=>!!db.prepare('SELECT to_regclass(?) relation').get(t).relation;
 const ready=()=>db.backend==='postgres'&&exists('nnx_operating_v1.account_withdrawals');
 const terminal=id=>ready()&&!!db.prepare('SELECT user_id FROM nnx_operating_v1.account_withdrawals WHERE user_id=?').get(id);
 const restrictions=id=>db.prepare('SELECT state FROM member_restrictions WHERE user_id=?').get(id)?.state;
 const rows=(t,where,args=[])=>exists(t)?db.prepare('SELECT * FROM '+t+' WHERE '+where).all(...args):[];
 function reasons(actor){
  const out=[];if(isAdmin(actor))out.push('ADMIN_ACCOUNT');
  const orders=rows('nnx_operating_v1.orders','buyer_id=? OR seller_id=?',[actor.id,actor.id]);
  if(orders.some(o=>!['COMPLETED','CANCELED','REFUNDED'].includes(o.state)))out.push('OPEN_ORDER');
  if(orders.some(o=>{if(o.seller_id!==actor.id||!['COMPLETED','REFUNDED'].includes(o.state))return false;if(!exists('nnx_operating_v1.payouts'))return o.state==='COMPLETED';const open=rows('nnx_operating_v1.payouts',"order_id=? AND state IN ('PROCESSING','REQUESTED','IN_PROGRESS','RECONCILE_REQUIRED')",[o.id]).length,paid=rows('nnx_operating_v1.payouts',"order_id=? AND state='COMPLETED'",[o.id]).reduce((n,p)=>n+Number(p.amount_krw),0),sync=rows('nnx_operating_v1.payment_sync','order_id=?',[o.id])[0],remaining=o.state==='REFUNDED'?0:Number(sync?.remaining_krw??o.amount_krw),net=remaining-Number(BigInt(remaining)*12n/100n);return open>0||paid!==net;}))out.push('SELLER_SETTLEMENT'); // No payout provider/result exists yet; never infer paid from an approval.
  if(rows('nnx_operating_v1.seller_accounts',"user_id=? AND state IN ('REGISTERING','REGISTRATION_UNKNOWN','UPDATING','UPDATE_UNKNOWN')",[actor.id]).length)out.push('PAYMENT_REVIEW');
  const ids=new Set(orders.map(o=>o.id));
  if(rows('nnx_operating_v1.refunds',"state IN ('REQUESTED','APPROVED','PROCESSING','RECONCILE_REQUIRED','FAILED')").some(r=>ids.has(r.order_id)))out.push('OPEN_REFUND');
  if(rows('nnx_operating_v1.payments',"state IN ('AUTHENTICATED','APPROVAL_PENDING','RECONCILE_REQUIRED')").some(r=>ids.has(r.order_id)))out.push('PAYMENT_REVIEW');
  if(rows('engine_disputes',"state<>'RESOLVED'").some(r=>ids.has(r.order_id)||r.opened_by===actor.id))out.push('OPEN_DISPUTE');
  const subs=rows('nnx_operating_v1.subscriptions','user_id=?',[actor.id]),sid=new Set(subs.map(s=>s.id));
  if(subs.some(s=>['PENDING','PAST_DUE'].includes(s.state)||['ACTIVE','TRIAL'].includes(s.state)&&(!s.period_end||new Date(s.period_end).getTime()>clock())))out.push('SUBSCRIPTION');
  if(rows('nnx_operating_v1.subscription_cycles',"state IN ('PENDING','RECONCILE_REQUIRED')").some(s=>sid.has(s.subscription_id))||rows('nnx_operating_v1.billing_recovery_attempts',"state IN ('PROCESSING','RECONCILE_REQUIRED')").some(s=>s.user_id===actor.id)||rows('nnx_operating_v1.billing_card_requests',"state IN ('PROCESSING','UNKNOWN') AND user_id=?",[actor.id]).length||rows('nnx_operating_v1.subscription_requests',"state IN ('PROCESSING','RECONCILE_REQUIRED') AND user_id=?",[actor.id]).length)out.push('BILLING_REVIEW');
  if(rows('account_status','user_id=?',[actor.id]).some(r=>Number(r.neon_balance)>0))out.push('WALLET_BALANCE');
  if(rows('mail_outbox',"user_id=? AND state='SUBMITTING'",[actor.id]).length)out.push('MAIL_IN_PROGRESS');
  return [...new Set(out)];
 }
 function fresh(req,actor){const event=db.prepare('SELECT occurred FROM login_events WHERE token=? AND user_id=?').get(sessionHash(req),actor.id);return !!event&&Number(event.occurred)<=clock()&&Number(event.occurred)>clock()-10*60000;}
 function state(req,actor){if(!ready())return {ready:false,canWithdraw:false,reasons:['NOT_READY']};const blocked=reasons(actor),recent=fresh(req,actor);for(const [k,v]of challenges)if(v.expires<=clock()||v.actor===actor.id)challenges.delete(k);let token=null;if(!blocked.length&&recent){token=crypto.randomBytes(32).toString('base64url');challenges.set(digest(token),{actor:actor.id,session:sessionHash(req),expires:clock()+10*60000});}return {ready:true,canWithdraw:!blocked.length&&recent,reasons:blocked,recentLogin:recent,token,policyVersion:POLICY};}
 function erasePersonal(id,at){
  if(exists('nnx_operating_v1.seller_accounts'))db.prepare("UPDATE nnx_operating_v1.seller_accounts SET payload_ciphertext=?,account_last4='',holder_mask='',state='WITHDRAWN',updated=? WHERE user_id=?").run(Buffer.alloc(0),at,id);
  for(const [table,column]of [['sessions','user_id'],['login_events','user_id'],['identities','user_id'],['creator_profiles','user_id'],['creator_avatars','user_id'],['account_saved_assets','user_id'],['mail_tokens','user_id'],['mail_account_state','user_id']])if(exists('public.'+table))db.prepare('DELETE FROM '+table+' WHERE '+column+'=?').run(id);
  if(exists('public.mail_outbox'))db.prepare("UPDATE mail_outbox SET state='CANCELLED',recipient='',ciphertext='',token_digest=NULL WHERE user_id=?").run(id);
  if(exists('public.engine_discovery_events')){for(const r of db.prepare('SELECT id FROM engine_discovery_events WHERE actor=?').all(id))db.prepare('DELETE FROM engine_requests WHERE actor=? AND id=?').run(id,r.id);db.prepare('DELETE FROM engine_discovery_events WHERE actor=?').run(id);}
  if(exists('public.engine_discovery_preferences'))db.prepare('UPDATE engine_discovery_preferences SET allowed=0,updated=? WHERE actor=?').run(at,id);
  if(exists('public.engine_discovery_deletions'))db.prepare('INSERT INTO engine_discovery_deletions VALUES(?,?) ON CONFLICT(actor) DO UPDATE SET deleted_through=excluded.deleted_through').run(id,at);
  if(exists('public.creator_assets'))db.prepare("UPDATE creator_assets SET status='PAUSED',updated=? WHERE user_id=? AND status IN ('ACTIVE','RESERVED','PENDING','IN_REVIEW')").run(at,id);
  if(exists('nnx_operating_v1.subscriptions')){
   db.prepare("UPDATE nnx_operating_v1.subscriptions SET state='ENDED',cancel_at_end=true WHERE user_id=?").run(id);
   db.prepare('DELETE FROM nnx_operating_v1.billing_credentials WHERE subscription_id IN (SELECT id FROM nnx_operating_v1.subscriptions WHERE user_id=?)').run(id);
   db.prepare("UPDATE nnx_operating_v1.subscription_requests SET state='CANCELED',return_hash=NULL WHERE user_id=? AND state IN ('PREPARED','STARTED')").run(id);
   if(exists('nnx_operating_v1.billing_card_requests'))db.prepare("UPDATE nnx_operating_v1.billing_card_requests SET state='FAILED',return_hash='' WHERE user_id=? AND state='STARTED'").run(id);
  }
  db.prepare('UPDATE users SET name=?,email=?,salt=?,hash=? WHERE id=?').run('탈퇴 회원','withdrawn-'+id+'@account.invalid',crypto.randomBytes(16).toString('hex'),'',id);
  db.prepare("INSERT INTO member_restrictions(user_id,state,reason,updated) VALUES(?,'WITHDRAWN','SELF_SERVICE_WITHDRAWAL',?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,reason=excluded.reason,updated=excluded.updated").run(id,at);
 }
 function complete(req,actor,i){
  if(!ready())throw Error('NOT_READY');if(!i||Object.keys(i).some(k=>!['requestId','token','policyVersion','confirmation','acknowledged'].includes(k))||!/^[a-f0-9-]{36}$/i.test(i.requestId||'')||i.policyVersion!==POLICY||i.confirmation!=='DELETE'||i.acknowledged!==true)throw Error('INVALID_INPUT');
  const key=digest(i.token||''),challenge=challenges.get(key);if(!challenge||challenge.actor!==actor.id||challenge.session!==sessionHash(req)||challenge.expires<=clock()||!fresh(req,actor))throw Error('REAUTH_REQUIRED');
  db.exec('BEGIN IMMEDIATE');try{
   const account=db.prepare('SELECT * FROM users WHERE id=?').get(actor.id);if(!account||terminal(actor.id)||['WITHDRAWN','SUSPENDED'].includes(restrictions(actor.id)))throw Error('ACCESS_DENIED');
   if(reasons(account).length)throw Error('WITHDRAWAL_BLOCKED');const at=clock();
   const closed=rows('nnx_operating_v1.orders',"buyer_id=? AND state IN ('COMPLETED','REFUNDED')",[actor.id]),closedIds=new Set(closed.map(o=>o.id));
   const paidSubs=new Set(rows('nnx_operating_v1.subscriptions','user_id=?',[actor.id]).map(s=>s.id));
   const last=Math.max(0,...closed.map(o=>new Date(o.created_at).getTime()),...rows('nnx_operating_v1.order_events','1=1').filter(e=>closedIds.has(e.order_id)).map(e=>new Date(e.created_at).getTime()),...rows('nnx_operating_v1.refunds','1=1').filter(r=>closedIds.has(r.order_id)).map(r=>Number(r.updated)),...rows('nnx_operating_v1.subscription_cycles',"state='APPROVED'").filter(r=>paidSubs.has(r.subscription_id)).map(r=>new Date(r.period_start).getTime()));
   if(last){const end=new Date(last);end.setUTCFullYear(end.getUTCFullYear()+5);if(end.getTime()>at)db.prepare("INSERT INTO nnx_retention_v1.withdrawn_identity VALUES(?,?,?,'COMPLETED_TRANSACTION',?)").run(actor.id,account.name,account.email,end.getTime());}
   db.prepare('INSERT INTO nnx_operating_v1.account_withdrawals VALUES(?,?,?,?)').run(actor.id,i.requestId,at,POLICY);erasePersonal(actor.id,at);db.exec('COMMIT');challenges.delete(key);return {ok:true,withdrawn:true};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 let lastPurge=0;function purge(){if(ready()&&clock()-lastPurge>=DAY){db.prepare('DELETE FROM nnx_retention_v1.withdrawn_identity WHERE expires_at<=?').run(clock());lastPurge=clock();}}
 async function handle(req,res,path){if(path!=='/api/auth/withdrawal')return false;const actor=user(req);if(!actor){json(res,401,{error:'로그인이 필요합니다.'});return true;}if(req.method==='GET'){json(res,200,state(req,actor));return true;}if(req.method!=='POST'){json(res,405,{error:'지원하지 않는 요청입니다.'});return true;}if(req.headers.origin!==origin){json(res,403,{error:'요청 출처를 확인해주세요.'});return true;}if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){json(res,415,{error:'JSON 요청이 필요합니다.'});return true;}let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>4096){json(res,413,{error:'요청이 너무 큽니다.'});return true;}chunks.push(c);}try{const result=complete(req,actor,JSON.parse(Buffer.concat(chunks)));json(res,200,result,{'Set-Cookie':['nnx_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0','nnx_recent_login=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0']});}catch(e){const known=['NOT_READY','INVALID_INPUT','REAUTH_REQUIRED','ACCESS_DENIED','WITHDRAWAL_BLOCKED'];if(!known.includes(e.message)&&!(e instanceof SyntaxError))throw e;json(res,e.message==='REAUTH_REQUIRED'?403:409,{error:e instanceof SyntaxError?'INVALID_INPUT':e.message});}return true;}
 return {handle,state,complete,terminal,purge,erasePersonal,ready};
};
