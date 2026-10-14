// Rehearsal only. No production URL fallback or application startup import.
const crypto=require('node:crypto');
const schema='nnx_trade_preview';
const versions=[
 {id:'001-wallet-opening',sql:`CREATE TABLE ${schema}.wallets(user_id TEXT PRIMARY KEY REFERENCES public.users(id),environment TEXT NOT NULL CHECK(environment='TEST'),balance BIGINT NOT NULL CHECK(balance>=0));
 CREATE TABLE ${schema}.ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES ${schema}.wallets(user_id),kind TEXT NOT NULL CHECK(kind='MIGRATION_OPENING'),delta BIGINT NOT NULL CHECK(delta>=0),balance_before BIGINT NOT NULL CHECK(balance_before=0),balance_after BIGINT NOT NULL CHECK(balance_after=delta),UNIQUE(user_id,kind));
 INSERT INTO ${schema}.wallets SELECT u.id,'TEST',coalesce(a.neon_balance,0) FROM public.users u LEFT JOIN public.account_status a ON a.user_id=u.id;
 INSERT INTO ${schema}.ledger SELECT 'opening:'||user_id,user_id,'MIGRATION_OPENING',balance,0,balance FROM ${schema}.wallets;`},
 {id:'002-order-boundaries',sql:`CREATE TABLE ${schema}.orders(id TEXT PRIMARY KEY,buyer_id TEXT NOT NULL REFERENCES ${schema}.wallets(user_id),seller_id TEXT NOT NULL REFERENCES public.users(id),asset_id TEXT NOT NULL,environment TEXT NOT NULL CHECK(environment='TEST'),price_neon BIGINT NOT NULL CHECK(price_neon>0),fee_bps INTEGER NOT NULL CHECK(fee_bps=1200),status TEXT NOT NULL CHECK(status IN ('COMPLETED','REFUNDED')),sale_mode TEXT NOT NULL CHECK(sale_mode IN ('EXCLUSIVE','MULTI')),terms_snapshot JSONB NOT NULL,CHECK(buyer_id<>seller_id));
 CREATE UNIQUE INDEX exclusive_completed ON ${schema}.orders(asset_id) WHERE sale_mode='EXCLUSIVE' AND status='COMPLETED';
 CREATE TABLE ${schema}.entitlements(order_id TEXT NOT NULL REFERENCES ${schema}.orders(id),file_id TEXT NOT NULL,buyer_id TEXT NOT NULL REFERENCES public.users(id),revoked_at TIMESTAMPTZ,PRIMARY KEY(order_id,file_id));
 CREATE TABLE ${schema}.settlements(order_id TEXT PRIMARY KEY REFERENCES ${schema}.orders(id),gross_krw BIGINT NOT NULL CHECK(gross_krw>0),fee_krw BIGINT NOT NULL CHECK(fee_krw>=0),net_krw BIGINT NOT NULL CHECK(net_krw>=0),status TEXT NOT NULL CHECK(status IN ('PENDING','CANCELLED')),CHECK(fee_krw*100=gross_krw*12),CHECK(net_krw=gross_krw-fee_krw));`}
].map(v=>({...v,checksum:crypto.createHash('sha256').update(v.sql).digest('hex')}));
function guard(config){if(config.host!=='127.0.0.1'||config.user!=='nnx_sandbox'||!/^nnx_sandbox_home_[a-f0-9]+$/.test(config.database))throw Error('ISOLATED_DATABASE_REQUIRED');}
async function apply(config,{injectFailure=false}={}){
 guard(config);const c=new(require('pg').Client)(config);await c.connect();
 try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(771102105)');
 if((await c.query('SELECT marker FROM public.sandbox_environment')).rows[0]?.marker!=='NNX_REAL_PG_SANDBOX_V1')throw Error('SANDBOX_REQUIRED');
 const exists=(await c.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount;
 if(exists&&!(await c.query("SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name='schema_versions'",[schema])).rowCount)throw Error('UNKNOWN_SCHEMA_REFUSED');
 await c.query(`CREATE SCHEMA IF NOT EXISTS ${schema};CREATE TABLE IF NOT EXISTS ${schema}.schema_versions(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
 const applied=(await c.query(`SELECT version,checksum FROM ${schema}.schema_versions ORDER BY version`)).rows;
 if(applied.some((v,i)=>versions[i]?.id!==v.version||versions[i]?.checksum!==v.checksum))throw Error('MIGRATION_HISTORY_MISMATCH');
 const created=[];for(const v of versions.slice(applied.length)){await c.query(v.sql);await c.query(`INSERT INTO ${schema}.schema_versions(version,checksum) VALUES($1,$2)`,[v.id,v.checksum]);created.push(v.id);if(injectFailure)throw Error('INJECTED_MIGRATION_FAILURE');}
 const violations=Number((await c.query(`SELECT count(*) AS n FROM public.users u LEFT JOIN public.account_status a ON a.user_id=u.id LEFT JOIN ${schema}.wallets w ON w.user_id=u.id LEFT JOIN ${schema}.ledger l ON l.user_id=u.id WHERE w.balance IS DISTINCT FROM coalesce(a.neon_balance,0) OR l.delta IS DISTINCT FROM coalesce(a.neon_balance,0) OR l.balance_after IS DISTINCT FROM w.balance`)).rows[0].n);
 if(violations)throw Error('OPENING_BALANCE_MISMATCH');await c.query('COMMIT');return {created,versions:versions.map(v=>v.id),violations};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
}
module.exports={apply,guard,schema,versions};
