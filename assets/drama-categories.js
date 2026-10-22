(function(root,factory){const value=factory();if(typeof module!=='undefined'&&module.exports)module.exports=value;else root.NNXDramaCategories=value;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const groups=[
  {id:'drama',label:'드라마',children:[['romance-fantasy','로맨스 판타지'],['modern','현대물'],['romance','로맨스'],['fantasy','판타지'],['thriller-mystery','스릴러·미스터리'],['sf','SF'],['historical','사극'],['action','액션'],['comedy','코미디'],['other','기타']]},
  {id:'film',label:'영화·단편',children:[['drama','드라마'],['romance','로맨스'],['fantasy-sf','판타지·SF'],['thriller-mystery','스릴러·미스터리'],['action','액션'],['comedy','코미디'],['other','기타']]},
  {id:'animation',label:'애니메이션',children:[['romance-fantasy','로맨스 판타지'],['fantasy','판타지'],['sf','SF'],['action','액션'],['slice-of-life','일상·코미디'],['other','기타']]}
 ].map(group=>Object.freeze({...group,children:Object.freeze(group.children.map(([id,label])=>Object.freeze({id,label})))}));
 const find=id=>groups.find(group=>group.id===id);
 function valid(category,subcategory){return typeof category==='string'&&typeof subcategory==='string'&&!!find(category)?.children.some(child=>child.id===subcategory);}
 function selection(series){return valid(series?.category,series?.subcategory)?{category:series.category,subcategory:series.subcategory}:{category:'',subcategory:''};}
 function matches(series,category='',subcategory=''){const saved=selection(series);return category==='unclassified'?!saved.category:(!category||saved.category===category)&&(!subcategory||saved.subcategory===subcategory);}
 const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
 function searchMatches(series,query,translatedLabels=[]){
  const terms=normalize(query).slice(0,120).split(' ').filter(Boolean);if(!terms.length)return true;
  const saved=selection(series),group=find(saved.category),child=group?.children.find(child=>child.id===saved.subcategory);
  const content=normalize([series.title,series.description,series.creator,series.genre,group?.label,child?.label,group?.id,child?.id?.replace(/-/g,' '),...translatedLabels].filter(Boolean).join(' '));
  return terms.every(term=>content.includes(term));
 }
 return Object.freeze({groups:Object.freeze(groups),find,valid,selection,matches,searchMatches});
});
