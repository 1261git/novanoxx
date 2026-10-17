'use strict';
// Metadata checks only. No migration, balance movement or entitlement writes.
module.exports=function({db}){
 const has=name=>Boolean(db.prepare("SELECT name FROM sqlite_master WHERE name='"+name+"'").get());
 const enginePresent=has('engine_orders'),entitlementsPresent=has('original_entitlements'),fingerprintsPresent=has('creator_original_fingerprints');
 function order(source,mapped){
  const issues=[...mapped.issues];let existingEngineOrder=false;
  if(enginePresent){
   const existing=db.prepare('SELECT id,buyer,seller,asset_id,public_id,price FROM engine_orders WHERE id=?').get(source.id);
   if(existing){existingEngineOrder=true;if(existing.buyer!==source.user_id||existing.seller!==mapped.sellerId||existing.asset_id!==mapped.assetId||existing.public_id!==source.asset_id||existing.price!==source.price)issues.push('ENGINE_ORDER_CONFLICT');}
  }
  if(entitlementsPresent&&db.prepare("SELECT order_id FROM original_entitlements WHERE order_id=? AND status='PAID'").get(source.id))issues.push('TEST_ORDER_LIVE_ENTITLEMENT_CONFLICT');
  return {...mapped,issues:[...new Set(issues)],existingTestEngineOrder:existingEngineOrder,archiveAction:'PRESERVE_ONLY',createOperatingOrderAllowed:false,liveImportAllowed:false,rightsGranted:false};
 }
 function original(file){
  const issues=[];
  if(!file.asset_owner||file.user_id!==file.asset_owner)issues.push('FILE_OWNER_MISMATCH');
  if(!Number.isSafeInteger(file.size)||file.size<1)issues.push('FILE_SIZE_INVALID');
  const present=file.digest!==null&&file.digest!==undefined;
  if(!fingerprintsPresent)issues.push('FINGERPRINT_STORAGE_MISSING');
  else if(!present)issues.push('FINGERPRINT_MISSING');
  else if(typeof file.digest!=='string'||!/^[a-f0-9]{64}$/.test(file.digest)||file.fingerprint_asset_id!==file.asset_id||file.fingerprint_seller_id!==file.user_id||file.fingerprint_size!==file.size)issues.push('FINGERPRINT_METADATA_MISMATCH');
  return {...file,fingerprintRecorded:fingerprintsPresent&&present&&!issues.includes('FINGERPRINT_METADATA_MISMATCH'),fingerprintStorageReady:fingerprintsPresent,issues,metadataChecked:true,eligibleForPhysicalVerification:issues.length===0,physicalFileVerified:false,operatingAccessGranted:false};
 }
 return {order,original,summary:{mode:'READ_ONLY_SOURCE_METADATA_AUDIT',accountMapping:'PRESERVE_EXISTING_IMMUTABLE_IDS_NO_EMAIL_MERGE',testOrderPolicy:'ARCHIVE_ONLY_NO_OPERATING_ORDER_CREATION',testBalancesTransferAllowed:false,testRightsTransferAllowed:false,targetOperatingDatabaseConfigured:false,consistentMigrationSnapshot:false,engineTableChecked:enginePresent,liveEntitlementTableChecked:entitlementsPresent,fingerprintTableChecked:fingerprintsPresent,operatingMigrationAllowed:false}};
};
