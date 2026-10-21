'use strict';
const crypto=require('node:crypto'),email='novanoxx_test@novanoxx.com',alias='novanoxx_test';
function normalize(identifier){const value=typeof identifier==='string'?identifier.trim().toLowerCase():'';return value===alias?email:value;}
function provision({db,env=process.env,clock=Date.now}){
 const raw=env.NNX_REVIEW_ACCOUNT_PROVISION;if(!raw)return {status:'NOT_REQUESTED'};
 if(env.RENDER_SERVICE_ID!=='srv-db5aqunlk1mc739bi0m0'||env.NODE_ENV!=='production'||env.NNX_REVIEW_MODE==='1')return {status:'REFUSED_ENVIRONMENT'};
 let input;try{input=JSON.parse(raw);}catch{return {status:'INVALID_REQUEST'};}
 if(!input||Object.keys(input).some(k=>!['version','nonce','salt','hash'].includes(k))||input.version!==1||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.nonce||'')||!/^[a-f0-9]{32}$/i.test(input.salt||'')||!/^[a-f0-9]{128}$/i.test(input.hash||''))return {status:'INVALID_REQUEST'};
 if(require('./admin-policy.cjs')({email}))return {status:'REFUSED_ADMIN_IDENTITY'};
 const auditId='review-provision:'+input.nonce,prior=db.prepare('SELECT user_id FROM mail_audit WHERE id=?').get(auditId);
 if(prior)return {status:'ALREADY_PROVISIONED'};
 if(db.prepare('SELECT id FROM users WHERE email=?').get(email))return {status:'ACCOUNT_EXISTS_NO_CHANGES'};
 const id=crypto.randomUUID();db.exec('BEGIN IMMEDIATE');try{
  // Recheck under the same transaction/advisory lock used by the operating DB.
  if(db.prepare('SELECT user_id FROM mail_audit WHERE id=?').get(auditId)){db.exec('COMMIT');return {status:'ALREADY_PROVISIONED'};}
  if(db.prepare('SELECT id FROM users WHERE email=?').get(email)){db.exec('COMMIT');return {status:'ACCOUNT_EXISTS_NO_CHANGES'};}
  db.prepare('INSERT INTO users(id,email,name,salt,hash) VALUES(?,?,?,?,?)').run(id,email,alias,input.salt,input.hash);
  require('./account-records.cjs').created(db,id,'EMAIL',clock());
  // Operator-issued review identity, not a claim that a verification mail was delivered.
  db.prepare('INSERT INTO mail_account_state(user_id,verified_at,generation) VALUES(?,?,0)').run(id,clock());
  db.prepare('INSERT INTO mail_audit(id,user_id,action,created) VALUES(?,?,?,?)').run(auditId,id,'OPERATOR_ISSUED_REVIEW_ACCOUNT',clock());
  db.exec('COMMIT');return {status:'PROVISIONED',id};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
module.exports={provision,normalize,email,alias};
