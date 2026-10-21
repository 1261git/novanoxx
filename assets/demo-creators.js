(function(root){
 'use strict';
 function create(source){
  const groups=new Map(),ids=new Map();
  for(const a of source){if(a.published||!Number.isSafeInteger(a.id)||a.id<1||a.id>1000||typeof a.creator!=='string')continue;if(!groups.has(a.creator))groups.set(a.creator,[]);groups.get(a.creator).push({...a});}
  for(const [name,list]of groups){const id='demo-'+Math.min(...list.map(a=>a.id));ids.set(name,id);groups.set(name,{id,list});}
  return {
   list:()=>[...groups.entries()].map(([displayName,{id,list}])=>({demoId:id,displayName,activeCount:list.filter(a=>!a.sold).length,soldCount:list.filter(a=>a.sold).length})),
   href:a=>a.creatorPublicId?'#/creator?id='+encodeURIComponent(a.creatorPublicId):!a.published&&ids.has(a.creator)?'#/creator?demo='+ids.get(a.creator):null,
   data:id=>{const group=[...groups.entries()].find(([,v])=>v.id===id);if(!group)return null;const [displayName,{list}]=group;return {profile:{publicId:null,isDemo:true,displayName,bio:'실제 회원 계정과 연결되지 않은 예시 작품 모음입니다.',avatarUrl:null},assets:list.map(a=>({...a,imgUrl:a.img?'assets/'+a.img+'.'+(a.ext||'jpg'):null,clipUrl:a.clip?'assets/'+a.clip:null,isDemo:true}))};}
  };
 }
 function rename(items,profile){if(!profile?.publicId||typeof profile.displayName!=='string')return;for(const a of items)if(a.creatorPublicId===profile.publicId)a.creator=profile.displayName;}
 const api={create,rename};if(typeof module!=='undefined')module.exports=api;else root.NNXDemoCreators=api;
})(typeof globalThis!=='undefined'?globalThis:this);
