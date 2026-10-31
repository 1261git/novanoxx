(function(){
 'use strict';
 const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tr=s=>typeof uiText==='function'?uiText(s):s;
 function safe(url){return typeof url==='string'&&/^\/api\/(?:catalog\/file|auth\/creator\/file)\?id=/.test(url)?escape(url):'';}
 function html(p,title=''){
  if(!p||!safe(p.url))return '<div class="nnx-media nnx-media-empty"><span>'+escape(tr('대표 이미지 또는 미리보기 파일을 등록해주세요.'))+'</span></div>';
  const src=safe(p.url),poster=safe(p.poster),alt=escape(title),image=poster?'<img src="'+poster+'" alt="'+alt+'" loading="lazy">':'';
  if(p.kind==='image')return '<div class="nnx-media"><img src="'+src+'" alt="'+alt+'" loading="lazy"></div>';
  if(p.kind==='video')return '<div class="nnx-media"><video controls playsinline preload="none" controlslist="nodownload noremoteplayback" disablepictureinpicture poster="'+poster+'" src="'+src+'" aria-label="'+alt+'"></video></div>';
  if(p.kind==='audio')return '<div class="nnx-media nnx-media-audio">'+image+'<span aria-hidden="true" class="nnx-audio-symbol">♫</span><audio controls preload="none" controlslist="nodownload" src="'+src+'" aria-label="'+alt+'"></audio></div>';
  if(p.kind==='model')return '<div class="nnx-media nnx-media-model">'+image+'<button type="button" data-model-preview="'+src+'" aria-label="'+escape(tr('3D 회전 미리보기'))+'">'+escape(tr('3D 회전 미리보기'))+'</button><small class="nnx-preview-status" role="status"></small></div>';
  if(p.kind==='text')return '<div class="nnx-media nnx-media-text"><pre data-text-preview="'+src+'" aria-label="'+alt+'">'+escape(tr('텍스트 샘플 불러오는 중…'))+'</pre><small>NovaNoxX · PREVIEW</small></div>';
  return '';
 }
 function interactive(a){const p=a.mediaPreview;return p&&['audio','model','text'].includes(p.kind)?'<div class="nnx-market-interactive">'+html(p,a.title)+'</div>':'';}
 let library;
 async function model(button){const wrap=button.closest('.nnx-media'),status=wrap.querySelector('[role=status]');button.disabled=true;try{library||=import('/assets/vendor/model-viewer/model-viewer.min.js');await library;await customElements.whenDefined('model-viewer');if(!button.isConnected)return;const viewer=document.createElement('model-viewer');viewer.src=button.dataset.modelPreview;viewer.setAttribute('camera-controls','');viewer.setAttribute('touch-action','pan-y');viewer.setAttribute('interaction-prompt','none');viewer.setAttribute('alt',tr('3D 회전 미리보기'));viewer.addEventListener('error',()=>{status.textContent=tr('미리보기를 불러오지 못했습니다.');});wrap.prepend(viewer);button.remove();}catch{status.textContent=tr('미리보기를 불러오지 못했습니다.');button.disabled=false;}}
 document.addEventListener('click',e=>{const b=e.target.closest('[data-model-preview]');if(b){e.stopPropagation();model(b);}},true);
 document.addEventListener('play',e=>{if(e.target.matches('.nnx-media audio,.nnx-media video'))document.querySelectorAll('.nnx-media audio,.nnx-media video').forEach(m=>{if(m!==e.target)m.pause();});},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)document.querySelectorAll('.nnx-media audio,.nnx-media video').forEach(m=>m.pause());});
 const pending=new WeakSet(),observer=new IntersectionObserver(entries=>entries.forEach(async entry=>{if(!entry.isIntersecting)return;const pre=entry.target;observer.unobserve(pre);try{const response=await fetch(pre.dataset.textPreview,{credentials:'same-origin'});if(!response.ok)throw Error();pre.textContent=(await response.text()).slice(0,4100);}catch{pre.textContent=tr('미리보기를 불러오지 못했습니다.');}}));
 function mount(){document.querySelectorAll('[data-text-preview]').forEach(pre=>{if(!pending.has(pre)){pending.add(pre);observer.observe(pre);}});document.querySelectorAll('.nnx-media').forEach(node=>{if(node.dataset.mediaBound)return;node.dataset.mediaBound='1';node.addEventListener('click',e=>e.stopPropagation());node.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;const note=document.createElement('span');note.textContent=tr('미리보기를 불러오지 못했습니다.');node.append(note);},{once:true}));});}
 let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;mount();});}).observe(document.body,{childList:true,subtree:true});
 window.NNXAssetMedia={html,interactive,mount};mount();
})();
