(function(root){
 'use strict';
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function links(text){
  const pattern=/https?:\/\/[^\s<>"\x00-\x20]+/gi;let html='',position=0,match;
  while((match=pattern.exec(text))){let url=match[0],suffix='';
   while(/[.,!?:;。，！；]$/.test(url)){suffix=url.slice(-1)+suffix;url=url.slice(0,-1);}
   for(const [open,close]of [['(',')'],['[',']'],['{','}']])while(url.endsWith(close)&&url.split(close).length>url.split(open).length){suffix=close+suffix;url=url.slice(0,-1);}
   html+=escape(text.slice(position,match.index));
   try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw Error();html+='<a href="'+escape(parsed.href)+'" target="_blank" rel="noopener noreferrer ugc">'+escape(url)+'</a>'+escape(suffix);}
   catch{html+=escape(match[0]);}
   position=match.index+match[0].length;
  }
  return html+escape(text.slice(position));
 }
 function render(value){return String(value??'').replace(/\r\n?/g,'\n').split(/\n[\t ]*\n+/).filter(p=>p.trim()).map(p=>'<p class="asset-description-paragraph">'+links(p)+'</p>').join('');}
 if(typeof module!=='undefined')module.exports={render};else root.NNXAssetDescription={render};
})(typeof window==='undefined'?null:window);
