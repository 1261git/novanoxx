'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{translate}=require('./assets/ui-language.js');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.isConnected=true;this.events={};}
 append(...items){this.children.push(...items);}prepend(...items){this.children.unshift(...items);}setAttribute(k,v){this.attributes[k]=v;}
 addEventListener(k,fn){this.events[k]=fn;}showModal(){this.open=true;}focus(){this.focused=true;}remove(){this.isConnected=false;}close(){this.open=false;this.events.close?.();}
}
const flatten=e=>[e,...e.children.flatMap(flatten)];
for(const lang of ['ko','en','es','zh-Hans','vi','de'])test('Review dialog conditions, SDK arguments and route cleanup: '+lang,async()=>{
 const body=new Element('body'),events={},sdkCalls=[];let kind='ASSET',loads=0;
 const row=()=>({id:'review_owned',kind,amount:kind==='ASSET'?1000:3000,policyVersion:'REVIEW_CHECKOUT_NO_APPROVAL_V1',snapshot:{title:'Creator original title',sellerName:'Creator name',days:2,saleMode:'MULTI',deliverables:'Final only',optionKeys:kind==='ASSET'?['logo','color']:[],customizationDetails:{logo:'Replace logo',color:'Change color <b>literal</b>'}}});
 const context={authUser:{id:'owned'},location:{hash:'#/assets/1001'},crypto:require('node:crypto'),uiText:k=>translate(k,lang),uiMessage:(e,k)=>{e.textContent=translate(k,lang);},uiLocale:()=>({ko:'ko-KR',en:'en-US',es:'es-ES','zh-Hans':'zh-CN',vi:'vi-VN',de:'de-DE'})[lang],go:()=>{},document:{body,createElement:tag=>new Element(tag),createTextNode:textContent=>({textContent,children:[]})},fetch:async()=>({json:async()=>({reviewOnly:false})}),authRequest:async(endpoint,input)=>{if(endpoint==='review/checkout')return row();assert.equal(endpoint,'review/start');assert.equal(input.agreed,true);return {...row(),clientKey:'test_ck_owned',customerKey:'review_customer',successUrl:'https://review.invalid/success',failUrl:'https://review.invalid/fail'};},loadNeonSdk:async()=>{loads++;},window:{addEventListener:(k,fn)=>events[k]=fn,removeEventListener:k=>delete events[k],TossPayments:key=>{assert.equal(key,'test_ck_owned');return {payment:({customerKey})=>{assert.equal(customerKey,'review_customer');return {requestPayment:async input=>sdkCalls.push({kind:'ASSET',...input}),requestBillingAuth:async input=>sdkCalls.push({kind:'SUBSCRIPTION',...input})};}};}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('assets/review-checkout.js','utf8'),context);
 for(const current of ['ASSET','SUBSCRIPTION']){
  kind=current;await context.openReviewCheckout({kind});const dialog=body.children.at(-1),nodes=flatten(dialog),agree=nodes.find(e=>e.tag==='input'),start=nodes.find(e=>e.tag==='button'&&e.className==='primary'),title=nodes.find(e=>e.tag==='h2');
  assert.equal(start.disabled,true);assert.equal(title.textContent,'Creator original title');assert.equal(title.focused,true);assert.equal(dialog.attributes['aria-labelledby'],title.id);assert.ok(nodes.some(e=>e.textContent===translate('심사용 화면입니다. 결제 승인·자동청구·유료 권한 부여는 실행하지 않습니다.',lang)));
  if(kind==='ASSET'){assert.ok(nodes.some(e=>e.textContent==='Replace logo'));assert.ok(nodes.some(e=>e.textContent==='Change color <b>literal</b>'));assert.ok(!nodes.some(e=>e.tag==='b'));}const before=loads;await start.onclick();assert.equal(loads,before);agree.checked=true;agree.onchange();assert.equal(start.disabled,false);await start.onclick();assert.equal(loads,before+1);const call=sdkCalls.at(-1);assert.equal(call.kind,kind);assert.equal(call.method,'CARD');assert.equal(call.windowTarget,'self');if(kind==='ASSET'){assert.equal(call.amount.value,1000);assert.equal(call.orderId,'review_owned');}else assert.equal(call.amount,undefined);
  events.hashchange();assert.equal(dialog.isConnected,false);assert.equal(events.hashchange,undefined);
 }
 assert.equal(sdkCalls.length,2);if(lang!=='ko')assert.notEqual(translate('환불 정책',lang),'환불 정책');
});
