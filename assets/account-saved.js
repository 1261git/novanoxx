// Account-owned server state. Legacy anonymous localStorage is never imported.
let savedAccountOwner=null,savedAccountReady=false,savedReadVersion=0,savedWriteQueue=Promise.resolve();
const savedPending=new Set();
function paintAccountSaved(){
 if(savedOnly)render();
 updateSaved();
 document.querySelectorAll('[data-save]').forEach(button=>{const id=Number(button.dataset.save);button.classList.toggle('saved',saved.has(id));button.textContent=saved.has(id)?'♥':'♡';button.setAttribute('aria-pressed',String(saved.has(id)));button.disabled=savedPending.has(id);});
 const detail=document.getElementById('page-save');if(detail){const id=Number(page.dataset.route?.split('/')[1]);const label=saved.has(id)?'♥ 찜한 에셋':'♡ 찜하기';detail.setAttribute('data-i18n',label);detail.textContent=typeof uiText==='function'?uiText(label):label;detail.setAttribute('aria-pressed',String(saved.has(id)));detail.disabled=savedPending.has(id);}
}
async function refreshAccountSaved(){
 const owner=authUser?.id||null;
 if(owner!==savedAccountOwner){savedAccountOwner=owner;savedAccountReady=false;savedReadVersion++;saved.clear();savedPending.clear();paintAccountSaved();}
 if(!owner||savedPending.size)return;
 const version=++savedReadVersion;
 try{const result=await authRequest('saved');if(owner!==authUser?.id||owner!==savedAccountOwner||version!==savedReadVersion)return;
  if(!Array.isArray(result.ids)||result.ids.some(id=>!Number.isSafeInteger(id)||id<1))throw Error('찜 목록을 확인하지 못했습니다.');
  saved.clear();result.ids.forEach(id=>saved.add(id));savedAccountReady=true;paintAccountSaved();
 }catch{if(owner===savedAccountOwner&&version===savedReadVersion){savedAccountReady=false;toast('찜 목록을 불러오지 못했습니다. 다시 시도해주세요.');}}
}
async function saveAccountAsset(id){
 if(!Number.isSafeInteger(id)||id<1)return;
 if(!authUser){toast('찜은 로그인 후 이용할 수 있습니다.');rememberAsset('assets/'+id);go('login?next='+encodeURIComponent('assets/'+id));return;}
 const owner=authUser.id;if(owner!==savedAccountOwner||!savedAccountReady)await refreshAccountSaved();
 if(authUser?.id!==owner||savedAccountOwner!==owner||!savedAccountReady||savedPending.has(id))return;
 savedPending.add(id);savedReadVersion++;paintAccountSaved();
 const task=savedWriteQueue.then(async()=>{
  if(authUser?.id!==owner||savedAccountOwner!==owner)return;
  const desired=!saved.has(id);
  try{const result=await authRequest('saved',{assetId:id,saved:desired});if(authUser?.id!==owner||savedAccountOwner!==owner)return;
   if(result.assetId!==id||result.saved!==desired)throw Error('찜 저장 결과를 확인하지 못했습니다.');
   desired?saved.add(id):saved.delete(id);
  }catch(error){if(authUser?.id===owner&&savedAccountOwner===owner)toast(error.message||'찜을 저장하지 못했습니다.');}
  finally{if(authUser?.id===owner&&savedAccountOwner===owner){savedPending.delete(id);paintAccountSaved();}}
 });
 savedWriteQueue=task.catch(()=>{});await task;
 if(authUser?.id===owner&&savedAccountOwner===owner&&!savedPending.size)await refreshAccountSaved();
}
window.addEventListener('focus',()=>{refreshAccountSaved();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAccountSaved();});
