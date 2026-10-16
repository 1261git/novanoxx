'use strict';
const {create}=require('./account-mail.cjs');
function resendTransport({apiKey,sender='NovaNoxX <no-reply@notify.novanoxx.com>',reply='support@novanoxx.com',request=fetch}){
 if(!/^re_[A-Za-z0-9_-]{20,200}$/.test(apiKey)||sender!=='NovaNoxX <no-reply@notify.novanoxx.com>'||reply!=='support@novanoxx.com')throw Error('MAIL_RUNTIME_CONFIGURATION_REQUIRED');
 return {async send(message){const response=await request('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':message.idempotencyKey},body:JSON.stringify({from:sender,to:[message.recipient],reply_to:reply,subject:message.subject,text:message.text})});
  if(!response.ok){const e=Error('MAIL_PROVIDER_RESPONSE');e.definiteReject=response.status>=400&&response.status<500&&![408,409,429].includes(response.status);throw e;}return response.json();}};
}
function configured({db,origin},env=process.env,{testDelivery,transport,localTest=false}={}){
 if(env.NNX_MAIL_ENABLED!=='1')return null;
 const base=new URL(origin);if(base.protocol!=='https:'&&!(localTest&&base.protocol==='http:'&&base.hostname==='127.0.0.1')||transport&&!localTest)throw Error('MAIL_RUNTIME_CONFIGURATION_REQUIRED');
 const key=Buffer.from(env.NNX_MAIL_ENCRYPTION_KEY||'','base64');
 try{return create({db,origin,encryptionKey:key,transport:transport||resendTransport({apiKey:env.RESEND_API_KEY||'',sender:env.NNX_MAIL_FROM||'',reply:env.NNX_MAIL_REPLY_TO||''}),webhookSecret:env.RESEND_WEBHOOK_SECRET,testDelivery});}finally{key.fill(0);}
}
module.exports={configured,resendTransport};
