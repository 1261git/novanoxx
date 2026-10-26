'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(status){
 const calls=[],nodes={};function el(tag){return {tag,children:[],dataset:{},hidden:false,disabled:false,isConnected:true,attrs:{},setAttribute(k,v){this.attrs[k]=v},append(...n){this.children.push(...n)},before(n){this.beforeNode=n},after(n){this.afterNode=n},addEventListener(){},querySelectorAll(){return []}};}
 const button=nodes['test-neon-buy']=el('button');button.disabled=true;nodes['test-buy-status']=el('p');nodes['neon-purchase-notice']=el('p');
 const context={document:{getElementById:id=>nodes[id],createElement:el,querySelectorAll:()=>[]},authUser:{id:'synthetic'},page:{dataset:{route:'assets/1004'}},uiMessage:(node,text)=>node.textContent=text,uiText:s=>s,uiLocale:()=> 'en',NNXOptionQuote:{quote:a=>({extra:0,total:a.price,days:0})},authRequest:async(name,data)=>{calls.push({name,data});return status;}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('assets/neon-wallet.js','utf8'),context);return {context,nodes,button,calls};
}
test('production shows a disabled NEON entry and wallet link without spending or opening direct card checkout',async()=>{
 const s=setup({connected:true,productionSite:true,paymentPreview:true});s.context.asset={id:1004,price:199,customization:{}};
 await vm.runInContext('renderEnginePurchaseOptions(asset)',s.context);
 assert.equal(s.button.hidden,false);assert.equal(s.button.disabled,true);assert.equal(s.button.dataset.purchaseMode,'NEON_PENDING');assert.match(s.button.textContent,/NEON/);assert.match(s.nodes['test-buy-status'].textContent,/차감하지/);assert.equal(s.button.afterNode.href,'#/wallet');assert.equal(s.nodes['neon-purchase-notice'].hidden,true);
 await vm.runInContext('buyWithTestNeon(asset)',s.context);assert.deepEqual(s.calls.map(c=>c.name),['engine/status']);
});
test('sandbox keeps its explicit TEST purchase label; disconnected services do not enable a purchase',async()=>{
 const s=setup({connected:true,productionSite:false});s.context.asset={id:1004,price:199,customization:{}};await vm.runInContext('renderEnginePurchaseOptions(asset)',s.context);assert.equal(s.button.disabled,false);assert.match(s.button.textContent,/테스트/);assert.equal(s.nodes['neon-purchase-notice'].hidden,false);
 const off=setup({connected:false});off.context.asset=s.context.asset;await vm.runInContext('renderEnginePurchaseOptions(asset)',off.context);assert.equal(off.button.disabled,true);assert.match(off.nodes['test-buy-status'].textContent,/준비/);
});
