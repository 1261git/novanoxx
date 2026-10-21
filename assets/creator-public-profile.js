'use strict';
async function renderCreatorPublicProfile(){
 const id=new URLSearchParams(location.hash.split('?')[1]||'').get('id');
 document.title=uiText('크리에이터 공개 프로필')+' — NovaNoxX';
 page.innerHTML=pageHeading('CREATOR / PUBLIC PROFILE','크리에이터 공개 프로필','크리에이터의 소개와 판매 중인 에셋을 만나보세요.')+'<p role="status" data-i18n="프로필을 불러오는 중이에요.">프로필을 불러오는 중이에요.</p>';
 const current=()=>page.dataset.route==='creator'&&new URLSearchParams(location.hash.split('?')[1]||'').get('id')===id;
 try{
  const r=await fetch('/api/catalog/creator?id='+encodeURIComponent(id||''));if(!r.ok)throw Error('공개 프로필을 찾을 수 없습니다.');const data=await r.json();if(!current())return;
  const p=data.profile;page.innerHTML=pageHeading('CREATOR / PUBLIC PROFILE','크리에이터 공개 프로필','크리에이터의 소개와 판매 중인 에셋을 만나보세요.')+`<section class="page-panel public-creator-intro"><div class="creator-avatar-row"><span class="creator-avatar">${p.avatarUrl?`<img src="${esc(p.avatarUrl)}" alt="${esc(uiText('프로필 사진'))}">`:esc(Array.from(p.displayName)[0]||'')}</span><div><h2>${esc(p.displayName)}</h2><p>${esc(p.country)} · ${esc(p.language==='ko'?uiText('한국어'):p.language==='en'?'English':uiText('한국어 / English'))}</p></div></div><p class="public-creator-bio">${esc(p.bio)}</p></section><section><h2 data-i18n="판매 중인 에셋">판매 중인 에셋</h2>${data.assets.length?`<div class="public-creator-grid">${data.assets.map(a=>`<a class="page-panel public-creator-asset" href="#/assets/${a.id}"><div class="public-creator-preview">${a.imgUrl?`<img src="${esc(a.imgUrl)}" alt="${esc(a.title)}" loading="lazy">`:`<span>${esc(categoryLabels[a.cat]||a.cat)}</span>`}</div><h3>${esc(a.title)}</h3><p>${esc(categoryLabels[a.cat]||a.cat)} · ${esc(uiText(a.saleMode==='MULTI'?'여러 사람에게 판매':'독점 판매'))}</p><strong>₩${(Number(a.price)*100).toLocaleString(uiLocale())}</strong></a>`).join('')}</div>`:'<div class="page-panel"><p data-i18n="현재 판매 중인 공개 에셋이 없습니다.">현재 판매 중인 공개 에셋이 없습니다.</p><a class="outline-link" href="#/marketplace" data-i18n="마켓플레이스로 ↗">마켓플레이스로 ↗</a></div>'}</section>`;
  document.title=p.displayName+' — NovaNoxX';
 }catch{if(current())page.innerHTML=pageHeading('CREATOR / PUBLIC PROFILE','공개 프로필을 찾을 수 없습니다.','마켓플레이스에서 다른 에셋을 찾아보세요.');}
}

