'use strict';
const {DatabaseSync}=require('node:sqlite'),{Readable}=require('node:stream'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE creator_assets(id TEXT PRIMARY KEY);CREATE TABLE neon_test_orders(id TEXT PRIMARY KEY);CREATE TABLE admin_access_audit(id TEXT PRIMARY KEY,actor TEXT,view TEXT,created INTEGER);INSERT INTO users VALUES('member');INSERT INTO neon_test_orders VALUES('test-order');");
const handle=require('./operations-cases.cjs')({db,user:r=>r.actor,json:(r,s,b)=>{r.status=s;r.body=b;},origin:'http://local',isAdmin:u=>u.id==='admin'});let passed=0;
async function call(input,actor='admin',method='POST',origin='http://local'){const req=Readable.from([Buffer.from(JSON.stringify(input))]);req.actor=actor?{id:actor}:null;req.method=method;req.url='/api/auth/admin/cases';req.headers={origin,'content-type':'application/json'};const res={};await handle(req,res,req.url);return res;}
const check=(condition)=>{assert.ok(condition);passed++;};
(async()=>{
const base={requestId:'case_'+crypto.randomUUID(),action:'CREATE',kind:'DISPUTE',targetType:'TEST_ORDER',targetId:'test-order',summary:'Synthetic review',reason:'Synthetic reason'};
check((await call(base,null)).status===401);check((await call(base,'member')).status===403);check((await call(base,'admin','POST','http://other')).status===403);
check((await call({...base,targetType:'REAL_ORDER'})).status===400);check((await call({...base,targetId:'missing'})).status===404);
let created=await call(base);check(created.status===200&&created.body.financialEffects===false);check((await call(base)).body.case.id===created.body.case.id);check((await call({...base,reason:'Changed'})).status===409);
const id=created.body.case.id,change={requestId:'case_'+crypto.randomUUID(),action:'UPDATE',caseId:id,version:1,state:'IN_REVIEW',assigneeId:'admin',reason:'Review started'};
check((await call({...change,state:'CLOSED'})).status===409);check((await call({...change,assigneeId:'member'})).status===409);let updated=await call(change);check(updated.status===200&&updated.body.case.version===2);check((await call(change)).body.case.version===2);check((await call({...change,requestId:'case_'+crypto.randomUUID()})).status===409);
let closed=await call({...change,requestId:'case_'+crypto.randomUUID(),version:2,state:'CLOSED'});check(closed.status===200);
const before=db.prepare('SELECT COUNT(*) n FROM admin_case_events').get().n;db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON admin_case_events BEGIN SELECT RAISE(ABORT,'synthetic audit failure');END;");let failed=false;try{await call({...change,requestId:'case_'+crypto.randomUUID(),version:3});}catch{failed=true;}check(failed&&db.prepare('SELECT version FROM admin_operations_cases WHERE id=?').get(id).version===3&&db.prepare('SELECT COUNT(*) n FROM admin_case_events').get().n===before);db.exec('DROP TRIGGER fail_audit');
check((await call(null,'admin','GET')).body.cases.length===1);check(db.prepare('SELECT COUNT(*) n FROM neon_test_orders').get().n===1);
const report={passed,scope:'In-memory SQLite module boundary, synthetic records only',externalCalls:0};console.log(JSON.stringify(report));db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
