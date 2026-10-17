'use strict';
const DAY=86400000,MAX_STORED_BYTES=require('./backup-automation-policy.cjs').LIMITS.managedRemoteBytes;
function estimate({days,dailyCopies=1,snapshotBytes,existingRetainedBytes}){
 if(!Number.isSafeInteger(days)||days<1||days>365||!Number.isSafeInteger(dailyCopies)||dailyCopies<1||dailyCopies>24)throw Error('INVALID_INPUT');
 const common={scope:'DISCOVERY_RAW_FUTURE_V1',days,dailyCopies,capBytes:MAX_STORED_BYTES,existingBackupsPreserved:true,automaticProvisioning:false};
 if(snapshotBytes===null||snapshotBytes===undefined||existingRetainedBytes===null||existingRetainedBytes===undefined)return {...common,allowed:false,status:'MEASUREMENT_REQUIRED',estimatedBytes:null};
 if(!Number.isSafeInteger(snapshotBytes)||snapshotBytes<1||!Number.isSafeInteger(existingRetainedBytes)||existingRetainedBytes<0)throw Error('INVALID_INPUT');
 const estimatedBytes=snapshotBytes*days*dailyCopies,totalBytes=existingRetainedBytes+estimatedBytes;if(!Number.isSafeInteger(totalBytes))throw Error('INVALID_INPUT');return {...common,estimatedBytes,totalBytes,allowed:totalBytes<=MAX_STORED_BYTES,status:totalBytes<=MAX_STORED_BYTES?'WITHIN_STORAGE_BUDGET_NOT_DEPLOYMENT_APPROVAL':'STOP_CAPACITY_EXCEEDED'};
}
function inspect(receipt,now,latestDeletionAt){
 if(receipt?.scope!=='DISCOVERY_RAW_FUTURE_V1'||!Number.isSafeInteger(receipt.createdAt)||!Number.isSafeInteger(receipt.retentionDays)||receipt.retentionDays<1||receipt.retentionDays>365||!Number.isSafeInteger(now)||!Number.isSafeInteger(latestDeletionAt)||latestDeletionAt<0||receipt.createdAt>now)throw Error('DISCOVERY_BACKUP_SCOPE_REQUIRED');
 const expiresAt=receipt.createdAt+receipt.retentionDays*DAY;if(!Number.isSafeInteger(expiresAt))throw Error('INVALID_INPUT');const expired=now>=expiresAt,deletionFilterRequired=latestDeletionAt>=receipt.createdAt&&latestDeletionAt!==0;
 return {expiresAt,expired,rawAccessAllowed:!expired&&!deletionFilterRequired,verifiedDeletionFilterRequired:deletionFilterRequired,restoreCollectionEnabled:false,legacyBackupDeletionAllowed:false,eligibleForFutureManagedExpiry:expired,automaticDeletion:false};
}
module.exports={estimate,inspect};
