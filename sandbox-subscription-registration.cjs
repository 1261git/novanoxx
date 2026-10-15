// Optional local registration integration. Existing standalone Stage 7 fixtures stay untouched.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),trusted=new WeakSet();
const plans={FREE:{krw:0,limit:1},PLUS:{krw:3000,limit:3},ULTRA:{krw:6900,limit:7},PRO:{krw:9900,limit:null}};
const ddl=`CREATE TABLE IF NOT EXISTS sandbox_plan_version(id INTEGER PRIMARY KEY,checksum TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sandbox_plans(user_id TEXT PRIMARY KEY,plan TEXT NOT NULL,trial_used INTEGER NOT NULL,trial_until BIGINT,period_until BIGINT,cancel_at_end INTEGER NOT NULL,updated BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS sandbox_plan_requests(user_id TEXT NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(user_id,request_id));
CREATE TABLE IF NOT EXISTS sandbox_plan_events(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,request_id TEXT NOT NULL,kind TEXT NOT NULL,before_state TEXT NOT NULL,after_state TEXT NOT NULL,occurred BIGINT NOT NULL);`;
const digest=crypto.createHash('sha256').update(ddl).digest('hex');
function nextMonth(ms){const d=new Date(ms),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const max=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,max));return d.getTime();}
function create(db,dir){
 const real=fs.realpathSync(dir),base=fs.realpathSync(path.join(__dirname,'.sandbox-commerce'));
 if(path.basename(real)!=='accounts'||!fs.realpathSync(path.dirname(real)).startsWith(base+path.sep)||db.backend==='postgres')throw Error('LOCAL_SQLITE_SUBSCRIPTION_REGISTRATION_ONLY');
 db.exec('BEGIN IMMEDIATE');try{db.exec(ddl);const rows=db.prepare('SELECT * FROM sandbox_plan_version').all();if(!rows.length)db.prepare('INSERT INTO sandbox_plan_version VALUES(1,?)').run(digest);else if(rows.length!==1||rows[0].id!==1||rows[0].checksum!==digest)throw Error('PLAN_VERSION_CONFLICT');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 function guard(){const v=db.prepare('SELECT * FROM sandbox_plan_version').all();if(v.length!==1||v[0].id!==1||v[0].checksum!==digest)throw Error('PLAN_VERSION_CONFLICT');}
 function ensure(user){if(!db.prepare('SELECT id FROM users WHERE id=?').get(user))throw Error('PLAN_ACCESS_DENIED');db.prepare("INSERT OR IGNORE INTO sandbox_plans VALUES(?,'FREE',0,NULL,NULL,0,?)").run(user,Date.now());}
 function snapshot(user){const m=db.prepare('SELECT * FROM sandbox_plans WHERE user_id=?').get(user);const assets=db.prepare('SELECT id,status,metadata,created FROM creator_assets WHERE user_id=? ORDER BY created,id').all(user).map(a=>({id:a.id,status:a.status,title:JSON.parse(a.metadata).title}));return {environment:'SANDBOX',billing:'SIMULATED_NO_CHARGE',policy:'LOCAL_REGISTRATION_TEST_V1',member:m||{plan:'FREE',trial_used:0},plans,active:assets.filter(a=>a.status==='ACTIVE').length,assets,history:db.prepare('SELECT kind,occurred FROM sandbox_plan_events WHERE user_id=? ORDER BY occurred DESC,id LIMIT 30').all(user)};}
 function pauseExtra(user,plan,keep){const active=db.prepare("SELECT id FROM creator_assets WHERE user_id=? AND status='ACTIVE' ORDER BY created,id").all(user),limit=plans[plan].limit;if(limit===null||active.length<=limit)return;
 if(!Array.isArray(keep)||keep.length!==limit||new Set(keep).size!==keep.length||keep.some(id=>!active.some(a=>a.id===id)))throw Error('PLAN_KEEP_SELECTION_REQUIRED');
 for(const a of active)if(!keep.includes(a.id))db.prepare("UPDATE creator_assets SET status='PAUSED',updated=? WHERE id=? AND user_id=? AND status='ACTIVE'").run(Date.now(),a.id,user);
 }
 // Invoked inside creator-api's own transaction. Do not open/nest transactions here.
 function checkActivation(asset){guard();ensure(asset.user_id);const m=db.prepare('SELECT * FROM sandbox_plans WHERE user_id=?').get(asset.user_id),now=Date.now();if(m.trial_until&&now>=m.trial_until||m.period_until&&now>=m.period_until)throw Error('PLAN_PERIOD_ENDED');const count=db.prepare("SELECT count(*) AS n FROM creator_assets WHERE user_id=? AND status='ACTIVE' AND id<>?").get(asset.user_id,asset.id).n,limit=plans[m.plan]?.limit;if(limit===undefined||limit!==null&&count>=limit)throw Error('PLAN_ACTIVE_LIMIT');}
 function act(user,i){if(!i||typeof i!=='object'||Array.isArray(i)||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(i.requestId||''))throw Error('PLAN_INVALID_INPUT');
 const allowed=['requestId','action','plan','keepAssetIds','assetId'];if(Object.keys(i).some(k=>!allowed.includes(k)))throw Error('PLAN_INVALID_INPUT');const payload=JSON.stringify(i);db.exec('BEGIN IMMEDIATE');try{guard();ensure(user);const prior=db.prepare('SELECT * FROM sandbox_plan_requests WHERE user_id=? AND request_id=?').get(user,i.requestId);if(prior){if(prior.payload!==payload)throw Error('PLAN_REQUEST_CONFLICT');db.exec('COMMIT');return JSON.parse(prior.result);}
 const before=snapshot(user),m=before.member,now=Date.now();let plan=m.plan;
 if(i.action==='trial'){if(m.trial_used||m.plan!=='FREE')throw Error('PLAN_TRIAL_USED');db.prepare("UPDATE sandbox_plans SET plan='PLUS',trial_used=1,trial_until=?,period_until=NULL,cancel_at_end=0,updated=? WHERE user_id=?").run(now+14*86400000,now,user);}
 else if(i.action==='simulatePaid'){if(!Object.hasOwn(plans,i.plan)||i.plan==='FREE')throw Error('PLAN_INVALID_INPUT');plan=i.plan;pauseExtra(user,plan,i.keepAssetIds);db.prepare('UPDATE sandbox_plans SET plan=?,trial_used=1,trial_until=NULL,period_until=?,cancel_at_end=0,updated=? WHERE user_id=?').run(plan,nextMonth(now),now,user);}
 else if(i.action==='cancelAtEnd'){if(m.plan==='FREE'||!m.period_until&&!m.trial_until)throw Error('PLAN_STATE_CONFLICT');db.prepare('UPDATE sandbox_plans SET cancel_at_end=1,updated=? WHERE user_id=?').run(now,user);}
 else if(['simulateRenewal','simulateFailure','settleEnd'].includes(i.action)){
 const end=m.trial_until||m.period_until;if(!end||now<end)throw Error('PLAN_NOT_DUE');
 if(i.action==='simulateRenewal'&&!m.cancel_at_end){db.prepare('UPDATE sandbox_plans SET trial_until=NULL,period_until=?,updated=? WHERE user_id=?').run(nextMonth(now),now,user);}
 else{if(i.action==='settleEnd'&&!m.cancel_at_end&& !m.trial_until)throw Error('PLAN_RENEWAL_RESULT_REQUIRED');pauseExtra(user,'FREE',i.keepAssetIds);db.prepare("UPDATE sandbox_plans SET plan='FREE',trial_until=NULL,period_until=NULL,cancel_at_end=0,updated=? WHERE user_id=?").run(now,user);}
 }else if(i.action==='reactivate'){
 const a=db.prepare("SELECT * FROM creator_assets WHERE id=? AND user_id=? AND status='PAUSED'").get(i.assetId,user);if(!a)throw Error('PLAN_ASSET_CONFLICT');checkActivation(a);db.prepare("UPDATE creator_assets SET status='ACTIVE',updated=? WHERE id=?").run(now,a.id);
 }else throw Error('PLAN_INVALID_INPUT');
 const after=snapshot(user);db.prepare('INSERT INTO sandbox_plan_events VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),user,i.requestId,i.action,JSON.stringify(before),JSON.stringify(after),now);const result=JSON.stringify(snapshot(user));db.prepare('INSERT INTO sandbox_plan_requests VALUES(?,?,?,?)').run(user,i.requestId,payload,result);db.exec('COMMIT');return JSON.parse(result);
 }catch(e){db.exec('ROLLBACK');throw e;}}
 const api={state:user=>{guard();if(!db.prepare('SELECT id FROM users WHERE id=?').get(user))throw Error('PLAN_ACCESS_DENIED');return snapshot(user);},act,checkActivation,sellingAllowed:user=>{guard();const m=db.prepare('SELECT * FROM sandbox_plans WHERE user_id=?').get(user);return !m||(!m.trial_until||Date.now()<m.trial_until)&&(!m.period_until||Date.now()<m.period_until);}};trusted.add(api);return Object.freeze(api);
}
module.exports={create,assert:api=>{if(!trusted.has(api)&&!require('./sandbox-subscription-postgres.cjs').isTrusted(api))throw Error('TRUSTED_PLAN_HOOK_REQUIRED');},nextMonth};
