function filterMarketAssets(items,filters={}){
 const text=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ko-KR');
 const words=text(filters.query).trim().split(/\s+/).filter(Boolean);
 const lower=filters.minimum===''||filters.minimum==null?null:Number(filters.minimum),upper=filters.maximum===''||filters.maximum==null?null:Number(filters.maximum);
 if(lower!==null&&(!Number.isFinite(lower)||lower<0)||upper!==null&&(!Number.isFinite(upper)||upper<0)||lower!==null&&upper!==null&&lower>upper)return [];
 let result=items.filter(a=>{
  if(filters.category&&filters.category!=='ALL'&&a.cat!==filters.category||filters.subcategory&&filters.subcategory!=='ALL'&&a.subcategory!==filters.subcategory||filters.purpose&&filters.purpose!=='ALL'&&a.purpose!==filters.purpose)return false;
  if(filters.fit&&!a.fit||filters.savedOnly&&!filters.saved?.has(a.id))return false;
  if(filters.availability==='available'&&a.sold||filters.availability==='sold'&&!a.sold)return false;
  if(lower!==null&&a.price<lower||upper!==null&&a.price>upper)return false;
  const searchable=text([a.title,a.titleKo,a.descriptionKo,a.creator,a.cat,a.subcategory,a.desc,a.tags,a.style,a.industry,a.spec,a.tools].join(' '));
  if(!words.every(word=>searchable.includes(word)))return false;
  return ['industry','style','spec'].every(key=>!filters[key]||text(a[key]).includes(text(filters[key]).trim()));
 });
 const order=filters.sort;if(order==='low')result.sort((a,b)=>a.price-b.price||a.id-b.id);else if(order==='high')result.sort((a,b)=>b.price-a.price||a.id-b.id);else if(order==='newest')result.sort((a,b)=>(b.created||0)-(a.created||0)||b.id-a.id);
 return result;
}
if(typeof module!=='undefined')module.exports={filterMarketAssets};
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 const host=document.querySelector('#market .filters');if(!host)return;
 const panel=document.createElement('details');panel.className='market-advanced';panel.innerHTML='<summary>상세 검색 · 가격·목적·스타일</summary><div class="market-advanced-grid"><label>최소 가격 (NEON)<input data-market-filter="minimum" type="number" min="0" step="1"></label><label>최대 가격 (NEON)<input data-market-filter="maximum" type="number" min="0" step="1"></label><label>활용 목적<select data-market-filter="purpose"><option value="ALL">전체 목적</option></select></label><label>판매 상태<select data-market-filter="availability"><option value="all">전체</option><option value="available">판매 중</option><option value="sold">SOLD</option></select></label><label>업종<input data-market-filter="industry" maxlength="60" placeholder="예: beauty"></label><label>스타일<input data-market-filter="style" maxlength="100" placeholder="예: cinematic"></label><label>사양<input data-market-filter="spec" maxlength="100" placeholder="예: 4K, WAV"></label></div><p data-market-range-error role="status"></p><button type="button" data-market-clear>상세 조건 초기화</button>';
 host.after(panel);const controls=[...panel.querySelectorAll('[data-market-filter]')];const purposeSelect=panel.querySelector('[data-market-filter="purpose"]');for(const [value,label]of Object.entries(purposes))if(value!=='ALL'){const option=document.createElement('option');option.value=value;option.textContent=label;purposeSelect.append(option);}
 function restore(){const current=location.hash.replace(/^#\/?/,'').split('?')[0];if(current!=='marketplace')return;const query=new URLSearchParams(location.hash.split('?')[1]||'');controls.forEach(input=>{input.value=query.get(input.dataset.marketFilter)||({purpose:'ALL',availability:'all'}[input.dataset.marketFilter]||'');});const search=document.getElementById('search');search.value=query.get('q')||'';document.getElementById('sort').value=query.get('sort')||'curated';if(controls.some(x=>x.value&&!['ALL','all'].includes(x.value)))panel.open=true;}
 window.restoreMarketFilters=restore;
 window.readMarketFilters=()=>Object.fromEntries(controls.map(input=>[input.dataset.marketFilter,input.value]));
 function change(){const values=readMarketFilters(),invalid=values.minimum!==''&&values.maximum!==''&&Number(values.minimum)>Number(values.maximum);panel.querySelector('[data-market-range-error]').textContent=invalid?'최소 가격이 최대 가격보다 큽니다.':'';render();if(page.dataset.route!=='marketplace')return;const query=new URLSearchParams(location.hash.split('?')[1]||'');for(const [key,value]of Object.entries({...values,q:document.getElementById('search').value,sort:document.getElementById('sort').value})){if(!value||['ALL','all','curated'].includes(value))query.delete(key);else query.set(key,value);}history.replaceState(null,'','#/marketplace'+(query.size?'?'+query:''));}
 controls.forEach(input=>input.addEventListener('input',change));document.getElementById('search').addEventListener('input',change);document.getElementById('sort').addEventListener('change',change);panel.querySelector('[data-market-clear]').onclick=()=>{controls.forEach(input=>{input.value=({purpose:'ALL',availability:'all'}[input.dataset.marketFilter]||'');});change();};window.addEventListener('hashchange',()=>{restore();if(page.dataset.route==='marketplace')render();});restore();render();
});
