'use strict';
(()=>{
 const main=document.querySelector('main');if(!main)return;
 main.id='main-content';main.tabIndex=-1;
 const skip=document.createElement('a');skip.className='skip-link';skip.href='#main-content';uiMessage(skip,'본문으로 바로가기');document.body.prepend(skip);
 skip.onclick=e=>{e.preventDefault();main.focus();main.scrollIntoView({block:'start'});};
 const visible=e=>!!e.getClientRects().length&&!e.closest('[hidden]');let handled=null,frame;
 function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
  const key=location.hash||'#/',route=key.replace(/^#\/?/,'').split('?')[0],page=main.querySelector('.route-page');
  if(page&&page.dataset.route!==route)return;
  if(handled===key)return;const heading=[...main.querySelectorAll('h1')].find(visible);if(!heading)return;
  if(main.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select,[contenteditable="true"]')){handled=key;return;}
  heading.tabIndex=-1;heading.focus({preventScroll:true});handled=key;
 });}
 new MutationObserver(schedule).observe(main,{childList:true,subtree:true});window.addEventListener('hashchange',schedule);schedule();
 function close(wrap){wrap.classList.remove('is-open');wrap.querySelector('#account-session-button')?.setAttribute('aria-expanded','false');}
 document.addEventListener('focusout',e=>{const wrap=e.target.closest('.account-profile-menu');if(wrap&&!wrap.contains(e.relatedTarget))close(wrap);});
 document.addEventListener('pointerdown',e=>{document.querySelectorAll('.account-profile-menu.is-open').forEach(wrap=>{if(!wrap.contains(e.target))close(wrap);});});
 document.addEventListener('keydown',e=>{if(e.key!=='ArrowDown'||e.target.id!=='account-session-button')return;const wrap=e.target.closest('.account-profile-menu'),link=wrap?.querySelector('.account-profile-popover a');if(link){e.preventDefault();wrap.classList.add('is-open');e.target.setAttribute('aria-expanded','true');link.focus();}});
})();
