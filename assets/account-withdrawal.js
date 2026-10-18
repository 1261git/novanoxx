'use strict';
async function renderAccountWithdrawal(){
 const owner=authUser?.id,current=()=>page.dataset.route==='account-withdrawal'&&authUser?.id===owner;
 page.innerHTML=pageHeading('ACCOUNT','회원 탈퇴','탈퇴 전 진행 중인 거래와 보관되는 기록을 확인해주세요.');
 const root=document.createElement('section');root.className='page-panel narrow';page.append(root);
 const el=(tag,key)=>{const n=document.createElement(tag);if(key)uiMessage(n,key);return n;};
 const link=(key,href)=>{const a=el('a',key);a.href=href;a.className='outline-link';root.append(a);};
 for(const key of ['탈퇴하면 모든 기기에서 로그아웃되며, 기존 계정과 구매 파일에 다시 접근할 수 없습니다. 필요한 파일을 먼저 내려받아 주세요.','프로필·로그인 연결·찜·검색·유입 기록은 정리됩니다. 거래·분쟁·저작물 및 기존 보존 백업은 별도 보존 기준을 적용하며, 복원 시 탈퇴 상태를 다시 적용합니다.','계약·결제·공급 기록은 5년, 소비자 불만·분쟁 기록은 3년 보존 대상입니다. 필요한 최소 정보는 일반 계정정보와 분리하여 관리합니다.'])root.append(el('p',key));
 link('구매 주문 내역 ↗','#/orders');link('내 요금제','#/creator-plan');link('문의하기','mailto:support@novanoxx.com');
 if(!owner){link('로그인하기 ↗','#/login');return;}
 const status=el('p');status.setAttribute('role','status');root.append(status);
 const reasonKeys={ADMIN_ACCOUNT:'관리자 계정은 이 화면에서 탈퇴할 수 없습니다. 운영 담당 계정을 먼저 인계해주세요.',OPEN_ORDER:'완료되지 않은 주문을 먼저 정리해주세요.',SELLER_SETTLEMENT:'판매 대금의 실제 정산 완료 확인이 필요합니다. 고객지원으로 문의해주세요.',OPEN_REFUND:'진행 중이거나 확인이 필요한 환불이 있습니다.',PAYMENT_REVIEW:'결제 결과 확인이 먼저 필요합니다.',OPEN_DISPUTE:'진행 중인 분쟁을 먼저 해결해주세요.',SUBSCRIPTION:'구독 해지 예약 후 이용 기간 종료 또는 미납 정리를 먼저 완료해주세요.',BILLING_REVIEW:'자동결제·카드 변경 결과 확인이 먼저 필요합니다.',WALLET_BALANCE:'남은 지갑 잔액을 먼저 정리해주세요. 고객지원으로 문의해주세요.',MAIL_IN_PROGRESS:'메일 처리 중입니다. 잠시 후 다시 확인해주세요.',NOT_READY:'회원 탈퇴 연결을 준비 중입니다.'};
 try{const state=await authRequest('withdrawal');if(!current())return;
  if(state.reasons.length){for(const code of state.reasons)root.append(el('p',reasonKeys[code]||reasonKeys.NOT_READY));return;}
  if(!state.recentLogin){root.append(el('p','계정 보호를 위해 다시 로그인한 뒤 10분 이내에 탈퇴를 진행해주세요.'));const b=el('button','로그아웃 후 다시 로그인');b.type='button';b.onclick=async()=>{b.disabled=true;try{await authRequest('logout',{});authUser=null;updateAccountHeader();go('login');}catch(e){uiMessage(status,e.message);b.disabled=false;}};root.append(b);return;}
  const form=el('form'),ack=el('input'),ackLabel=el('label'),text=el('input'),textLabel=el('label','탈퇴를 원하시면 DELETE를 입력해주세요.');ack.type='checkbox';ack.required=true;ackLabel.append(ack,el('span','위 안내와 탈퇴 후 접근 제한을 확인했습니다.'));text.autocomplete='off';text.required=true;text.pattern='DELETE';text.maxLength=6;textLabel.append(text);const submit=el('button','회원 탈퇴 확정');submit.type='submit';submit.className='outline-link';submit.disabled=true;const check=()=>submit.disabled=!ack.checked||text.value!=='DELETE';ack.onchange=check;text.oninput=check;form.append(ackLabel,textLabel,submit);root.append(form);let busy=false;
  form.onsubmit=async e=>{e.preventDefault();if(busy||!current()||!form.reportValidity())return;busy=true;submit.disabled=true;try{await authRequest('withdrawal',{requestId:crypto.randomUUID(),token:state.token,policyVersion:state.policyVersion,confirmation:text.value,acknowledged:ack.checked});authUser=null;for(const k of ['nnx-creator-intent','nnx-pending-link','nnx-login-return'])try{sessionStorage.removeItem(k);}catch{}updateAccountHeader();if(page.dataset.route==='account-withdrawal'){root.replaceChildren(el('h2','회원 탈퇴가 완료되었습니다.'));link('마켓플레이스','#/marketplace');}}catch(e){if(current()){const messages={REAUTH_REQUIRED:'계정 보호를 위해 다시 로그인한 뒤 10분 이내에 탈퇴를 진행해주세요.',WITHDRAWAL_BLOCKED:'거래 상태가 변경되었습니다. 페이지를 새로 열어 확인해주세요.',INVALID_INPUT:'입력 내용과 동의 여부를 확인해주세요.'};uiMessage(status,messages[e.message]||'탈퇴를 처리하지 못했습니다. 다시 확인해주세요.');busy=false;check();}}};
 }catch(e){if(current())uiMessage(status,'탈퇴 정보를 불러오지 못했습니다. 다시 시도해주세요.');}
}
