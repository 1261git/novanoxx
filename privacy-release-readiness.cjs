'use strict';
module.exports=function(plan=require('./docs/privacy-release-plan.json')){
 const missing=[];
 for(const key of ['legalName','privacyOfficer','publicContact'])if(typeof plan.operator?.[key]!=='string'||!plan.operator[key].trim())missing.push('OPERATOR_'+key.toUpperCase());
 if(!Number.isSafeInteger(plan.futureDiscoveryBackups?.retentionFromCreationDays)||plan.futureDiscoveryBackups.retentionFromCreationDays<1||plan.futureDiscoveryBackups.retentionFromCreationDays>365)missing.push('DISCOVERY_BACKUP_PERIOD');
 for(const key of ['processorContractsConfirmed','storageLocationsAndInternationalTransfersConfirmed','rightsRequestProcedureConfirmed','legalReviewConfirmed'])if(plan.externalProcessingVerification?.[key]!==true)missing.push(key.toUpperCase());
 if(plan.discovery?.retentionDays!==120||plan.discovery.ipCollected!==false||plan.discovery.defaultAllowed!==false||plan.discovery.eraseOnWithdrawal!==true)missing.push('DISCOVERY_POLICY_MISMATCH');
 return {mode:'PREPARATION_ONLY',operatingCollectionEnabled:false,documentationReady:missing.length===0,missing,discoveryRetentionDays:120,backupRetentionDays:plan.futureDiscoveryBackups?.retentionFromCreationDays??null,existingBackupsPreserved:true,automaticBackupDeletion:false,legalComplianceCertified:false};
};
