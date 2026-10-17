'use strict';
// Optional new synthetic records only; no source account or original-file import.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function({db,dir,env=process.env,sellerPassword,buyerPassword}){
 const policy=require('./review-environment.cjs'),cfg=policy.verifyDirectory(policy.config(env));policy.verifyDatabase(db,cfg);
 if(path.resolve(dir)!==cfg.dir)throw Error('REVIEW_DIRECTORY_BINDING_MISMATCH');
 for(const password of [sellerPassword,buyerPassword])if(typeof password!=='string'||password.length<12||password.length>128)throw Error('REVIEW_SAMPLE_PASSWORDS_REQUIRED');
 const sellerEmail='review-seller@example.invalid',buyerEmail='review-buyer@example.invalid';
 if(db.prepare('SELECT id FROM users WHERE email IN (?,?)').all(sellerEmail,buyerEmail).length)throw Error('REVIEW_SAMPLE_ALREADY_EXISTS');
 const sellerId=crypto.randomUUID(),buyerId=crypto.randomUUID(),assetId=crypto.randomUUID(),fileId=crypto.randomUUID(),created=Date.now(),file=path.join(dir,'uploads',fileId);
 const meta={title:'REVIEW SAMPLE · Final delivery example',description:'Synthetic review sample. No real sale or payment. Final delivery: one text file.',category:'DOCUMENTS',subcategory:'OTHER',price:10,days:0,extraPrice:0,saleMode:'MULTI',fulfillment:'REGISTERED_INSTANT',rightsConfirmed:true,thirdPartyAssets:'no',brandFit:false,deliverables:'One synthetic final text file',customization:{},contract:{mode:'MULTI',version:'2026-10-11-v1',sellerId},usageRights:{commercial:true,modify:true,redistribute:false,resell:false}};
 const data=Buffer.from('NovaNoxX REVIEW SAMPLE\nSynthetic final deliverable. No operating file, payment or entitlement.\n');
 let made=false;db.exec('BEGIN IMMEDIATE');try{
  for(const [id,email,name,password] of [[sellerId,sellerEmail,'Review sample seller',sellerPassword],[buyerId,buyerEmail,'Review sample buyer',buyerPassword]]){const salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync(password,salt,64).toString('hex');db.prepare('INSERT INTO users(id,email,name,salt,hash) VALUES(?,?,?,?,?)').run(id,email,name,salt,hash);db.prepare('INSERT INTO account_status(user_id) VALUES(?)').run(id);}
  for(const [id,name] of [[sellerId,'Review sample seller'],[buyerId,'Review sample buyer']])db.prepare('INSERT INTO creator_profiles VALUES(?,?,?,?,?,?,?)').run(id,name,'Synthetic review account','KR','en','',created);
  db.prepare('INSERT INTO creator_assets VALUES(?,?,?,?,?,?)').run(assetId,sellerId,JSON.stringify(meta),'ACTIVE',created,created);db.prepare('INSERT INTO catalog_links(asset_id) VALUES(?)').run(assetId);
  fs.writeFileSync(file,data,{flag:'wx',mode:0o600});made=true;
  db.prepare('INSERT INTO creator_files VALUES(?,?,?,?,?,?,?,?)').run(fileId,assetId,sellerId,'original','review-final.txt','txt',data.length,created);
  db.prepare('INSERT INTO creator_original_fingerprints VALUES(?,?,?,?,?,?)').run(fileId,assetId,sellerId,crypto.createHash('sha256').update(data).digest('hex'),data.length,created);
  db.prepare('INSERT INTO neon_test_wallet VALUES(?,?)').run(buyerId,100);
  db.exec('COMMIT');
  return {sellerEmail,buyerEmail,publicAssetId:db.prepare('SELECT public_id FROM catalog_links WHERE asset_id=?').get(assetId).public_id+1000,syntheticOnly:true,operatingDataImported:false};
 }catch(error){db.exec('ROLLBACK');if(made)fs.unlinkSync(file);throw error;}
};
