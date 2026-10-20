'use strict';
// Apply current tombstones to an isolated restore, including backups predating
// withdrawal. Never accept an unavailable/stale registry as an empty registry.
module.exports=function({db,current,isolatedRestoreConfirmed=false,now=Date.now()}){
 if(!isolatedRestoreConfirmed||!Array.isArray(current)||!Number.isSafeInteger(now))throw Error('CURRENT_WITHDRAWAL_REGISTRY_REQUIRED');
 const seen=new Set();for(const r of current){if(!r||typeof r.user_id!=='string'||!r.user_id||seen.has(r.user_id)||!Number.isSafeInteger(r.withdrawn_at)||r.withdrawn_at>now||r.withdrawn_at<0)throw Error('INVALID_WITHDRAWAL_REGISTRY');seen.add(r.user_id);}
 const service=require('./account-withdrawal.cjs')({db,clock:()=>now}),exists=t=>!!db.prepare('SELECT to_regclass(?) relation').get(t).relation;let reapplied=0;
 db.exec('BEGIN IMMEDIATE');try{
  for(const r of current){if(!db.prepare('SELECT id FROM users WHERE id=?').get(r.user_id))continue;service.erasePersonal(r.user_id,r.withdrawn_at);if(service.ready())db.prepare('INSERT INTO nnx_operating_v1.account_withdrawals VALUES(?,?,?,?) ON CONFLICT(user_id) DO NOTHING').run(r.user_id,r.request_id,r.withdrawn_at,r.policy_version);reapplied++;}
  if(exists('nnx_retention_v1.withdrawn_identity'))db.prepare('DELETE FROM nnx_retention_v1.withdrawn_identity WHERE expires_at<=?').run(now);
  // A restore must not revive old promotional consent. The isolation guard
  // above is required; live data and existing backup files are untouched.
  if(exists('public.account_email_preferences'))db.prepare('UPDATE account_email_preferences SET price=0,sold=0,new_assets=0,updated=?').run(now);
  if(exists('public.visitor_browser_daily'))db.exec('DELETE FROM visitor_browser_daily');
  if(exists('public.visitor_daily_totals'))db.prepare('DELETE FROM visitor_daily_totals WHERE date_key<?').run(require('./visitor-analytics.cjs').day(now-119*86400000));
  if(exists('public.account_email_observations'))db.exec('DELETE FROM account_email_observations');
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 return {reapplied,optionalEmailReconsentRequired:true,productionRestoreApproved:false,existingBackupFilesChanged:false};
};
