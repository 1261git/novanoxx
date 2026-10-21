'use strict';
const NNXAssetTraffic=(()=>{
 let lastId=null,lastAt=0;
 function click(assetId){
  if(!Number.isSafeInteger(assetId)||assetId<=1000||authUser?.isAdmin)return;
  const now=Date.now();if(lastId===assetId&&now-lastAt<100)return;lastId=assetId;lastAt=now;
  // Per-event nonce only: no analytics cookie, localStorage or persistent browser ID.
  fetch('/api/auth/asset-card-click',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({assetId,requestId:crypto.randomUUID()})}).catch(()=>{});
 }
 document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(!a)return;const match=/^#\/assets\/(\d+)$/.exec(a.getAttribute('href'));if(match)click(Number(match[1]));},true);
 return {click};
})();
