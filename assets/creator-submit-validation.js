(function(root){
 function missing(asset,files=[]){
  const out=[],add=(key,label,step)=>out.push({key,label,step});
  for(const [key,label,step]of [['category','카테고리',0],['subcategory','하위 카테고리',0],['title','제목',1],['description','내용',1],['deliverables','최종 납품 세부사항',1],['contribution','직접 작업한 부분·제3자 소재 사용 내역',5]])if(!String(asset[key]||'').trim())add(key,label,step);
  if(!Number.isSafeInteger(Number(asset.price))||Number(asset.price)<1)add('price','판매 가격 (NEON)',4);
  if(!files.some(f=>f.kind==='original'))add('original','최종 납품 원본',2);
  if(!files.some(f=>f.kind==='preview'))add('preview','워터마크가 포함된 공개용 미리보기',2);
  if(!['yes','no'].includes(asset.thirdPartyAssets))add('thirdPartyAssets','제3자 소재 사용 여부',5);
  if(!asset.contract||asset.contract.mode!==asset.saleMode||asset.contract.version!=='2026-10-11-v1')add('contractAccepted','판매 계약 동의',6);
  if(!asset.rightsConfirmed)add('rightsConfirmed','이용 권한 및 판매자 권리 보유·제한 고지 확인',6);
  if(asset.saleMode==='MULTI'&&!asset.usageRights?.commercial)add('rightsCommercialModify','상업적 이용·수정 허용',6);
  return out;
 }
 if(typeof module!=='undefined')module.exports={missing};else root.CreatorSubmitValidation={missing};
})(typeof window==='undefined'?null:window);

function setupCreatorSubmissionFeedback(form,asset,show,sections){
 const summary=document.createElement('section');summary.className='creator-missing-summary';summary.setAttribute('role','alert');summary.hidden=true;form.append(summary);
 const inputFor=key=>['original','preview'].includes(key)?form.querySelector('[data-file-kind="'+key+'"]'):form.elements.namedItem(key);
 function mark(){for(const key of ['subcategory','title','description','deliverables','price','contribution','thirdPartyAssets','contractAccepted','rightsConfirmed',...(form.elements.saleMode.value==='MULTI'?['rightsCommercialModify']:[]),'original','preview']){const input=inputFor(key),parent=input?.closest('label');if(!parent||parent.querySelector('.creator-required-marker'))continue;const marker=document.createElement('small');marker.className='creator-required-marker';uiMessage(marker,'(*필수 작성란입니다*)');parent.append(marker);}}
 function report(items){summary.replaceChildren();summary.hidden=!items.length;form.querySelectorAll('[aria-invalid=true]').forEach(input=>input.removeAttribute('aria-invalid'));if(!items.length)return;const title=document.createElement('strong');uiMessage(title,'심사 제출되지 않았습니다. 아래 누락·오류 항목을 확인해주세요.');summary.append(title);const list=document.createElement('ul');for(const item of items){const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.className='creator-missing-link';button.textContent=uiText(item.label)+' · '+uiText('바로가기');button.onclick=()=>{show(item.step);inputFor(item.key)?.focus();};li.append(button);list.append(li);inputFor(item.key)?.setAttribute('aria-invalid','true');}summary.append(list);summary.scrollIntoView({block:'nearest',behavior:'smooth'});}
 function validate(){const values=Object.fromEntries(new FormData(form)),mode=values.saleMode;report(CreatorSubmitValidation.missing({...values,contract:form.elements.contractAccepted.checked?{mode,version:'2026-10-11-v1'}:null,rightsConfirmed:form.elements.rightsConfirmed.checked,usageRights:{commercial:form.elements.rightsCommercialModify.checked}},asset.files||[]));return summary.hidden;}
 mark();form.addEventListener('change',mark);form.creatorFeedback={report};
 return {validate,invalid(input){report([{key:input.name,label:input.closest('label')?.childNodes[0]?.textContent?.trim()||input.name,step:Math.max(0,sections.findIndex(s=>s.contains(input)))}]);}};
}
