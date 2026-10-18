'use strict';
const NNXSubscriptionRefundUI=(()=>{
 const text=k=>uiText(k),money=n=>Number(n).toLocaleString(uiLocale())+' KRW';
 const labels={REQUESTED:'접수됨',APPROVED:'승인됨',REJECTED:'반려됨',PROCESSING:'처리 중',RECONCILE_REQUIRED:'결과 확인 필요',SUCCEEDED:'환불 완료',FAILED:'처리 실패'};
 function el(tag,key){const n=document.createElement(tag);if(key)uiMessage(n,key);return n;}
 function line(h,key,value){const n=el('p',key);if(value!==undefined)n.append(document.createTextNode(' '+value));h.append(n);return n;}
 function field(h,key,type='text'){const l=el('label'),n=el(type==='textarea'?'textarea':'input');if(type!=='textarea')n.type=type;n.required=true;n.maxLength=500;if(type==='number'){n.min=1;n.step=1;}l.append(el('span',key),n);h.append(l);return n;}
 function choice(h){const l=el('label','구독 이용 처리'),n=el('select');for(const [value,key]of [['END_NOW','환불 완료 후 해당 이용 기간 종료'],['KEEP_PERIOD','부분 환불 후 해당 이용 기간 유지']]){const o=el('option',key);o.value=value;n.append(o);}l.append(n);h.append(l);return n;}
 async function render(host,admin=false){
  const owner=authUser?.id,root=el('section');root.className='page-panel operating-finance';root.append(el('h2','구독 결제 환불'));line(root,'구독 환불은 관리자 검토 후 승인한 금액만 처리합니다. 자동 일할 계산은 하지 않습니다.');line(root,'환불 신청 시 다음 자동결제가 중지됩니다. 이용 종료 여부는 관리자 검토와 환불 결과에 따라 반영됩니다.');const status=el('p');status.setAttribute('role','status');const list=el('div');root.append(status,list);host.append(root);let offset=0,loading=false;const current=()=>root.isConnected&&authUser?.id===owner;
  const button=(h,key,fn,disabled=false)=>{const b=el('button',key);b.type='button';b.disabled=disabled;b.onclick=async()=>{if(loading||!current())return;b.disabled=true;loading=true;try{await fn();}catch{if(current())uiMessage(status,'처리 결과를 확인할 수 없습니다. 목록을 다시 확인해주세요.');}finally{loading=false;if(current())await load();}};h.append(b);return b;};
  const post=(route,i)=>authRequest('subscription-refunds/'+route,i);
  function request(c,box){const form=el('form'),amount=field(form,'환불 금액 (원)','number'),reason=field(form,'환불 사유','textarea'),agree=field(form,'환불 신청 시 다음 자동결제 중지에 동의합니다.','checkbox');amount.max=c.remainingKrw;const submit=el('button','환불 신청');submit.type='submit';form.append(submit);form.onsubmit=async e=>{e.preventDefault();if(loading||!current()||!agree.checked)return;loading=true;submit.disabled=true;try{await post('request',{requestId:crypto.randomUUID(),subscriptionId:c.subscriptionId,periodStart:c.periodStart,amountKrw:Number(amount.value),reason:reason.value.trim(),confirmed:agree.checked});}catch{if(current())uiMessage(status,'처리 결과를 확인할 수 없습니다. 목록을 다시 확인해주세요.');}finally{loading=false;if(current())await load();}};box.append(form);}
  async function load(){if(loading||!current())return;loading=true;try{const d=await authRequest('subscription-refunds/'+(admin?'admin':'own')+'?offset='+offset);if(!current())return;list.replaceChildren();if(!d.liveRefunds)line(list,'실제 환불은 운영 결제와 환불 설정 활성화 후 이용할 수 있습니다.');if(!d.cycles.length)line(list,'환불 가능한 실제 구독 결제가 없습니다.');
   for(const c of d.cycles){const box=el('div');line(box,'결제 내역',c.plan+' · '+new Date(c.periodStart).toLocaleString(uiLocale())+(c.name?' · '+c.name:''));line(box,'환불 금액 (원)',money(c.refundedKrw)+' / '+money(c.amountKrw));if(c.syncIssue)line(box,'결과 확인 필요');if(!admin&&c.canRequest)request(c,box);button(box,'결제 결과 다시 확인',()=>post(admin?'admin-recheck':'recheck',{subscriptionId:c.subscriptionId,periodStart:c.periodStart}),!d.liveRefunds);
    if(admin&&c.needsReview){line(box,'외부에서 처리된 부분 환불의 이용 권한 검토가 필요합니다.');const rights=choice(box),reason=field(box,'검토 답변','textarea');button(box,'검토 저장',()=>{if(!reason.reportValidity())return;return post('resolve',{subscriptionId:c.subscriptionId,periodStart:c.periodStart,version:c.version,expectedRemainingKrw:c.remainingKrw,rightsAction:rights.value,reason:reason.value.trim()});},!d.liveRefunds);}list.append(box);
   }
   if(!d.rows.length)line(list,'접수된 환불 요청이 없습니다.');
   for(const r of d.rows){const box=el('div');line(box,'환불 상태',text(labels[r.state]||r.state)+' · '+r.id);line(box,'신청 금액 (원)',money(r.requestedAmountKrw));line(box,'환불 금액 (원)',money(r.amountKrw));line(box,'환불 사유',r.reason);line(box,'검토 답변',r.reviewReason);line(box,'구독 이용 처리',text(r.rightsAction==='KEEP_PERIOD'?'부분 환불 후 해당 이용 기간 유지':'환불 완료 후 해당 이용 기간 종료'));
    if(admin&&['REQUESTED','APPROVED'].includes(r.state)){const amount=field(box,'환불 금액 (원)','number');amount.value=r.amountKrw;const rights=choice(box);rights.value=r.rightsAction;const reason=field(box,'검토 답변','textarea');reason.value=r.reviewReason;for(const [action,key]of [['APPROVE','환불 승인'],['REJECT','환불 반려']])button(box,key,()=>{if(!reason.reportValidity()||action==='APPROVE'&&!amount.reportValidity())return;return post('review',{id:r.id,version:r.version,action,amountKrw:Number(amount.value),rightsAction:rights.value,reason:reason.value.trim()});});}
    if(admin&&r.state==='APPROVED'){const agree=field(box,'승인 금액과 이용 처리 방식을 확인했습니다.','checkbox');button(box,'실제 환불 실행',()=>{if(!agree.reportValidity())return;return post('execute',{id:r.id,version:r.version,confirmed:agree.checked});},!r.executable);}
    if(admin&&['PROCESSING','RECONCILE_REQUIRED','FAILED'].includes(r.state))button(box,'결제 결과 다시 확인',()=>post('reconcile',{id:r.id}),!d.liveRefunds);
    if(admin&&r.state==='FAILED'){const reason=field(box,'검토 답변','textarea');button(box,'실패 확인 후 종료',()=>{if(!reason.reportValidity())return;return post('close',{id:r.id,version:r.version,reason:reason.value.trim()});},!d.liveRefunds);}list.append(box);
   }
   const nav=el('div');button(nav,'이전',()=>{offset=Math.max(0,offset-25);},offset===0);button(nav,'다음',()=>{offset=d.nextOffset;},d.nextOffset===null);button(nav,'새로고침',async()=>{});list.append(nav);
  }catch{if(current())uiMessage(status,'처리 결과를 확인할 수 없습니다. 목록을 다시 확인해주세요.');}finally{loading=false;}}
  await load();return root;
 }
 return {own:h=>render(h),admin:h=>render(h,true)};
})();
