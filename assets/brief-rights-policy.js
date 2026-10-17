(function(root){
 'use strict';
 const version='BRIEF_FINAL_ONLY_V1';
 const clauses=[
  ['거래 중개와 당사자 협의','Brief의 독점·비독점 여부와 이용 범위는 판매자와 구매자가 협의하여 정합니다. NovaNoxX는 거래를 중개하며 제작·판매 계약의 당사자가 아닙니다.'],
  ['최종 납품물','최종 납품물에는 거래에서 정한 최종본만 포함됩니다.'],
  ['상업적 이용·수정','거래가 완료된 최종 납품물의 상업적 이용·수정 권한은 구매자에게 부여됩니다. 판매자가 적법하게 허락할 수 있는 범위 및 사전에 고지된 제3자 이용 조건을 따릅니다.'],
  ['사이트 내 재판매','최종 납품물의 NovaNoxX 내 무단 재판매는 금지되며, 확인 시 운영 검토·제재 대상이 될 수 있습니다.'],
  ['제3자 소재와 책임','판매자는 폰트·음원·이미지 등 제3자 소재의 이용 허락과 판매·납품에 필요한 권한을 확보하고, 이용 범위·기간·매체·추가 라이선스 필요 여부 등 제한 사항을 거래 전에 고지해야 합니다. 구매자는 고지된 이용 조건을 준수해야 합니다. NovaNoxX의 중개나 검토·승인은 제3자 권리 또는 라이선스의 보증을 의미하지 않습니다. 권리 침해 신고가 접수되면 관련 자료 제출을 요청하고 게시·거래를 검토할 수 있습니다. 다만 관련 법령에 따른 NovaNoxX의 의무와 책임은 배제되지 않습니다.']
 ];
 function terms(mode){if(!['EXCLUSIVE','MULTI'].includes(mode))throw Error('INVALID_INPUT');return {policyVersion:version,contractVersion:version,source:'BRIEF_PARTY_AGREEMENT_PLATFORM_INTERMEDIATION',mode,exclusivity:'AGREED_BETWEEN_PARTIES',referenceRoute:'brief-terms',platformParty:false,deliveryScope:'FINAL_ONLY',usageRights:{commercial:true,modify:true,resell:false,redistribute:false},rightsSubjectTo:'SELLER_AUTHORITY_AND_DISCLOSED_THIRD_PARTY_TERMS',onSiteResale:'SUBJECT_TO_REVIEW_AND_SANCTIONS',thirdPartyDisclosure:'SELLER_REQUIRED',statutoryPlatformDutiesPreserved:true,clauses:clauses.map(([title,body])=>({title,body}))};}
 const api={version,clauses,terms};if(typeof module!=='undefined')module.exports=api;else root.NNX_BRIEF_RIGHTS=api;
})(typeof globalThis!=='undefined'?globalThis:this);
