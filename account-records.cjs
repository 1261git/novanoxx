'use strict';
function schema(db){db.exec('CREATE TABLE IF NOT EXISTS account_creation_records(user_id TEXT PRIMARY KEY,created INTEGER NOT NULL,source TEXT NOT NULL);');}
function created(db,id,source,now=Date.now()){
 if(typeof id!=='string'||!id||!['EMAIL','EMAIL_VERIFICATION_FLOW','GOOGLE','KAKAO','NAVER'].includes(source)||!Number.isSafeInteger(now))throw Error('INVALID_INPUT');
 schema(db);db.prepare('INSERT INTO account_creation_records VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING').run(id,now,source);
}
function purchaseContext(db,actor,country,now){
 if(country!==undefined&&country!==null&&country!==''&&(typeof country!=='string'||!/^[A-Z]{2}$/.test(country)))throw Error('INVALID_INPUT');
 const has=db.prepare("SELECT name FROM sqlite_master WHERE name='account_creation_records'").get(),row=has?db.prepare('SELECT created,source FROM account_creation_records WHERE user_id=?').get(actor):null;
 return {purchasedAt:now,accountCreatedAt:row?.created??null,accountCreationSource:row?.source??'UNKNOWN_LEGACY',purchaseCountry:country||null,countrySource:country?'BUYER_DECLARED_UNVERIFIED':'NOT_PROVIDED'};
}
module.exports={created,purchaseContext};
