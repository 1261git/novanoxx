(() => {
 const section=document.querySelector('.monthly-awards'),slides=[...section.querySelectorAll('.award-slide')],tabs=[...section.querySelectorAll('.award-tabs button')],pause=section.querySelector('.award-pause'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 if(!slides.length||!pause)return;
 let index=0,elapsed=0,last=performance.now(),visible=false,paused=reduced.matches;
 function active(){return visible&&!document.hidden&&!section.hidden&&!paused&&document.body.classList.contains('marketplace-view')}
 function media(){slides.forEach((slide,i)=>{const v=slide.querySelector('video');if(v){if(i===index&&active())v.play().catch(()=>{});else v.pause()}});section.classList.toggle('awards-paused',!active())}
 function show(i){index=i;elapsed=0;slides.forEach((slide,n)=>{slide.hidden=n!==i;slide.classList.toggle('is-current',n===i);const v=slide.querySelector('video');if(v&&n===i)v.currentTime=0});tabs.forEach((tab,n)=>tab.setAttribute('aria-pressed',String(n===i)));media()}
 tabs.forEach((tab,i)=>tab.addEventListener('click',()=>show(i)));
 function updatePause(){pause.setAttribute('aria-pressed',String(paused));pause.textContent=paused?'▶ 자동 재생':'Ⅱ 일시정지';pause.setAttribute('aria-label',paused?'어워드 자동 전환 재생':'어워드 자동 전환 일시정지');media()}
 pause.addEventListener('click',()=>{paused=!paused;updatePause()});new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;media()},{threshold:.15}).observe(section);
 document.addEventListener('visibilitychange',media);window.addEventListener('hashchange',media);reduced.addEventListener('change',()=>{paused=reduced.matches;updatePause()});
 setInterval(()=>{const now=performance.now(),delta=Math.min(now-last,500);last=now;if(active()){elapsed+=delta;if(elapsed>=10000)show((index+1)%slides.length)}},100);updatePause();
})();
