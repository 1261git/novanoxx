// Runs the actual UI module with a small DOM double; no browser or database is opened.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||require('node:path').join(__dirname,'../sandbox-ui/registered-work.js'),'utf8');
let poll,html='',active=null,status='REQUESTED';
const panel={contains:node=>!!node,get innerHTML(){return html;},set innerHTML(value){html=value;}};
const document={get activeElement(){return active;},getElementById:id=>id==='registered-work-tools'?panel:null,querySelectorAll:()=>[],querySelector:()=>null};
const state=()=>({csrf:'unit-only',userId:'admin',offers:[],orders:[],registeredAssets:[],refundAdmin:true,refundRequests:[{id:'new-refund',order_id:'new-order',reason:'synthetic focused-button regression',status}]});
vm.runInNewContext(source,{document,location:{hash:'#/orders'},route(){},window:{addEventListener(){}},setInterval(fn){poll=fn;},fetch:async()=>({ok:true,json:async()=>state()}),console});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 await flush();assert.match(html,/REQUESTED/);
 active={tagName:'BUTTON'};status='UNDER_REVIEW';poll();await flush();
 assert.match(html,/UNDER_REVIEW/,'A focused action button must not keep a completed refund action stale');
 active={tagName:'TEXTAREA'};status='REJECTED';poll();await flush();
 assert.match(html,/UNDER_REVIEW/,'Polling must preserve an unfinished text edit');
 active=null;poll();await flush();assert.match(html,/REJECTED/,'Latest status must appear after editing ends');
 console.log('PASS: focused action updates; unfinished input preserved; latest status restored after blur');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
