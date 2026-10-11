(() => {
 const market=document.getElementById('market');
 const hero=document.createElement('div');hero.className='market-library-hero';
 hero.innerHTML='<div class="library-breadcrumb"><a href="#/">홈</a><span>/</span><a href="#/marketplace">마켓플레이스</a><span id="library-path"></span></div><div class="library-heading"><div><span class="eyebrow">NOVANOXX / CREATIVE LIBRARY</span><h1>아이디어를 발견하고, 소유하고, 활용하세요.</h1><p>영상부터 AI 도구까지, 당신의 프로젝트에 어울리는 크리에이티브.</p></div><div class="library-signature">ONE CREATIVE.<br><span>ONE SALE.</span></div></div>';
 market.prepend(hero);
 const heading=market.querySelector('.browse-heading');heading.querySelector('h2').id='library-results-title';heading.querySelector('.browse-note').textContent='에셋별 판매 방식과 이용 조건을 확인해 주세요.';
 const descriptions={ALL:'모든 가능성을 한곳에서',VIDEO:'움직임으로 전하는 이야기','2D':'아이디어에 새로운 시선을', '3D':'상상을 입체적인 현실로',AUDIO:'장면에 감각을 더하는 소리',DOCUMENTS:'생각을 설득력 있는 형태로',AI_TOOLS:'창작의 다음 단계를 여는 도구'};
 function syncLibrary(){
  const library=document.body.classList.contains('library-view');heading.querySelector('.browse-note').textContent=library?'에셋별 판매 방식과 이용 조건을 확인해 주세요.':'하나의 에셋, 단 한 명의 주인.';
  const label=category==='ALL'?'전체 에셋':categoryLabels[category];
  document.getElementById('library-path').textContent=category==='ALL'?'':' / '+label+(subcategory==='ALL'?'':' / '+(categoryLabels[subcategory]||subcategory));
  document.getElementById('library-results-title').textContent=library?(subcategory==='ALL'?descriptions[category]:(categoryLabels[subcategory]||subcategory)):'당신을 위한 에셋';
  document.querySelectorAll('#categories button').forEach((button,i)=>{button.dataset.index=String(i).padStart(2,'0');button.setAttribute('aria-pressed',String(button.dataset.cat===category));});
 }
 const originalRender=render;render=function(){originalRender();syncLibrary();};
 document.addEventListener('click',event=>{const button=event.target.closest('#categories button, #purposes button');if(!button||!document.body.classList.contains('library-view'))return;setTimeout(()=>{const query=new URLSearchParams({category,subcategory});history.replaceState(null,'','#/marketplace?'+query);});},true);
 syncLibrary();
})();
