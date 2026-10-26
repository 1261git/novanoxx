const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(touch){
 const handlers=new Map(),timers=[];
 function el(name){return {name,hidden:true,style:{},attrs:{},addEventListener(type,fn){const key=name+':'+type;handlers.set(key,[...(handlers.get(key)||[]),fn])},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},before(){},append(){},contains(target){return !!target&&['trigger','parent','child','menu','wrap'].includes(target.name)},querySelectorAll(sel){return sel==='.market-submenu'?[sub]:sel==='.market-parent-link'?[parent]:[]},querySelector(){return child},focus(){doc.activeElement=this},blur(){doc.activeElement=null},classList:{contains(c){return name==='parent'&&c==='market-parent-link'}},closest(sel){return sel==='a'||sel==='.market-parent-link'&&name==='parent'?this:null}}}
 const trigger=el('trigger'),wrap=el('wrap'),menu=el('menu'),toggle=el('toggle'),parent=el('parent'),sub=el('sub'),child=el('child');parent.attrs['aria-controls']='sub';
 const doc={activeElement:null,getElementById:id=>id==='market-nav'?trigger:sub,createElement:()=>[wrap,toggle,menu][created++],querySelector:()=>({getBoundingClientRect:()=>({bottom:120})}),addEventListener:(t,f)=>handlers.set('document:'+t,[f])};let created=0;
 const win={innerWidth:390,addEventListener:(t,f)=>handlers.set('window:'+t,[f])};
 const context={document:doc,window:win,matchMedia:q=>({matches:q.includes('760')?true:touch}),setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},URLSearchParams,categoryLabels:{},subcategories:Object.fromEntries(['VIDEO','2D','3D','AUDIO','DOCUMENTS','AI_TOOLS'].map(c=>[c,[]])),esc:String,categoryLabel:String,location:{hash:'#/old'},route(){}};
 vm.runInNewContext(fs.readFileSync('assets/market-menu.js','utf8'),context);
 function fire(name,type,data={}){const e={target:trigger,preventDefault(){this.prevented=true},stopImmediatePropagation(){},stopPropagation(){},...data};for(const f of handlers.get(name+':'+type)||[])f(e);return e}
 return {fire,menu,trigger,toggle,parent,sub,child,win,doc,timers};
}
test('touch menu survives lift, focus clearing, scrolling height resize and expands without navigation',()=>{
 const s=setup(true);s.fire('trigger','focus');assert.equal(s.menu.hidden,true);const navigation=s.fire('trigger','click');assert.equal(navigation.prevented,undefined);assert.equal(s.menu.hidden,true);s.fire('toggle','click');assert.equal(s.menu.hidden,false);
 s.fire('wrap','pointerleave',{pointerType:'touch'});assert.equal(s.timers.length,0);
 s.fire('wrap','focusout',{relatedTarget:null});s.fire('window','resize');assert.equal(s.menu.hidden,false);
 const e=s.fire('menu','click',{target:s.parent});assert.equal(e.prevented,true);assert.equal(s.sub.hidden,false);
 s.fire('menu','click',{target:s.child});assert.equal(s.menu.hidden,true);
 s.fire('toggle','click');s.fire('document','pointerdown',{target:{name:'outside'}});assert.equal(s.menu.hidden,true);
 s.fire('toggle','click');s.win.innerWidth=844;s.fire('window','resize');assert.equal(s.menu.hidden,true);
});
test('desktop mouse hover dismissal and keyboard Escape still work',()=>{
 const s=setup(false);s.fire('wrap','pointerenter',{pointerType:'mouse'});assert.equal(s.menu.hidden,false);
 s.fire('wrap','pointerleave',{pointerType:'mouse'});s.timers[0]();assert.equal(s.menu.hidden,true);
 s.fire('trigger','keydown',{key:'ArrowDown'});assert.equal(s.menu.hidden,false);assert.equal(s.doc.activeElement,s.child);
 s.fire('wrap','keydown',{key:'Escape'});assert.equal(s.menu.hidden,true);
});
