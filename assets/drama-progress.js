(function(root){
 function create(storage,scope,clock=Date.now){
  const key='nnx-drama-progress-v1:'+encodeURIComponent(scope||'guest'),ttl=30*86400000;
  function read(){try{const rows=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(rows)?rows.filter(r=>r&&typeof r.series==='string'&&typeof r.episode==='string'&&Number.isFinite(r.position)&&r.position>=0&&Number.isFinite(r.duration)&&r.duration>0&&Number.isSafeInteger(r.at)&&r.at<=clock()&&clock()-r.at<ttl).slice(0,100):[];}catch{return [];}}
  function write(rows){try{storage.setItem(key,JSON.stringify(rows));}catch{}}
  return {get:episode=>read().find(r=>r.episode===episode),latest:series=>read().find(r=>r.series===series),put(series,episode,position,duration){if(!Number.isFinite(position)||!Number.isFinite(duration)||duration<=0||position<0)return;const rows=read().filter(r=>r.episode!==episode);if(position<duration-2)rows.unshift({series,episode,position:Math.min(position,duration),duration,at:clock()});write(rows.slice(0,100));},clear(){try{storage.removeItem(key);}catch{}}};
 }
 if(typeof module!=='undefined')module.exports={create};else root.NNXDramaProgress={create};
})(typeof globalThis==='undefined'?this:globalThis);
