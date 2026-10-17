'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function({transitionAudit={}}={}){
 const sql=fs.readFileSync(path.join(__dirname,'database/002-operating-engine.sql'));
 return {version:'OPERATING_CONNECTION_PLAN_V1',mode:'PREPARED_NOT_BOUND',liveTrading:false,realBilling:false,automaticSchemaApply:false,
  schema:{file:'database/002-operating-engine.sql',sha256:crypto.createHash('sha256').update(sql).digest('hex'),namespace:'nnx_operating_v1',existingPublicRowsModified:false},
  identities:{key:'existing immutable users.id',emailMerge:false},
  historicalTest:{orders:'PRESERVE_IN_PLACE',balances:'NO_TRANSFER',entitlements:'NO_PROMOTION',unmappedOrders:transitionAudit.unmappedOrders??null},
  payment:{currency:'KRW',feePercent:12,fraction:'FLOOR_BELOW_ONE_KRW',providerVerificationRequired:true,webhookDeduplication:true,timeout:'RECONCILE_BEFORE_RETRY',testPaymentAccepted:false},
  neonWallet:{mode:'CONTRACT_PENDING',testCreditTransfer:false,liveWalletLedgerEnabled:false,reviewDirectCardDoesNotDetermineOperatingPaymentModel:true},
  files:{existingSources:'PRESERVE_IN_PLACE',release:'VERIFIED_LIVE_PAYMENT_AND_COMPLETED_DELIVERY',eachDownload:'PARTICIPANT_ENTITLEMENT_REVOCATION_AND_HASH_CHECK',copy:'OFFLINE_VERIFY_BEFORE_SWITCH'},
  providerAdapter:{file:'financial-provider.cjs',prepared:true,liveRouteBound:false,billingEncryption:'AES_256_GCM_SUBSCRIPTION_BOUND',timeout:'RECONCILE_BEFORE_RETRY',automaticPayout:false},
  subscription:{testBillingKeysAccepted:false,providerContractRequired:true,billingKey:'ENCRYPTED_AT_REST_SERVER_ONLY',renewal:'UNIQUE_SUBSCRIPTION_AND_PERIOD',schedulerEnabled:false},
  blockers:['APPROVED_SOURCE_SNAPSHOT_AND_TARGET','OPERATING_REPOSITORY_AND_PROVIDER_ADAPTER','VERIFIED_PAYMENT_TO_ORDER_ATOMIC_HANDOFF','BILLING_ENCRYPTION_KEY_AND_PROVIDER_CONTRACT','FILE_MAPPING_AND_PHYSICAL_HASH_VERIFICATION','BACKUP_RESTORE_AND_RECONCILIATION','EXPLICIT_DEPLOYMENT_APPROVAL'],
  rollback:{beforeWrites:'REDEPLOY_PREVIOUS_CODE_WITH_NEW_NAMESPACE_UNBOUND',afterWrites:'QUIESCE_AND_RECONCILE_NOT_STALE_DATABASE_SWITCH',dropSchemaAutomatically:false}};
};
