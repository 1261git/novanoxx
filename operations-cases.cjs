'use strict';
const crypto=require('node:crypto');
module.exports=function({db,user,json,origin,isAdmin=require('./admin-policy.cjs')}){
 db.exec('CREATE TABLE IF NOT EXISTS admin_operations_cases(id TEXT PRIMARY KEY,kind TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,state TEXT NOT NULL,assignee_id TEXT,summary TEXT NOT NULL,version INTEGER NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS admin_case_events(id TEXT PRIMARY KEY,case_id TEXT NOT NULL,actor_id TEXT NOT NULL,payload_hash TEXT NOT NULL,result TEXT NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL);');
 const targets={MEMBER:['users','id'],ASSET:['creator_assets','id'],TEST_ORDER:['neon_test_orders','id']};
 return async(req,res,name)=>{
  if(name!=='/api/auth/admin/cases')return false;
  const actor=user(req);if(!actor){json(res,401,{error:'로그인이 필요합니다.'});return true;}if(!isAdmin(actor)){json(res,403,{error:'관리자 권한이 필요합니다.'});return true;}
  if(req.method==='GET'){
   const q=new URL(req.url,origin).searchParams,offset=q.get('offset')||'0';if(!/^\d{1,6}$/.test(offset)||Number(offset)>100000){json(res,400,{error:'Invalid offset'});return true;}
   const rows=db.prepare('SELECT * FROM admin_operations_cases ORDER BY created DESC,id LIMIT ? OFFSET ?').all(26,Number(offset));
   const caseId=q.get('caseId');let events=[];if(caseId){if(caseId.length>100){json(res,400,{error:'Invalid case'});return true;}events=db.prepare('SELECT id,case_id,actor_id,reason,created,result FROM admin_case_events WHERE case_id=? ORDER BY created DESC,id LIMIT 100').all(caseId);}
   db.prepare('INSERT INTO admin_access_audit VALUES(?,?,?,?)').run(crypto.randomUUID(),actor.id,'cases',Date.now());json(res,200,{cases:rows.slice(0,25),nextOffset:rows.length>25?Number(offset)+25:null,events,financialEffects:false});return true;
  }
  if(req.method!=='POST'){json(res,405,{error:'Method not allowed'});return true;}
  if(req.headers.origin!==origin){json(res,403,{error:'Invalid origin'});return true;}if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){json(res,415,{error:'JSON required'});return true;}
  let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>8192){json(res,413,{error:'Request too large'});return true;}chunks.push(c);}let i;try{i=JSON.parse(Buffer.concat(chunks));}catch{}
  if(!i||Array.isArray(i)||typeof i!=='object'||typeof i.requestId!=='string'||!/^case_[0-9a-f-]{36}$/.test(i.requestId)||typeof i.reason!=='string'||!i.reason.trim()||i.reason.length>1000||!['CREATE','UPDATE'].includes(i.action)){json(res,400,{error:'Invalid case request'});return true;}
  const payload=JSON.stringify({actor:actor.id,input:i}),digest=crypto.createHash('sha256').update(payload).digest('hex');
  db.exec('BEGIN IMMEDIATE');try{
   const old=db.prepare('SELECT payload_hash,result FROM admin_case_events WHERE id=?').get(i.requestId);if(old){db.exec('ROLLBACK');json(res,old.payload_hash===digest?200:409,old.payload_hash===digest?JSON.parse(old.result):{error:'Request ID conflict'});return true;}
   const now=Date.now();let record;
   if(i.action==='CREATE'){
    const target=targets[i.targetType];if(!target||typeof i.targetId!=='string'||i.targetId.length>100||!['DISPUTE','OPERATIONS'].includes(i.kind)||typeof i.summary!=='string'||!i.summary.trim()||i.summary.length>500){db.exec('ROLLBACK');json(res,400,{error:'Invalid case target'});return true;}
    if(!db.prepare('SELECT '+target[1]+' FROM '+target[0]+' WHERE '+target[1]+'=?').get(i.targetId)){db.exec('ROLLBACK');json(res,404,{error:'Target not found'});return true;}
    record={id:crypto.randomUUID(),kind:i.kind,target_type:i.targetType,target_id:i.targetId,state:'OPEN',assignee_id:null,summary:i.summary.trim(),version:1,created:now,updated:now};
    db.prepare('INSERT INTO admin_operations_cases VALUES(?,?,?,?,?,?,?,?,?,?)').run(...Object.values(record));
   }else{
    record=typeof i.caseId==='string'?db.prepare('SELECT * FROM admin_operations_cases WHERE id=?').get(i.caseId):null;
    if(!record){db.exec('ROLLBACK');json(res,404,{error:'Case not found'});return true;}
    const allowed={OPEN:['OPEN','IN_REVIEW'],IN_REVIEW:['IN_REVIEW','WAITING','CLOSED'],WAITING:['WAITING','IN_REVIEW','CLOSED'],CLOSED:['IN_REVIEW']};
    if(!Number.isSafeInteger(i.version)||i.version!==record.version||!allowed[record.state]?.includes(i.state)||![null,actor.id].includes(i.assigneeId)){db.exec('ROLLBACK');json(res,409,{error:'Reload the case before updating; assignment is to yourself or unassigned.'});return true;}
    const changed=db.prepare('UPDATE admin_operations_cases SET state=?,assignee_id=?,version=version+1,updated=? WHERE id=? AND version=?').run(i.state,i.assigneeId,now,record.id,i.version);if(changed.changes!==1)throw Error('Case update conflict');record={...record,state:i.state,assignee_id:i.assigneeId,version:record.version+1,updated:now};
   }
   const result={ok:true,case:record,financialEffects:false};db.prepare('INSERT INTO admin_case_events VALUES(?,?,?,?,?,?,?)').run(i.requestId,record.id,actor.id,digest,JSON.stringify(result),i.reason.trim(),now);db.exec('COMMIT');json(res,200,result);
  }catch(error){db.exec('ROLLBACK');throw error;}return true;
 };
};
