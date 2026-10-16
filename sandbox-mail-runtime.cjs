'use strict';
// External TEST only. Capture explicit mail settings before home-server clears inherited secrets.
const recipients=['novanoxx2026+nnx-stage9-20261016@gmail.com'];
const webhookPath='/api/auth/mail/webhook';
function settings(env,origin,{localTest=false,transport}={}){
 if(env.NNX_MAIL_ENABLED!==undefined&&!['0','1'].includes(env.NNX_MAIL_ENABLED))throw Error('SANDBOX_MAIL_FLAG_REQUIRED');
 if(env.NNX_MAIL_ENABLED!=='1')return null;
 if(env.NNX_MAIL_SEND_PAUSED!==undefined&&!['0','1'].includes(env.NNX_MAIL_SEND_PAUSED))throw Error('SANDBOX_MAIL_PAUSE_FLAG_REQUIRED');
 if(transport&&!localTest||env.SANDBOX_STAGE6!=='1'||env.NNX_MAIL_TEST_RECIPIENTS!==recipients.join(',')||env.NNX_MAIL_TEST_MAX_MESSAGES!=='3')throw Error('SANDBOX_MAIL_TEST_POLICY_REQUIRED');
 const base=new URL(origin),deadline=Date.parse(env.NNX_MAIL_TEST_UNTIL||'');
 if(!Number.isSafeInteger(deadline)||deadline<=0||deadline>Date.now()+24*3600000||base.hostname==='novanoxx.onrender.com'||base.protocol!=='https:'&&!(localTest&&base.protocol==='http:'&&base.hostname==='127.0.0.1'))throw Error('SANDBOX_MAIL_TEST_POLICY_REQUIRED');
 const saved={};for(const key of ['NNX_MAIL_ENABLED','NNX_MAIL_ENCRYPTION_KEY','RESEND_API_KEY','RESEND_WEBHOOK_SECRET','NNX_MAIL_FROM','NNX_MAIL_REPLY_TO'])saved[key]=env[key];
 return {webhookPath,paused:env.NNX_MAIL_SEND_PAUSED==='1',policy:{recipients:[...recipients],maximum:3,deadline},accountMailFactory:input=>require('./mail-runtime.cjs').configured(input,saved,{testDelivery:{recipients,maximum:3,deadline},localTest,transport})};
}
module.exports={settings,webhookPath};
