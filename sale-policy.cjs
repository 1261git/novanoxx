'use strict';
// User decisions: existing product contract templates; total fee 15% (PG and fee VAT included), floor below KRW 1.
const version='SALE_KRW_FLOOR_15_V2',contractVersion='2026-10-11-v1';
function fee(grossKrw){
 if(!Number.isSafeInteger(grossKrw)||grossKrw<0)throw Error('INVALID_INPUT');
 const gross=BigInt(grossKrw),feeKrw=Number(gross*15n/100n);
 return {policyVersion:version,currency:'KRW',grossKrw,ratePercent:15,feeKrw,sellerNetKrw:grossKrw-feeKrw,rounding:'FLOOR_BELOW_ONE_KRW',payout:'NOT_EXECUTED'};
}
function terms(mode){
 if(!['EXCLUSIVE','MULTI'].includes(mode))throw Error('INVALID_INPUT');
 return {policyVersion:version,mode,contractVersion,referenceRoute:mode==='EXCLUSIVE'?'exclusive-contract':'license-contract',source:'EXISTING_PRODUCT_SALE_TERMS',usageRights:{commercial:true,modify:true,redistribute:false,resell:false},redistributionResale:'SEPARATE_AGREEMENT_REQUIRED',thirdPartyRights:'SELLER_DISCLOSURE_REQUIRED',delivery:'FINAL_AFTER_CONFIRMATION',reviewHours:24,revisionCount:0};
}
module.exports={version,contractVersion,fee,terms};
