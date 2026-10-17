'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const operator=require('./assets/privacy-operator.js'),plan=require('./docs/privacy-release-plan.json'),{translate}=require('./assets/ui-language.js');
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.textContent='';this.dataset={};}
 append(...items){this.children.push(...items);}
 setAttribute(k,v){this.attributes[k]=v;}
 querySelectorAll(){return flatten(this).filter(e=>['INPUT','BUTTON'].includes(e.tagName));}
 set innerHTML(value){this.children=[];this.html=value;}
}
function flatten(e){return [e,...e.children.flatMap(c=>typeof c==='object'&&c.children?flatten(c):[])];}
function texts(e){return flatten(e).map(n=>n.textContent||'').join(' ');}
(async()=>{
 let passed=0;assert.deepEqual(operator,plan.operator);passed++;
 for(const lang of ['ko','en','es','zh-Hans','vi','de']){
  const page=new Element('main');page.dataset.route='data-settings';let calls=0;
  const context={authUser:null,page,document:{createElement:tag=>new Element(tag),createTextNode:value=>({textContent:value,children:[]})},pageHeading:()=>'',uiText:key=>translate(key,lang),NNX_PRIVACY_OPERATOR:operator,authRequest:async()=>{calls++;throw Error('NO_GUEST_REQUEST');}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('assets/discovery-privacy.js','utf8'),context);await context.renderDiscoveryPrivacy();
  assert.ok(texts(page).includes(operator.legalName));passed++;assert.ok(texts(page).includes(operator.privacyOfficer));passed++;assert.ok(flatten(page).some(e=>e.href==='mailto:'+operator.publicContact));passed++;assert.equal(calls,0);passed++;
 }
 const page=new Element('main');page.dataset.route='data-settings';let allowed=false,events=0;const actions=[];
 const context={authUser:{id:'synthetic'},page,document:{createElement:tag=>new Element(tag),createTextNode:value=>({textContent:value,children:[]})},pageHeading:()=>'',uiText:key=>key,NNX_PRIVACY_OPERATOR:operator,crypto:{randomUUID:()=>require('node:crypto').randomUUID()},Event:class{},window:{dispatchEvent:()=>events++},authRequest:async(endpoint,payload)=>{if(endpoint==='engine/status')return {connected:true};if(endpoint==='engine/discovery-preference')return {allowed,version:'DISCOVERY_ACCOUNT_120_V1'};actions.push(payload);if(payload.action==='preference')allowed=payload.allowed;return {};}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('assets/discovery-privacy.js','utf8'),context);await context.renderDiscoveryPrivacy();const nodes=flatten(page),checkbox=nodes.find(n=>n.tagName==='INPUT'),save=nodes.find(n=>n.tagName==='BUTTON'&&n.textContent==='설정 저장'),erase=nodes.find(n=>n.tagName==='BUTTON'&&n.textContent==='기존 검색·유입 기록 삭제');assert.equal(checkbox.checked,false);passed++;checkbox.checked=true;await save.onclick();assert.equal(allowed,true);passed++;const before=events;await erase.onclick();assert.equal(events,before);passed++;assert.equal(actions.at(-1).action,'erase');passed++;checkbox.checked=false;await save.onclick();assert.equal(allowed,false);passed++;
 const report={passed,scope:'Minimal DOM controller/contact across six languages and preference/erase dispatch; not browser visual certification'};fs.writeFileSync('../novanoxx-stage10-evidence-20261017/ui171-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;});
