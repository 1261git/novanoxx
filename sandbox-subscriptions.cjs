// Stage 7 isolated model. No provider, wallet, creator API or production imports.
const {Pool}=require('pg'),crypto=require('node:crypto');
const plans=Object.freeze({FREE:{krw:0,limit:1},PLUS:{krw:3000,limit:3},ULTRA:{krw:6900,limit:7},PRO:{krw:9900,limit:null}});
const ddl=`CREATE SCHEMA IF NOT EXISTS nnx_subscription_test;
CREATE TABLE IF NOT EXISTS nnx_subscription_test.version(id integer PRIMARY KEY, checksum text NOT NULL);
CREATE TABLE IF NOT EXISTS nnx_subscription_test.members(user_id text PRIMARY KEY,plan text NOT NULL CHECK(plan IN ('FREE','PLUS','ULTRA','PRO')),trial_used boolean NOT NULL DEFAULT false,trial_until timestamptz,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE IF NOT EXISTS nnx_subscription_test.assets(id text PRIMARY KEY,user_id text NOT NULL REFERENCES nnx_subscription_test.members(user_id),status text NOT NULL CHECK(status IN ('ACTIVE','PAUSED','SOLD')),sale_mode text NOT NULL CHECK(sale_mode IN ('MULTI','EXCLUSIVE')));
CREATE TABLE IF NOT EXISTS nnx_subscription_test.requests(user_id text NOT NULL,request_id uuid NOT NULL,payload text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(user_id,request_id));
CREATE TABLE IF NOT EXISTS nnx_subscription_test.events(id bigserial PRIMARY KEY,user_id text NOT NULL,request_id uuid NOT NULL,kind text NOT NULL,before_state jsonb NOT NULL,after_state jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());`;
const checksum=crypto.createHash('sha256').update(ddl).digest('hex');
module.exports=async function connect(config){
 if(config.connectionString!==undefined||config.host!=='127.0.0.1'||config.user!=='nnx_sandbox'||!/^nnx_sandbox_home_[a-f0-9]+$/.test(config.database))throw Error('LOCAL_SUBSCRIPTION_TEST_ONLY');
 const pool=new Pool(config);try{
 const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('nnx_subscription_test_schema'))");
 const marker=await c.query('SELECT marker FROM public.sandbox_environment');if(marker.rows.length!==1||marker.rows[0].marker!=='NNX_REAL_PG_SANDBOX_V1')throw Error('SANDBOX_MARKER_REQUIRED');
 await c.query(ddl);let v=await c.query('SELECT * FROM nnx_subscription_test.version');if(!v.rows.length)await c.query('INSERT INTO nnx_subscription_test.version VALUES(1,$1)',[checksum]);else if(v.rows.length!==1||v.rows[0].id!==1||v.rows[0].checksum!==checksum)throw Error('SUBSCRIPTION_VERSION_CONFLICT');await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }catch(e){await pool.end();throw e;}
 async function state(c,user){return {member:(await c.query('SELECT * FROM nnx_subscription_test.members WHERE user_id=$1',[user])).rows[0],assets:(await c.query('SELECT * FROM nnx_subscription_test.assets WHERE user_id=$1 ORDER BY id',[user])).rows};}
 async function act(user,input){
 if(typeof user!=='string'||!/^stage7_[a-z0-9_]{1,80}$/.test(user))throw Error('SYNTHETIC_USER_REQUIRED');
 if(!input||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestId||''))throw Error('REQUEST_ID_REQUIRED');
 const payload=JSON.stringify(input),c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['subscription:'+user]);
 const marker=await c.query('SELECT marker FROM public.sandbox_environment');if(marker.rows.length!==1||marker.rows[0].marker!=='NNX_REAL_PG_SANDBOX_V1')throw Error('SANDBOX_MARKER_REQUIRED');
 const version=await c.query('SELECT * FROM nnx_subscription_test.version');if(version.rows.length!==1||version.rows[0].checksum!==checksum||version.rows[0].id!==1)throw Error('SUBSCRIPTION_VERSION_CONFLICT');
 const old=await c.query('SELECT * FROM nnx_subscription_test.requests WHERE user_id=$1 AND request_id=$2',[user,input.requestId]);if(old.rows.length){if(old.rows[0].payload!==payload)throw Error('REQUEST_CONFLICT');await c.query('COMMIT');return old.rows[0].result;}
 await c.query("INSERT INTO nnx_subscription_test.members(user_id,plan) VALUES($1,'FREE') ON CONFLICT DO NOTHING",[user]);let before=await state(c,user),m=before.member;
 const now=(await c.query('SELECT clock_timestamp() AS t')).rows[0].t;
 // Expiry is explicit in this model; callers must settle before activation.
 if(m.trial_until&&now>=m.trial_until&&input.action!=='expire')throw Error('TRIAL_EXPIRED_SETTLE_REQUIRED');
 if(input.action==='trial'){
 if(m.trial_used||m.plan!=='FREE')throw Error('TRIAL_NOT_ELIGIBLE');await c.query("UPDATE nnx_subscription_test.members SET plan='PLUS',trial_used=true,trial_until=clock_timestamp()+interval '14 days',updated_at=clock_timestamp() WHERE user_id=$1",[user]);
 }else if(input.action==='simulatePlan'||input.action==='expire'){
 const plan=input.action==='expire'?'FREE':input.plan;if(!Object.hasOwn(plans,plan))throw Error('INVALID_PLAN');if(input.action==='expire'&&(!m.trial_until||now<m.trial_until))throw Error('TRIAL_NOT_DUE');
 const active=before.assets.filter(a=>a.status==='ACTIVE'),limit=plans[plan].limit;
 if(limit!==null&&active.length>limit){const keep=input.keepAssetIds;if(!Array.isArray(keep)||keep.length!==limit||new Set(keep).size!==keep.length||keep.some(id=>!active.some(a=>a.id===id)))throw Error('KEEP_SELECTION_REQUIRED');await c.query("UPDATE nnx_subscription_test.assets SET status='PAUSED' WHERE user_id=$1 AND status='ACTIVE' AND NOT(id=ANY($2::text[]))",[user,keep]);}
 await c.query("UPDATE nnx_subscription_test.members SET plan=$2,trial_until=NULL,trial_used=trial_used OR $2<>'FREE',updated_at=clock_timestamp() WHERE user_id=$1",[user,plan]);
 }else if(input.action==='activate'){
 if(!/^stage7_[a-z0-9_]{1,80}$/.test(input.assetId||'')||!['MULTI','EXCLUSIVE'].includes(input.saleMode))throw Error('SYNTHETIC_ASSET_REQUIRED');
 const existing=await c.query('SELECT * FROM nnx_subscription_test.assets WHERE id=$1',[input.assetId]);if(existing.rows.length&&(existing.rows[0].user_id!==user||existing.rows[0].status==='SOLD'||existing.rows[0].sale_mode!==input.saleMode))throw Error('ASSET_CONFLICT');
 if(existing.rows[0]?.status!=='ACTIVE'){const n=before.assets.filter(a=>a.status==='ACTIVE').length,l=plans[m.plan].limit;if(l!==null&&n>=l)throw Error('ACTIVE_LIMIT');await c.query("INSERT INTO nnx_subscription_test.assets VALUES($1,$2,'ACTIVE',$3) ON CONFLICT(id) DO UPDATE SET status='ACTIVE'",[input.assetId,user,input.saleMode]);}
 }else if(input.action==='simulateSold'){
 const r=await c.query("UPDATE nnx_subscription_test.assets SET status='SOLD' WHERE id=$1 AND user_id=$2 AND sale_mode='EXCLUSIVE' AND status='ACTIVE' RETURNING id",[input.assetId,user]);if(!r.rows.length)throw Error('EXCLUSIVE_ACTIVE_REQUIRED');
 }else throw Error('UNKNOWN_ACTION');
 const after=await state(c,user);await c.query('INSERT INTO nnx_subscription_test.events(user_id,request_id,kind,before_state,after_state) VALUES($1,$2,$3,$4,$5)',[user,input.requestId,input.action,JSON.stringify(before),JSON.stringify(after)]);const result=JSON.parse(JSON.stringify({...after,environment:'SANDBOX',billing:'SIMULATED_NO_CHARGE',policy:'STAGE7_TEST_V1'}));await c.query('INSERT INTO nnx_subscription_test.requests VALUES($1,$2,$3,$4)',[user,input.requestId,payload,JSON.stringify(result)]);await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 return {act,plans,close:()=>pool.end()};
};
