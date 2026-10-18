'use strict';
// Apply current tombstones to an isolated restore, including backups predating
// withdrawal. Never accept an unavailable/stale registry as an empty registry.
module.exports=function({db,current,isolatedRestoreConfirmed=false,now=Date.now()}){
 if(!isolatedRestoreConfirmed||!Array.isArray(current)||!Number.isSafeInteger(now))throw Error('CURRENT_WITHDRAWAL_REGISTRY_REQUIRED');
 const seen=new Set();for(const r of current){if(!r||typeof r.user_id!=='string'||!r.user_id||seen.has(r.user_id)||!Number.isSafeInteger(r.withdrawn_at)||r.withdrawn_at>now||r.withdrawn_at<0)throw Error('INVALID_WITHDRAWAL_REGISTRY');seen.add(r.user_id);}
 const service=require('./account-withdrawal.cjs')({db,clock:()=>now}),exists=t=>!!db.prepare('SELECT to_regclass(?) relation').get(t).relation;let reapplied=0;
 db.exec('BEGIN IMMEDIATE');try{for(const r of current){if(!db.prepare('SELECT id FROM users WHERE id=?').get(r.user_id))continue;service.erasePersonal(r.user_id,r.withdrawn_at);if(service.ready())db.prepare('INSERT INTO nnx_operating_v1.account_withdrawals VALUES(?,?,?,?) ON CONFLICT(user_id) DO NOTHING').run(r.user_id,r.request_id,r.withdrawn_at,r.policy_version);reapplied++;}if(exists('nnx_retention_v1.withdrawn_identity'))db.prepare('DELETE FROM nnx_retention_v1.withdrawn_identity WHERE expires_at<=?').run(now);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 return {reapplied,productionRestoreApproved:false,existingBackupFilesChanged:false};
};
