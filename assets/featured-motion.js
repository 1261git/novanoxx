(() => {
 const section=document.querySelector('.featured-collection'),video=section?.querySelector('video'),reduced=matchMedia('(prefers-reduced-motion: reduce)');if(!video)return;
 let visible=false,ready=false;
 function sync(){const play=visible&&!document.hidden&&!section.hidden&&document.body.classList.contains('marketplace-view')&&!reduced.matches;section.classList.toggle('featured-motion-active',play);if(play&&ready)video.play().catch(()=>{});else video.pause()}
 video.addEventListener('loadedmetadata',()=>{video.currentTime=video.duration>5?5:0;ready=true;sync()});
 video.addEventListener('timeupdate',()=>{if(video.duration>5&&(video.currentTime<5||video.currentTime>=12))video.currentTime=5});
 if(video.readyState>=1){video.currentTime=video.duration>5?5:0;ready=true}
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync()},{threshold:.15}).observe(section);
 document.addEventListener('visibilitychange',sync);window.addEventListener('hashchange',sync);reduced.addEventListener('change',sync);sync();
})();
