'use strict';
const crypto=require('node:crypto');
module.exports=function({db,user,json,origin,isAdmin=require('./admin-policy.cjs')}){
 db.exec("CREATE TABLE IF NOT EXISTS member_restrictions(user_id TEXT PRIMARY KEY,state TEXT NOT NULL,reason TEXT NOT NULL,updated INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS admin_member_events(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,user_id TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,payload_hash TEXT NOT NULL,result TEXT NOT NULL,created INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS admin_test_wallet_adjustments(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,user_id TEXT NOT NULL,delta INTEGER NOT NULL,balance_before INTEGER NOT NULL,balance_after INTEGER NOT NULL,reason TEXT NOT NULL,payload_hash TEXT NOT NULL,created INTEGER NOT NULL);");
 const blocked=id=>['SUSPENDED','WITHDRAWN'].includes(db.prepare('SELECT state FROM member_restrictions WHERE user_id=?').get(id)?.state);
 async function handle(req,res,name){
  if(!['/api/auth/admin/member-state','/api/auth/admin/member-wallet','/api/auth/admin/test-wallet-adjust'].includes(name))return false;
  const actor=user(req);if(!actor){json(res,401,{error:'로그인이 필요합니다.'});return true;}if(!isAdmin(actor)){json(res,403,{error:'관리자 권한이 필요합니다.'});return true;}
  if(name.endsWith('/member-wallet')&&req.method==='GET'){
   const id=new URL(req.url,origin).searchParams.get('userId');if(!id||!db.prepare('SELECT id FROM users WHERE id=?').get(id)){json(res,404,{error:'회원을 찾을 수 없습니다.'});return true;}
   const account=db.prepare('SELECT neon_balance FROM account_status WHERE user_id=?').get(id),test=db.prepare('SELECT balance FROM neon_test_wallet WHERE user_id=?').get(id);
   const adjustments=db.prepare('SELECT id,actor_id,delta,balance_before,balance_after,reason,created FROM admin_test_wallet_adjustments WHERE user_id=? ORDER BY created DESC,id LIMIT 50').all(id);
   const purchases=db.prepare('SELECT id,order_id,delta,balance_before,balance_after,created FROM neon_test_ledger WHERE user_id=? ORDER BY created DESC,id LIMIT 50').all(id);
   const topups=db.prepare('SELECT id,neon,amount,state,created,paid FROM neon_topups WHERE user_id=? ORDER BY created DESC,id LIMIT 50').all(id);
   db.prepare('INSERT INTO admin_access_audit VALUES(?,?,?,?)').run(crypto.randomUUID(),actor.id,'member-wallet',Date.now());json(res,200,{userId:id,accountBalance:account?.neon_balance??null,testBalance:test?.balance??null,adjustments,purchases,topups,liveAdjustmentsEnabled:false});return true;
  }
  if(req.method!=='POST'){json(res,405,{error:'지원하지 않는 요청입니다.'});return true;}
  if(req.headers.origin!==origin){json(res,403,{error:'요청 출처를 확인해주세요.'});return true;}if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){json(res,415,{error:'JSON 요청이 필요합니다.'});return true;}
  let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192){json(res,413,{error:'요청이 너무 큽니다.'});return true;}chunks.push(chunk);}let input;try{input=JSON.parse(Buffer.concat(chunks))}catch{}const reason=typeof input?.reason==='string'?input.reason.trim():'';
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.userId!=='string'||input.userId.length>100||typeof input.requestId!=='string'||!/^admin_[0-9a-f-]{36}$/.test(input.requestId)||!reason||reason.length>1000){json(res,400,{error:'회원과 처리 사유, 요청 정보를 확인해주세요.'});return true;}
  const stateAction=name.endsWith('/member-state');if(stateAction&&!['ACTIVE','SUSPENDED'].includes(input.state)||!stateAction&&(!Number.isSafeInteger(input.delta)||input.delta===0||Math.abs(input.delta)>1000000)){json(res,400,{error:'회원 상태 또는 TEST 조정 금액을 확인해주세요.'});return true;}
  const payloadHash=crypto.createHash('sha256').update(JSON.stringify({actor:actor.id,user:input.userId,reason,state:stateAction?input.state:null,delta:stateAction?null:input.delta})).digest('hex');const table=stateAction?'admin_member_events':'admin_test_wallet_adjustments';
  db.exec('BEGIN IMMEDIATE');try{
   const existing=db.prepare('SELECT * FROM '+table+' WHERE id=?').get(input.requestId);if(existing){db.exec('ROLLBACK');if(existing.payload_hash!==payloadHash){json(res,409,{error:'요청 내용이 변경되었습니다. 새 요청으로 처리해주세요.'});return true;}json(res,200,stateAction?JSON.parse(existing.result):{ok:true,mode:'TEST',balance:existing.balance_after});return true;}
   const target=db.prepare('SELECT id,email FROM users WHERE id=?').get(input.userId);if(!target){db.exec('ROLLBACK');json(res,404,{error:'회원을 찾을 수 없습니다.'});return true;}
   if(db.prepare('SELECT state FROM member_restrictions WHERE user_id=?').get(target.id)?.state==='WITHDRAWN'){db.exec('ROLLBACK');json(res,409,{error:'탈퇴한 계정은 다시 활성화하거나 잔액을 변경할 수 없습니다.'});return true;}
   const now=Date.now();let result;
   if(stateAction){if(target.id===actor.id||isAdmin(target)){db.exec('ROLLBACK');json(res,409,{error:'관리자 계정은 이 화면에서 정지할 수 없습니다.'});return true;}const prior=blocked(target.id)?'SUSPENDED':'ACTIVE';if(prior===input.state){db.exec('ROLLBACK');json(res,409,{error:'이미 같은 회원 상태입니다.'});return true;}
    db.prepare('INSERT INTO member_restrictions VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,reason=excluded.reason,updated=excluded.updated').run(target.id,input.state,reason,now);if(input.state==='SUSPENDED')db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);result={ok:true,state:input.state};db.prepare('INSERT INTO admin_member_events VALUES(?,?,?,?,?,?,?,?)').run(input.requestId,actor.id,target.id,prior+'→'+input.state,reason,payloadHash,JSON.stringify(result),now);
   }else{const prior=db.prepare('SELECT balance FROM neon_test_wallet WHERE user_id=?').get(target.id)?.balance??0,next=prior+input.delta;if(!Number.isSafeInteger(prior)||prior<0||!Number.isSafeInteger(next)||next<0){db.exec('ROLLBACK');json(res,409,{error:'TEST 잔액이 부족하거나 허용 범위를 벗어납니다.'});return true;}
    db.prepare('INSERT INTO neon_test_wallet VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET balance=excluded.balance').run(target.id,next);db.prepare('INSERT INTO admin_test_wallet_adjustments VALUES(?,?,?,?,?,?,?,?,?)').run(input.requestId,actor.id,target.id,input.delta,prior,next,reason,payloadHash,now);result={ok:true,mode:'TEST',balance:next};
   }
   db.exec('COMMIT');json(res,200,result);
  }catch(error){db.exec('ROLLBACK');throw error;}return true;
 }
 handle.blocked=blocked;return handle;
};
