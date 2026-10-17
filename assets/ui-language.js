(function(root){
 'use strict';
 const dictionary=typeof module!=='undefined'?require('./ui-translations.js'):root.NNX_TRANSLATIONS;
 function translate(source,language){if(language!=='en')return source;if(Object.hasOwn(dictionary,source))return dictionary[source];const patterns=[[/^(\d+)개의 에셋 · 영상은 선택된 구간의 무음 미리보기$/,n=>n+' assets · silent video previews of selected segments'],[/^(.+)님의 크리에이터 대시보드$/,name=>name+' · Creator dashboard'],[/^에셋 상세 (.+)$/,title=>'Asset details: '+title],[/^찜하기 (.+)$/,title=>'Save asset: '+title],[/^(테스트 NEON|NEON) 잔액 (\d+), 지갑 열기$/,(label,n)=>(label==='테스트 NEON'?'TEST NEON':'NEON')+' balance '+n+', open wallet']];for(const [pattern,format]of patterns){const match=pattern.exec(source);if(match)return format(...match.slice(1));}return source;}
 function normalize(language){return language==='en'?'en':'ko';}
 function localizeElement(element,language){
  if(element.closest('[translate="no"]'))return;const key=element.getAttribute('data-i18n');
  if(key&&(Object.hasOwn(dictionary,key)||translate(key,'en')!==key)){
   // Only source-marked interface text is translated. Inputs and user content are never scanned.
   if(element.tagName==='OPTION'&&!element.hasAttribute('value'))element.setAttribute('value',element.textContent);
   for(const node of element.childNodes)if(node.nodeType===3&&[key,translate(key,'en')].includes(node.nodeValue.trim())){const whitespace=/^(\s*)[\s\S]*?(\s*)$/.exec(node.nodeValue);const next=whitespace[1]+translate(key,language)+whitespace[2];if(node.nodeValue!==next)node.nodeValue=next;}
  }
  for(const attribute of ['aria-label','placeholder','title']){const source=element.getAttribute('data-i18n-'+attribute);if(source&&(Object.hasOwn(dictionary,source)||translate(source,'en')!==source)){const value=translate(source,language);if(element.getAttribute(attribute)!==value)element.setAttribute(attribute,value);}}
 }
 if(typeof module!=='undefined'){module.exports={translate,normalize,localizeElement};return;}
 let language='ko';try{language=normalize(localStorage.getItem('nnx-ui-language'));}catch{}
 root.uiText=source=>translate(source,language);root.uiMessage=(element,source)=>{element.setAttribute('data-i18n',source);element.textContent=source;localizeElement(element,language);};root.uiLocale=()=>language==='en'?'en-US':'ko-KR';
 const selectors='[data-i18n],[data-i18n-aria-label],[data-i18n-placeholder],[data-i18n-title]';
 let observer,scheduled=false,titleRecord=null;
 function apply(){scheduled=false;observer?.disconnect();document.documentElement.lang=language;if(!document.querySelector('.route-page')?.dataset.route?.startsWith('assets/')){if(!titleRecord||document.title!==titleRecord.rendered)titleRecord={source:document.title};const label=titleRecord.source.split(' — ')[0];titleRecord.rendered=translate(label,language)+titleRecord.source.slice(label.length);if(document.title!==titleRecord.rendered)document.title=titleRecord.rendered;}const routeHost=document.querySelector('.route-page'),route=routeHost?.dataset.route;const legal=['exclusive-contract','license-contract','refund-policy'].includes(route);if(legal&&routeHost){let note=routeHost.querySelector('[data-original-language]');if(!note){note=document.createElement('p');note.setAttribute('data-original-language','');note.className='page-panel';note.lang='en';note.textContent=route==='refund-policy'?'The original policy is in Korean. Review the Korean policy below.':'The original agreement is in Korean. Review the Korean agreement below.';routeHost.prepend(note);}note.hidden=language!=='en';}document.querySelectorAll(selectors).forEach(element=>localizeElement(element,language));const selector=document.getElementById('ui-language');if(selector)selector.value=language;observer?.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-i18n','aria-label','placeholder','title']});}
 function setLanguage(value,persist=true){language=normalize(value);if(persist)try{localStorage.setItem('nnx-ui-language',language);}catch{}apply();document.dispatchEvent(new CustomEvent('nnx-language-change',{detail:{language}}));}
 document.addEventListener('DOMContentLoaded',()=>{
  const host=document.querySelector('header .account');if(host){const label=document.createElement('label');label.className='ui-language-control';label.innerHTML='<span class="sr-only">Language / 언어</span><select id="ui-language" aria-label="Language / 언어"><option value="ko">한국어</option><option value="en">English</option></select>';host.append(label);label.querySelector('select').onchange=event=>setLanguage(event.target.value);}
  observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;queueMicrotask(apply);}});apply();
 });
 window.addEventListener('storage',event=>{if(event.key==='nnx-ui-language')setLanguage(event.newValue,false);});
})(typeof globalThis!=='undefined'?globalThis:this);
