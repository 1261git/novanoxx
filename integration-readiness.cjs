'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function({db,dir,user,json,origin,isAdmin=require('./admin-policy.cjs')}){
 const folder=path.join(dir,'uploads');
 async function handle(req,res,name){
  if(!['/api/auth/admin/integration-readiness','/api/auth/admin/original-fingerprint'].includes(name))return false;
  const actor=user(req);if(!actor){json(res,401,{error:'로그인이 필요합니다.'});return true;}if(!isAdmin(actor)){json(res,403,{error:'관리자 권한이 필요합니다.'});return true;}
  if(name.endsWith('/integration-readiness')&&req.method==='GET'){
   const raw=new URL(req.url,origin).searchParams.get('offset')||'0';if(!/^\d{1,6}$/.test(raw)||Number(raw)>100000){json(res,400,{error:'Invalid offset'});return true;}const offset=Number(raw);
   const orders=db.prepare('SELECT * FROM neon_test_orders ORDER BY created DESC,id LIMIT 26 OFFSET ?').all(offset).slice(0,26);
   const mapped=orders.slice(0,25).map(o=>{
    const target=db.prepare('SELECT a.id,a.user_id,a.status FROM creator_assets a JOIN catalog_links l ON l.asset_id=a.id WHERE l.public_id=?').get(o.asset_id-1000),member=db.prepare('SELECT id FROM users WHERE id=?').get(o.user_id),ledger=db.prepare('SELECT user_id,delta,balance_before,balance_after FROM neon_test_ledger WHERE order_id=?').all(o.id);const issues=[];
    if(!member)issues.push('BUYER_MISSING');if(!target)issues.push('STATIC_OR_UNMAPPED_ASSET_ARCHIVE_ONLY');if(target?.user_id===o.user_id)issues.push('SELF_PURCHASE');if(target&&!db.prepare('SELECT id FROM users WHERE id=?').get(target.user_id))issues.push('SELLER_MISSING');
    if(!Number.isSafeInteger(o.price)||o.price<=0)issues.push('INVALID_PRICE');if(ledger.length!==1||ledger.some(l=>l.user_id!==o.user_id||!Number.isSafeInteger(l.delta)||!Number.isSafeInteger(l.balance_before)||!Number.isSafeInteger(l.balance_after)||l.balance_before<0||l.balance_after<0||l.delta!==-o.price||l.balance_before+l.delta!==l.balance_after))issues.push('LEDGER_MISMATCH');
    return {orderId:o.id,buyerId:o.user_id,assetId:target?.id??null,sellerId:target?.user_id??null,source:'TEST_ARCHIVE',issues,liveImportAllowed:false,rightsGranted:false};
   });
   const files=db.prepare("SELECT f.id,f.asset_id,f.name,f.size,p.digest FROM creator_files f LEFT JOIN creator_original_fingerprints p ON p.file_id=f.id WHERE f.kind='original' ORDER BY f.created DESC,f.id LIMIT 26 OFFSET ?").all(offset);
   db.prepare('INSERT INTO admin_access_audit VALUES(?,?,?,?)').run(crypto.randomUUID(),actor.id,'integration-readiness',Date.now());json(res,200,{mode:'PREPARATION_ONLY',engineConnected:false,financialEffects:false,orders:mapped,originals:files.slice(0,25).map(f=>({...f,fingerprintRecorded:!!f.digest})),nextOffset:orders.length>25||files.length>25?offset+25:null});return true;
  }
  if(req.method!=='POST'){json(res,405,{error:'Method not allowed'});return true;}if(req.headers.origin!==origin){json(res,403,{error:'Invalid origin'});return true;}if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){json(res,415,{error:'JSON required'});return true;}
  let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>4096){json(res,413,{error:'Request too large'});return true;}chunks.push(c);}let i;try{i=JSON.parse(Buffer.concat(chunks))}catch{}
  if(!i||typeof i.fileId!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(i.fileId)){json(res,400,{error:'Invalid file'});return true;}
  const source=db.prepare("SELECT f.*,a.user_id AS owner_id FROM creator_files f JOIN creator_assets a ON a.id=f.asset_id WHERE f.id=? AND f.kind='original'").get(i.fileId);if(!source||source.user_id!==source.owner_id){json(res,404,{error:'Original not found'});return true;}
  const filename=path.join(folder,source.id);let file,initial;try{if(fs.lstatSync(filename).isSymbolicLink())throw Error();const real=fs.realpathSync(filename),base=fs.realpathSync(folder);if(path.dirname(real)!==base)throw Error();file=await fs.promises.open(filename,fs.constants.O_RDONLY);const stat=await file.stat();initial=stat;if(!stat.isFile()||stat.size!==source.size||stat.size>300*1024*1024)throw Error();}catch{await file?.close();json(res,409,{error:'Original size or path mismatch'});return true;}
  let digest;try{const hash=crypto.createHash('sha256');for await(const chunk of file.createReadStream({autoClose:false}))hash.update(chunk);const stat=await file.stat();if(stat.size!==source.size||stat.mtimeMs!==initial.mtimeMs||stat.ctimeMs!==initial.ctimeMs||stat.ino!==initial.ino)throw Error('Original changed');digest=hash.digest('hex');}finally{await file.close();}
  db.exec('BEGIN IMMEDIATE');try{
   const latest=db.prepare("SELECT asset_id,user_id,size FROM creator_files WHERE id=? AND kind='original'").get(source.id);if(!latest||latest.asset_id!==source.asset_id||latest.user_id!==source.user_id||latest.size!==source.size)throw Error('Original metadata changed');
   const prior=db.prepare('SELECT digest,size FROM creator_original_fingerprints WHERE file_id=?').get(source.id);if(prior&&(prior.digest!==digest||prior.size!==source.size)){db.exec('ROLLBACK');json(res,409,{error:'Recorded fingerprint differs; manual investigation required'});return true;}
   if(!prior)db.prepare('INSERT INTO creator_original_fingerprints VALUES(?,?,?,?,?,?)').run(source.id,source.asset_id,source.user_id,digest,source.size,Date.now());
   const duplicates=db.prepare('SELECT DISTINCT asset_id FROM creator_original_fingerprints WHERE digest=? AND file_id<>? AND asset_id<>?').all(digest,source.id,source.asset_id).map(r=>r.asset_id);
   db.prepare('INSERT INTO admin_access_audit VALUES(?,?,?,?)').run(crypto.randomUUID(),actor.id,'original-fingerprint',Date.now());db.exec('COMMIT');json(res,200,{ok:true,fileId:source.id,alreadyRecorded:!!prior,duplicateAssetIds:duplicates,originalChanged:false,rightsGranted:false});
  }catch(error){db.exec('ROLLBACK');throw error;}return true;
 }
 return handle;
};
