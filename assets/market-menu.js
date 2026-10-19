(()=>{
 const trigger=document.getElementById('market-nav');if(!trigger)return;
 const wrap=document.createElement('div');wrap.className='market-nav-dropdown';trigger.before(wrap);wrap.append(trigger);
 trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','market-category-menu');
 const menu=document.createElement('div');menu.id='market-category-menu';menu.className='market-category-menu';menu.hidden=true;
 const href=(cat,sub='ALL')=>'#/marketplace?'+new URLSearchParams({category:cat,subcategory:sub});
 menu.innerHTML='<a class="market-all-link" href="#/marketplace?category=ALL"><span data-i18n="전체 에셋 보기 ↗">전체 에셋 보기 ↗</span></a><ul>'+['VIDEO','2D','3D','AUDIO','DOCUMENTS','AI_TOOLS'].map(cat=>`<li><a class="market-parent-link" href="${href(cat)}" aria-expanded="false" aria-controls="market-sub-${cat}"><span data-i18n-category="${esc(cat)}">${esc(categoryLabels[cat])}</span><span aria-hidden="true">›</span></a><div class="market-submenu" id="market-sub-${cat}" hidden><strong data-i18n-category="${esc(cat)}">${esc(categoryLabels[cat])}</strong><a href="${href(cat)}">전체 ${esc(categoryLabels[cat])} 보기</a>${subcategories[cat].map(sub=>`<a href="${href(cat,sub)}">${categoryLabel(sub)}</a>`).join('')}</div></li>`).join('')+'</ul>';
 wrap.append(menu);let timer;
 function close(){clearTimeout(timer);menu.hidden=true;trigger.setAttribute('aria-expanded','false');menu.querySelectorAll('.market-submenu').forEach(el=>el.hidden=true);menu.querySelectorAll('.market-parent-link').forEach(el=>el.setAttribute('aria-expanded','false'))}
 function open(){clearTimeout(timer);menu.style.top=matchMedia('(max-width:760px)').matches?Math.max(0,Math.round(document.querySelector('header').getBoundingClientRect().bottom))+8+'px':'';menu.hidden=false;trigger.setAttribute('aria-expanded','true')}
 function select(link){menu.querySelectorAll('.market-parent-link').forEach(el=>{const active=el===link;el.setAttribute('aria-expanded',String(active));document.getElementById(el.getAttribute('aria-controls')).hidden=!active})}
 const touchMenu=()=>matchMedia('(hover: none), (pointer: coarse)').matches;
 // Touch pointerleave fires when a finger lifts; it is not a request to dismiss.
 wrap.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&!touchMenu())open()});wrap.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!touchMenu())timer=setTimeout(()=>{if(!wrap.contains(document.activeElement))close()},180)});
 trigger.addEventListener('focus',open);trigger.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();open();menu.querySelector('a').focus()}});
 // Touch opens the hierarchy first; the menu's explicit links navigate.
 trigger.addEventListener('click',e=>{if(touchMenu()){e.preventDefault();e.stopImmediatePropagation();open()}},true);
 menu.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse'||touchMenu())return;const link=e.target.closest('.market-parent-link');if(link)select(link)});
 menu.addEventListener('focusin',e=>{const link=e.target.closest('.market-parent-link');if(link)select(link)});
 menu.addEventListener('keydown',e=>{const link=e.target.closest('.market-parent-link');if(link&&e.key==='ArrowRight'){e.preventDefault();select(link);document.getElementById(link.getAttribute('aria-controls')).querySelector('a').focus()}if(e.key==='ArrowLeft'&&e.target.closest('.market-submenu')){e.preventDefault();menu.querySelector(`[aria-controls="${e.target.closest('.market-submenu').id}"]`).focus()}});
 menu.addEventListener('click',e=>{const link=e.target.closest('a');if(link){if(link.classList.contains('market-parent-link')&&touchMenu()){e.preventDefault();select(link);return;}if(link.hash===location.hash){e.preventDefault();route()}close();trigger.blur()}});
 wrap.addEventListener('focusout',e=>{if(!wrap.contains(e.relatedTarget)&&(!touchMenu()||e.relatedTarget))close()});
 wrap.addEventListener('keydown',e=>{if(e.key==='Escape'){trigger.focus();close()}});
 document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target))close()});window.addEventListener('hashchange',close);
 // Mobile browser chrome / keyboard resizes height while the user scrolls.
 let viewportWidth=window.innerWidth;
 window.addEventListener('resize',()=>{if(window.innerWidth!==viewportWidth){viewportWidth=window.innerWidth;close()}});
})();
