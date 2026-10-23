'use strict';
// Quick Open is a separate, limited approval, not a full marketplace/billing contract.
function sellers(env){return String(env.NNX_QUICK_OPEN_SELLER_EMAILS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);}
function quick(env){return env.NNX_QUICK_OPEN_APPROVED==='1'&&/^q_[A-Za-z0-9_-]+$/.test(env.NNX_TOSS_MID||'')&&sellers(env).length>0&&sellers(env).every(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));}
function enabled(env){return env.NNX_LIVE_PAYMENTS==='1'&&(env.NNX_QUICK_OPEN_APPROVED==='1'?quick(env):env.NNX_PAYMENT_CONTRACT_APPROVED==='1')&&env.NNX_OPERATING_RECONCILIATION_APPROVED==='1'&&/^live_ck_[A-Za-z0-9_-]+$/.test(env.NNX_TOSS_LIVE_CLIENT_KEY||'')&&/^live_sk_[A-Za-z0-9_-]+$/.test(env.NNX_TOSS_LIVE_SECRET_KEY||'');}
function allows(env,kind,email){return env.NNX_QUICK_OPEN_APPROVED!=='1'||quick(env)&&kind==='ASSET'&&sellers(env).includes(String(email||'').toLowerCase());}
module.exports={enabled,quick,allows};
