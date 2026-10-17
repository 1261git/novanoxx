'use strict';
// Opt-in account mail. All state uses the supplied account DB; no DB is opened here.
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const derive=promisify(crypto.scrypt),uid=()=>crypto.randomUUID();
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const address=x=>typeof x==='string'&&x.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x)&&!/[\r\n]/.test(x);
const fail=x=>{throw Error(x);};
function create({db,origin,encryptionKey,transport,webhookSecret,now=Date.now,allowRecipient=address,testDelivery}){
 const base=new URL(origin);
 if(base.pathname!=='/'||base.search||base.hash||base.username||base.password||!(base.protocol==='https:'||base.protocol==='http:'&&base.hostname==='127.0.0.1'))fail('MAIL_ORIGIN_REQUIRED');
 if(!Buffer.isBuffer(encryptionKey)||encryptionKey.length!==32||typeof transport?.send!=='function'||!/^whsec_[A-Za-z0-9+/=]+$/.test(webhookSecret||''))fail('MAIL_CONFIGURATION_REQUIRED');
 const key=Buffer.from(encryptionKey),secret=Buffer.from(webhookSecret.slice(6),'base64');if(secret.length<24)fail('MAIL_WEBHOOK_SECRET_REQUIRED');
 let policy=null;
 if(testDelivery){const {recipients,maximum,deadline}=testDelivery;if(!Array.isArray(recipients)||!recipients.length||recipients.length>2||recipients.some(e=>!address(e)||e!==e.toLowerCase())||new Set(recipients).size!==recipients.length||!Number.isInteger(maximum)||maximum<1||maximum>3||!Number.isSafeInteger(deadline)||deadline<=0)fail('MAIL_TEST_POLICY_REQUIRED');policy={recipients:[...recipients].sort(),maximum,deadline};}
 db.exec(`CREATE TABLE IF NOT EXISTS mail_account_state(user_id TEXT PRIMARY KEY,verified_at INTEGER,generation INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS mail_tokens(digest TEXT PRIMARY KEY,user_id TEXT NOT NULL,purpose TEXT NOT NULL,generation INTEGER NOT NULL,expires INTEGER NOT NULL,state TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_requests(id TEXT PRIMARY KEY,digest TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_limits(bucket TEXT PRIMARY KEY,started INTEGER NOT NULL,count INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_outbox(id TEXT PRIMARY KEY,source_key TEXT UNIQUE NOT NULL,user_id TEXT NOT NULL,recipient TEXT NOT NULL,template TEXT NOT NULL,token_digest TEXT,ciphertext TEXT NOT NULL,payload_digest TEXT NOT NULL,state TEXT NOT NULL,provider_id TEXT,attempts INTEGER NOT NULL DEFAULT 0,first_attempt INTEGER,available_at INTEGER NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_receipts(id TEXT PRIMARY KEY,digest TEXT NOT NULL,provider_id TEXT NOT NULL,kind TEXT NOT NULL,recipient TEXT,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_suppressions(recipient TEXT PRIMARY KEY,reason TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_audit(id TEXT PRIMARY KEY,user_id TEXT,action TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_source_cursors(source TEXT PRIMARY KEY,cursor INTEGER NOT NULL);`);
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 db.exec('CREATE TABLE IF NOT EXISTS mail_configuration(id INTEGER PRIMARY KEY,version INTEGER NOT NULL,origin TEXT NOT NULL,key_fingerprint TEXT NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS mail_test_policy(id INTEGER PRIMARY KEY,fingerprint TEXT NOT NULL);CREATE TABLE IF NOT EXISTS mail_test_budget(outbox_id TEXT PRIMARY KEY)');
 tx(()=>{const prior=db.prepare('SELECT * FROM mail_configuration WHERE id=1').get(),fingerprint=hash(Buffer.concat([Buffer.from('NovaNoxX.Mail.Encryption.v1:'),key]));
  if(prior){if(prior.version!==1||prior.origin!==base.origin||prior.key_fingerprint!==fingerprint)fail('MAIL_CONFIGURATION_CONFLICT');}
  else{if(db.prepare('SELECT count(*) AS n FROM mail_outbox').get().n)fail('MAIL_UNVERSIONED_STORE');db.prepare('INSERT INTO mail_configuration VALUES(1,1,?,?)').run(base.origin,fingerprint);}
  const previousPolicy=db.prepare('SELECT fingerprint FROM mail_test_policy WHERE id=1').get();
  if(previousPolicy){if(!policy||previousPolicy.fingerprint!==hash(JSON.stringify(policy)))fail('MAIL_TEST_POLICY_CONFLICT');}
  else if(policy){if(db.prepare('SELECT count(*) AS n FROM mail_outbox').get().n)fail('MAIL_TEST_POLICY_REQUIRES_EMPTY_STORE');db.prepare('INSERT INTO mail_test_policy VALUES(1,?)').run(hash(JSON.stringify(policy)));}});
 const permitted=email=>allowRecipient(email)&&(!policy||policy.recipients.includes(email));
 const audit=(user,action)=>db.prepare('INSERT INTO mail_audit VALUES(?,?,?,?)').run(uid(),user,action,now());
 function crypt(id,purpose,payload){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(id+':'+purpose));return Buffer.concat([iv,c.update(JSON.stringify(payload)),c.final(),c.getAuthTag()]).toString('base64');}
 function decrypt(r){const b=Buffer.from(r.ciphertext,'base64'),c=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAAD(Buffer.from(r.id+':'+r.template));c.setAuthTag(b.subarray(-16));const text=Buffer.concat([c.update(b.subarray(12,-16)),c.final()]);try{if(hash(text)!==r.payload_digest)fail('MAIL_PAYLOAD_CHANGED');return JSON.parse(text);}finally{text.fill(0);}}
 function verified(id){const s=db.prepare('SELECT verified_at FROM mail_account_state WHERE user_id=?').get(id);return !s||s.verified_at!==null;}
 function limit(bucket,max=3){const k=hash(bucket),r=db.prepare('SELECT * FROM mail_limits WHERE bucket=?').get(k),t=now();if(r&&t-r.started<3600000&&r.count>=max)fail('MAIL_RATE_LIMIT');db.prepare('INSERT INTO mail_limits VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET started=excluded.started,count=excluded.count').run(k,r&&t-r.started<3600000?r.started:t,r&&t-r.started<3600000?r.count+1:1);}
 function queue(user,template,sourceKey,payload,tokenDigest=null){
  if(!permitted(user.email)||!address(user.email))fail('MAIL_RECIPIENT_DENIED');
  const prior=db.prepare('SELECT id FROM mail_outbox WHERE source_key=?').get(sourceKey);if(prior)return prior.id;
  const id=uid(),text=JSON.stringify(payload);
  db.prepare("INSERT INTO mail_outbox(id,source_key,user_id,recipient,template,token_digest,ciphertext,payload_digest,state,available_at,created) VALUES(?,?,?,?,?,?,?,?,'READY',?,?)").run(id,sourceKey,user.id,user.email,template,tokenDigest,crypt(id,template,payload),hash(text),now(),now());return id;
 }
 function issue(user,purpose,requestId){
  if(!user||purpose==='RESET'&&!user.hash||purpose==='VERIFY'&&verified(user.id))return;
  db.prepare('INSERT OR IGNORE INTO mail_account_state(user_id,verified_at,generation) VALUES(?,?,0)').run(user.id,now());
  const s=db.prepare('SELECT * FROM mail_account_state WHERE user_id=?').get(user.id);
  db.prepare("UPDATE mail_tokens SET state='REVOKED' WHERE user_id=? AND purpose=? AND state='ACTIVE'").run(user.id,purpose);
  db.prepare("UPDATE mail_outbox SET state='CANCELLED' WHERE user_id=? AND template=? AND state='READY'").run(user.id,purpose);
  const raw=crypto.randomBytes(32).toString('base64url'),digest=hash(raw),expires=now()+15*60000;
  db.prepare("INSERT INTO mail_tokens VALUES(?,?,?,?,?,'ACTIVE')").run(digest,user.id,purpose,s.generation,expires);
  const route=purpose==='VERIFY'?'verify-email':'reset-password';
  queue(user,purpose,'auth:'+requestId,{subject:purpose==='VERIFY'?'NovaNoxX 이메일 주소 확인':'NovaNoxX 비밀번호 재설정',text:'본인이 요청하신 경우에만 아래 화면에서 진행해 주세요. 링크는 15분 동안 한 번만 사용할 수 있습니다.\n'+base.origin+'/#/'+route+'?token='+raw},digest);
  audit(user.id,'TOKEN_ISSUED_'+purpose);
 }
 function request({email,purpose,requestId,client='unknown'}){
  if(!address(email)||!uuid(requestId)||!['VERIFY','RESET'].includes(purpose))fail('MAIL_INVALID_INPUT');
  email=email.toLowerCase();const digest=hash(JSON.stringify({email,purpose}));
  return tx(()=>{const prior=db.prepare('SELECT digest FROM mail_requests WHERE id=?').get(requestId);if(prior){if(prior.digest!==digest)fail('MAIL_REQUEST_CONFLICT');return {accepted:true};}
   limit('ip:'+client,30);limit(email+':'+purpose);db.prepare('INSERT INTO mail_requests VALUES(?,?)').run(requestId,digest);
   if(permitted(email))issue(db.prepare('SELECT * FROM users WHERE email=?').get(email),purpose,requestId);return {accepted:true};});
 }
 function signup(user,{requestId,client='unknown',injectFailure=false}){
  if(!uuid(requestId)||!address(user.email)||!user.hash||!user.salt)fail('MAIL_INVALID_INPUT');
  if(!permitted(user.email))fail('MAIL_RECIPIENT_DENIED');
  return tx(()=>{const digest=hash(JSON.stringify({email:user.email,name:user.name,purpose:'SIGNUP'}));const prior=db.prepare('SELECT digest FROM mail_requests WHERE id=?').get(requestId);if(prior){if(prior.digest!==digest)fail('MAIL_REQUEST_CONFLICT');return {accepted:true,emailVerificationRequired:true};}limit('ip:'+client,30);limit(user.email+':SIGNUP');db.prepare('INSERT INTO mail_requests VALUES(?,?)').run(requestId,digest);
   if(!db.prepare('SELECT id FROM users WHERE email=?').get(user.email)){
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user.id,user.email,user.name,user.salt,user.hash);require('./account-records.cjs').created(db,user.id,'EMAIL_VERIFICATION_FLOW',now());
    db.prepare('INSERT INTO mail_account_state VALUES(?,NULL,0)').run(user.id);issue(user,'VERIFY',requestId);
   }if(injectFailure)fail('MAIL_TEST_ROLLBACK');return {accepted:true,emailVerificationRequired:true};});
 }
 async function consume({token,purpose,password}){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||!['VERIFY','RESET'].includes(purpose))fail('MAIL_INVALID_LINK');
  let salt,calculated;if(purpose==='RESET'){if(typeof password!=='string'||password.length<8||password.length>128)fail('MAIL_INVALID_INPUT');salt=crypto.randomBytes(16).toString('hex');calculated=(await derive(password,salt,64)).toString('hex');}
  return tx(()=>{const t=db.prepare('SELECT * FROM mail_tokens WHERE digest=?').get(hash(token));if(!t||t.state!=='ACTIVE'||t.purpose!==purpose||t.expires<=now())fail('MAIL_INVALID_LINK');
   const u=db.prepare('SELECT * FROM users WHERE id=?').get(t.user_id),s=db.prepare('SELECT * FROM mail_account_state WHERE user_id=?').get(t.user_id);
   if(!u||!s||t.generation!==s.generation||purpose==='RESET'&&!u.hash)fail('MAIL_INVALID_LINK');
   db.prepare("UPDATE mail_tokens SET state='USED' WHERE digest=?").run(t.digest);
   if(purpose==='VERIFY')db.prepare('UPDATE mail_account_state SET verified_at=? WHERE user_id=?').run(now(),u.id);
   else{db.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').run(salt,calculated,u.id);db.prepare('UPDATE mail_account_state SET generation=generation+1 WHERE user_id=?').run(u.id);db.prepare('UPDATE sessions SET expires=CASE WHEN expires>? THEN ? ELSE expires END WHERE user_id=?').run(now(),now(),u.id);db.prepare("UPDATE mail_tokens SET state='REVOKED' WHERE user_id=? AND state='ACTIVE'").run(u.id);db.prepare("UPDATE mail_outbox SET state='CANCELLED' WHERE user_id=? AND state IN ('READY','RETRY','UNKNOWN') AND token_digest IS NOT NULL").run(u.id);}
   audit(u.id,'TOKEN_CONSUMED_'+purpose);return {ok:true};});
 }
 function notificationInside({sourceKey,userId,kind,orderId}){
  if(typeof sourceKey!=='string'||sourceKey.length>300||typeof orderId!=='string'||orderId.length>100||!['ORDER','DELIVERY','REFUND','ORDER_UPDATE'].includes(kind))fail('MAIL_INVALID_INPUT');
  const user=db.prepare('SELECT * FROM users WHERE id=?').get(userId);if(!user)return null;
  if(policy&&!permitted(user.email)){audit(user.id,'TEST_RECIPIENT_SKIPPED');return null;}
  return queue(user,kind,sourceKey,{subject:({ORDER:'NovaNoxX 주문 접수',DELIVERY:'NovaNoxX 납품·검수 안내',REFUND:'NovaNoxX 환불 처리 안내',ORDER_UPDATE:'NovaNoxX 주문 상태 안내'})[kind],text:'참여 중인 주문의 새 안내가 있습니다.\n주문 번호: '+orderId+'\n자세한 내용은 로그인 후 주문 페이지에서 확인해 주세요.\n'+base.origin+'/#/orders'});
 }
 const notification=input=>tx(()=>notificationInside(input));
 function receiptFor(row){
  const receipts=db.prepare('SELECT * FROM mail_receipts WHERE provider_id=? ORDER BY created,id').all(row.provider_id);
  let state=row.state;
  for(const r of receipts){if(r.recipient&&r.recipient!==row.recipient)continue;
   if(['email.bounced','email.complained'].includes(r.kind)){db.prepare('INSERT OR IGNORE INTO mail_suppressions VALUES(?,?,?)').run(row.recipient,r.kind,now());state=r.kind==='email.complained'?'COMPLAINED':'BOUNCED';}
   else if(r.kind==='email.failed'&&!['BOUNCED','COMPLAINED'].includes(state))state='FAILED';
   else if(r.kind==='email.delivered'&&!['BOUNCED','COMPLAINED','FAILED'].includes(state))state='DELIVERED';
  }
  db.prepare('UPDATE mail_outbox SET state=? WHERE id=?').run(state,row.id);return state;
 }
 async function dispatch({limit:batch=10}={}){
  if(!Number.isInteger(batch)||batch<1||batch>50)fail('MAIL_BATCH_LIMIT');
  const ids=db.prepare("SELECT id FROM mail_outbox WHERE state IN ('READY','RETRY','UNKNOWN') AND available_at<=? ORDER BY created,id LIMIT ?").all(now(),batch);
  let processed=0;
  for(const {id} of ids){const claim=tx(()=>{
   const row=db.prepare('SELECT * FROM mail_outbox WHERE id=?').get(id);if(!['READY','RETRY','UNKNOWN'].includes(row.state)||row.available_at>now())return null;
   const u=db.prepare('SELECT email FROM users WHERE id=?').get(row.user_id);if(!u||u.email!==row.recipient||!permitted(row.recipient)||db.prepare('SELECT recipient FROM mail_suppressions WHERE recipient=?').get(row.recipient)){db.prepare("UPDATE mail_outbox SET state='SUPPRESSED' WHERE id=?").run(id);return null;}
   if(row.token_digest){const t=db.prepare('SELECT * FROM mail_tokens WHERE digest=?').get(row.token_digest);if(!t||t.state!=='ACTIVE'||t.expires<=now()){db.prepare("UPDATE mail_outbox SET state='CANCELLED' WHERE id=?").run(id);return null;}}
   else if(!verified(row.user_id))return null;
   if(row.attempts>=5||row.first_attempt!==null&&now()-row.first_attempt>=23*3600000){db.prepare("UPDATE mail_outbox SET state='MANUAL_REVIEW' WHERE id=?").run(id);return null;}
   if(policy){const reserved=db.prepare('SELECT outbox_id FROM mail_test_budget WHERE outbox_id=?').get(id);if(now()>=policy.deadline||!reserved&&Number(db.prepare('SELECT count(*) AS n FROM mail_test_budget').get().n)>=policy.maximum){db.prepare("UPDATE mail_outbox SET state='TEST_HELD' WHERE id=?").run(id);return null;}if(!reserved)db.prepare('INSERT INTO mail_test_budget VALUES(?)').run(id);}
   let p;try{p=decrypt(row);}catch{db.prepare("UPDATE mail_outbox SET state='MANUAL_REVIEW' WHERE id=?").run(id);audit(row.user_id,'PAYLOAD_REVIEW_REQUIRED');return null;}db.prepare("UPDATE mail_outbox SET state='SUBMITTING',attempts=attempts+1,first_attempt=COALESCE(first_attempt,?),available_at=? WHERE id=?").run(now(),now()+60000,id);return {row,p};
  });if(!claim)continue;processed++;
   try{const result=await transport.send({id,recipient:claim.row.recipient,...claim.p,idempotencyKey:'nnx-mail/'+id});if(!uuid(result?.id))fail('MAIL_RESULT_UNKNOWN');
    tx(()=>{const current=db.prepare('SELECT * FROM mail_outbox WHERE id=?').get(id);if(current.provider_id&&current.provider_id!==result.id)fail('MAIL_PROVIDER_CONFLICT');db.prepare("UPDATE mail_outbox SET provider_id=?,state=CASE WHEN state='SUBMITTING' THEN 'ACCEPTED' ELSE state END WHERE id=?").run(result.id,id);receiptFor(db.prepare('SELECT * FROM mail_outbox WHERE id=?').get(id));});
   }catch(e){tx(()=>db.prepare("UPDATE mail_outbox SET state=?,available_at=? WHERE id=? AND state='SUBMITTING'").run(e.definiteReject?'FAILED':'UNKNOWN',now()+60000,id));}
  }return {processed};
 }
 function recover(){return tx(()=>db.prepare("UPDATE mail_outbox SET state='UNKNOWN' WHERE state='SUBMITTING' AND available_at<=?").run(now()).changes);}
 function webhook(raw,headers){
  if(!Buffer.isBuffer(raw)||raw.length>65536)fail('MAIL_WEBHOOK_INVALID');
  const id=headers['svix-id'],stamp=headers['svix-timestamp'],signature=headers['svix-signature'];
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(id)||typeof stamp!=='string'||!/^\d{1,12}$/.test(stamp)||Math.abs(now()/1000-Number(stamp))>300||typeof signature!=='string'||signature.length>2048)fail('MAIL_WEBHOOK_INVALID');
  const expected=crypto.createHmac('sha256',secret).update(id+'.'+stamp+'.').update(raw).digest();
  const valid=signature.split(' ').some(s=>{if(!s.startsWith('v1,'))return false;const b=Buffer.from(s.slice(3),'base64');return b.length===expected.length&&crypto.timingSafeEqual(b,expected);});if(!valid)fail('MAIL_WEBHOOK_INVALID');
  const event=JSON.parse(raw),providerId=event?.data?.email_id;if(!uuid(providerId)||typeof event.type!=='string'||!/^email\.[a-z_]{1,40}$/.test(event.type))fail('MAIL_WEBHOOK_INVALID');
  const recipients=event.data.to;if(recipients!==undefined&&(!Array.isArray(recipients)||recipients.length!==1||!address(recipients[0])))fail('MAIL_WEBHOOK_INVALID');
  return tx(()=>{const digest=hash(raw),old=db.prepare('SELECT digest FROM mail_receipts WHERE id=?').get(id);if(old){if(old.digest!==digest)fail('MAIL_WEBHOOK_CONFLICT');return {ok:true};}
   db.prepare('INSERT INTO mail_receipts VALUES(?,?,?,?,?,?)').run(id,digest,providerId,event.type,recipients?.[0]||null,now());
   const row=db.prepare('SELECT * FROM mail_outbox WHERE provider_id=?').get(providerId);if(row)receiptFor(row);return {ok:true};});
 }
 return {signup,request,consume,notification,notificationInside,dispatch,recover,webhook,verified,tx,db,origin:base.origin,throttle:client=>tx(()=>limit('consume:'+client,30)),close(){key.fill(0);secret.fill(0);}};
}
module.exports={create};
