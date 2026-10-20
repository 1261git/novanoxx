'use strict';
const NNXAdminCharts=(()=>{
 const ns='http://www.w3.org/2000/svg',num=v=>v==null?'—':Number(v).toLocaleString(uiLocale(),{maximumFractionDigits:2});
 const node=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 function surface(host,label,mini=false){
  const wrap=document.createElement('div');wrap.className='admin-interactive-chart'+(mini?' admin-sparkline':'');
  const svg=node('svg',{viewBox:mini?'0 0 240 70':'0 0 720 240',role:'group','aria-label':uiText(label)}),tip=document.createElement('div');tip.className='admin-chart-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;if(mini){svg.setAttribute('aria-hidden','true');tip.setAttribute('aria-hidden','true');}wrap.append(svg,tip);host.append(wrap);
  function bind(target,text,position=50){if(target.namespaceURI===ns){const title=node('title');title.textContent=text;target.append(title);}else target.title=text;target.setAttribute('aria-label',text);if(!mini)target.setAttribute('tabindex','0');const show=()=>{tip.textContent=text;tip.hidden=false;tip.style.left=Math.max(20,Math.min(80,position))+'%';};target.addEventListener('pointerenter',show);target.addEventListener('pointermove',show);target.addEventListener('focus',show);target.addEventListener('click',show);target.addEventListener('blur',()=>tip.hidden=true);target.addEventListener('pointerleave',()=>{if(document.activeElement!==target)tip.hidden=true;});target.addEventListener('keydown',e=>{if(e.key==='Escape')tip.hidden=true;});}
  wrap.addEventListener('pointerleave',()=>tip.hidden=true);return {svg,bind};
 }
 function plot(host,rows,key,title,{line=false,mini=false}={}){
  const {svg,bind}=surface(host,title,mini),width=mini?240:720,left=mini?6:65,right=mini?234:695,top=mini?8:25,bottom=mini?57:185,step=(right-left)/Math.max(1,rows.length),values=rows.map(r=>r[key]).filter(Number.isFinite),max=Math.max(2,...values),x=i=>left+step*(i+.5),y=v=>bottom-v/max*(bottom-top);
  const text=(xx,yy,value,anchor='start')=>{const n=node('text',{x:xx,y:yy,'text-anchor':anchor});n.textContent=value;svg.append(n);};
  for(let i=0;i<(mini?1:3);i++){const yy=mini?bottom:top+i*(bottom-top)/2;svg.append(node('line',{x1:left,x2:right,y1:yy,y2:yy,class:'admin-chart-gridline'}));if(!mini)text(left-7,yy+4,num(max*(2-i)/2),'end');}
  if(line){let path='';rows.forEach((r,i)=>{if(!Number.isFinite(r[key])||r.future){path+=' ';return;}path+=(i&&Number.isFinite(rows[i-1][key])&&!rows[i-1].future?'L':'M')+x(i)+','+y(r[key])+' ';});svg.append(node('path',{d:path,fill:'none',class:'admin-trend-line'}));}
  rows.forEach((r,i)=>{
   const value=r.future?null:r[key],valid=Number.isFinite(value),label=r.date+' · '+uiText(title)+' · '+num(valid?value:null)+(key.endsWith('Krw')?' KRW':'');
   if(valid){if(line)svg.append(node('circle',{cx:x(i),cy:y(value),r:mini?1.8:3,class:'admin-chart-dot'}));else svg.append(node('rect',{x:left+i*step+1,y:y(value),width:Math.max(1,step-3),height:bottom-y(value),rx:2,class:'admin-chart-bar'}));}
   const hit=node('rect',{x:left+i*step,y:top,width:Math.max(1,step),height:bottom-top,class:'admin-chart-hit'});bind(hit,label,x(i)/width*100);svg.append(hit);
   if(!mini&&(i%Math.ceil(rows.length/6)===0||i===rows.length-1))text(x(i),211,r.date.length>6?r.date.slice(5):r.date,i===rows.length-1?'end':'middle');
  });
  if(!mini&&!values.length){const p=document.createElement('p');uiMessage(p,'기록 없음');host.append(p);}
 }
 function pie(host,rows,title){
  const {svg,bind}=surface(host,title);svg.setAttribute('viewBox','0 0 320 260');const total=rows.reduce((n,r)=>n+r.views,0),colors=['#ff895a','#a68bfa','#51c6be','#edb956','#e277b7','#77a5ef','#aaa4b9'];let start=-Math.PI/2;
  svg.append(node('circle',{cx:160,cy:126,r:94,fill:'none',stroke:'#ffffff22','stroke-width':1}));const legend=document.createElement('div');legend.className='admin-pie-legend';
  rows.forEach((r,i)=>{const fraction=total?r.views/total:0,end=start+fraction*Math.PI*2,color=colors[i%colors.length],label=uiText(typeof categoryLabels==='undefined'?r.category:categoryLabels[r.category]||r.category)+' · '+num(r.views)+' · '+num(fraction*100)+'%';
   if(r.views>0){let shape;if(fraction===1)shape=node('circle',{cx:160,cy:126,r:94,fill:color});else shape=node('path',{d:`M160,126 L${160+94*Math.cos(start)},${126+94*Math.sin(start)} A94,94 0 ${fraction>.5?1:0},1 ${160+94*Math.cos(end)},${126+94*Math.sin(end)} Z`,fill:color});shape.classList.add('admin-pie-slice');bind(shape,label);svg.append(shape);}start=end;
   const b=document.createElement('button');b.type='button';b.className='admin-pie-key';const dot=document.createElement('span');dot.style.background=color;dot.setAttribute('aria-hidden','true');b.append(dot,document.createTextNode(label));bind(b,label);legend.append(b);
  });host.append(legend);if(!total){const p=document.createElement('p');uiMessage(p,'기간 내 기록이 없습니다.');host.append(p);}
 }
 return {plot,pie};
})();
