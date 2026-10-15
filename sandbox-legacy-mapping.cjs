// Local rehearsal only. This is a mapping manifest, not a purchase/rights migration.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {guard}=require('./sandbox-transition.cjs');
const disk=require('./sandbox-file-db-backup.cjs');
const base=path.join(__dirname,'.sandbox-commerce'),schema='nnx_legacy_mapping_preview';
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object'&&!(v instanceof Date))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
const digest=v=>hash(stable(v));
function localGuard(config){guard(config);if(config.connectionString||config.service||!Number.isInteger(config.port)||config.port<1024||config.port>65535)throw Error('ISOLATED_DATABASE_REQUIRED');}
function rootGuard(root){const real=fs.realpathSync(root);if(fs.lstatSync(root).isSymbolicLink()||path.dirname(real)!==fs.realpathSync(base)||!path.basename(real).startsWith('nnx-disk-fixture-'))throw Error('LOCAL_FIXTURE_STORAGE_REQUIRED');return real;}
const tables=['users','account_status','creator_assets','catalog_links','creator_files','original_entitlements','neon_test_wallet','neon_test_orders','neon_test_ledger','neon_topups','neon_test_grants'];
async function load(c){const out={};for(const t of tables)out[t]=(await c.query('SELECT * FROM public.'+t+' ORDER BY 1')).rows.sort((a,b)=>JSON.stringify(stable(a)).localeCompare(JSON.stringify(stable(b))));return out;}
async function build(config,{storageRoot,balanceSource,expectedFiles}={}){
 localGuard(config);storageRoot=rootGuard(storageRoot);
 if(balanceSource!=='ACCOUNT_STATUS_TEST_ONLY')throw Error('EXPLICIT_BALANCE_SOURCE_REQUIRED');
 if(!expectedFiles||typeof expectedFiles!=='object')throw Error('EXPECTED_FILE_MANIFEST_REQUIRED');
 const c=new(require('pg').Client)(config);await c.connect();
 try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if((await c.query('SELECT marker FROM public.sandbox_environment')).rows[0]?.marker!=='NNX_REAL_PG_SANDBOX_V1')throw Error('SANDBOX_REQUIRED');
  const source=await load(c),files=await disk.inventory(storageRoot),problems=[],notes=[];
  const fail=(code,id)=>problems.push({code,id});const note=(code,id)=>notes.push({code,id});
  const users=new Set(source.users.map(x=>x.id)),assets=new Map(source.creator_assets.map(x=>[x.id,x]));
  const status=new Map(source.account_status.map(x=>[x.user_id,x]));
  const testWallets=new Map(source.neon_test_wallet.map(x=>[x.user_id,x]));
  const safe=x=>Number.isSafeInteger(Number(x))&&Number(x)>=0;
  const accounts=source.users.map(u=>{const s=status.get(u.id),t=testWallets.get(u.id);if(!s)note('MISSING_ACCOUNT_STATUS_ZERO_FIXTURE',u.id);if(!safe(s?.neon_balance??0)||!safe(t?.balance??0))fail('INVALID_BALANCE',u.id);if(t&&Number(t.balance)!==Number(s?.neon_balance??0))note('DISTINCT_TEST_BALANCES_NOT_SUMMED',u.id);return {userId:u.id,environment:'TEST',openingBalance:Number(s?.neon_balance??0),source:'account_status',archivedTestBalance:t?Number(t.balance):null,liveCredit:0};});
  for(const t of ['account_status','neon_test_wallet','neon_test_orders','neon_test_ledger','neon_topups','neon_test_grants'])for(const r of source[t])if(!users.has(r.user_id))fail('ORPHAN_USER_'+t,r.user_id);
  const publicIds=new Map(),seenIds=new Set();for(const l of source.catalog_links){const n=Number(l.public_id)+1000;if(!assets.has(l.asset_id))fail('ORPHAN_CATALOG_LINK',l.asset_id);if(!safe(l.public_id)||!Number.isSafeInteger(n)||seenIds.has(n)||publicIds.has(l.asset_id))fail('INVALID_PUBLIC_ID',l.asset_id);seenIds.add(n);publicIds.set(l.asset_id,n);}
  const mappedFiles=[];for(const f of source.creator_files){const a=assets.get(f.asset_id);if(!a)fail('ORPHAN_FILE_ASSET',f.id);if(!users.has(f.user_id)||a&&a.user_id!==f.user_id)fail('FILE_OWNER_MISMATCH',f.id);if(!['original','preview','thumbnail'].includes(f.kind))fail('UNKNOWN_FILE_KIND',f.id);if(!/^[a-zA-Z0-9_.-]+$/.test(f.id)||f.id==='.'||f.id==='..'){fail('UNSAFE_FILE_ID',f.id);continue;}const key='uploads/'+f.id,observed=files[key],expected=expectedFiles[f.id];if(!observed)fail('FILE_MISSING',f.id);else if(!safe(f.size)||Number(f.size)!==observed.size)fail('FILE_SIZE_MISMATCH',f.id);if(!expected||!Number.isSafeInteger(expected.size)||! /^[a-f0-9]{64}$/.test(expected.sha256))fail('EXPECTED_FILE_MISSING',f.id);else if(!observed||observed.sha256!==expected.sha256||observed.size!==expected.size)fail('FILE_HASH_MISMATCH',f.id);mappedFiles.push({fileId:f.id,assetId:f.asset_id,ownerId:f.user_id,kind:f.kind,key,size:observed?.size??null,sha256:observed?.sha256??null});}
  const mappedAssets=source.creator_assets.map(a=>{let m;try{m=JSON.parse(a.metadata);}catch{fail('INVALID_METADATA',a.id);m={};}if(!users.has(a.user_id))fail('ASSET_OWNER_UNKNOWN',a.id);if(!['DRAFT','REVIEW','ACTIVE','REJECTED','RESERVED','SOLD'].includes(a.status))fail('UNKNOWN_ASSET_STATUS',a.id);if(!['MULTI','EXCLUSIVE'].includes(m.saleMode))fail('EXPLICIT_SALE_MODE_REQUIRED',a.id);if(!safe(m.price)||Number(m.price)<1)fail('INVALID_ASSET_PRICE',a.id);if(!require('./creator-options.cjs')[m.category]?.includes(m.subcategory))fail('INVALID_CATEGORY',a.id);if(['ACTIVE','RESERVED','SOLD'].includes(a.status)&&!publicIds.has(a.id))fail('PUBLIC_ID_MISSING',a.id);const originals=mappedFiles.filter(f=>f.assetId===a.id&&f.kind==='original');if(['ACTIVE','RESERVED','SOLD'].includes(a.status)&&!originals.length)fail('ORIGINAL_MISSING',a.id);const recorded=m.rightsConfirmed===true&&m.contract?.mode===m.saleMode&&m.contract?.sellerId===a.user_id&&m.contract?.version==='2026-10-11-v1';if(!recorded)note('RIGHTS_RECORD_REQUIRES_MANUAL_CHECK',a.id);return {assetId:a.id,sellerId:a.user_id,publicId:publicIds.get(a.id)??null,saleMode:m.saleMode??null,legacyStatus:a.status,priceNeon:Number(m.price),rightsRecordPresent:recorded,manualRightsCheckRequired:true,publishAllowed:false,originalFileIds:originals.map(f=>f.fileId).sort()};});
  const staticIds=new Set(require('./test-purchase-assets.json').map(a=>a.id));
  const orders=source.neon_test_orders.map(o=>{const mapped=mappedAssets.find(a=>a.publicId===Number(o.asset_id)),staticFixture=Number(o.asset_id)<1001&&staticIds.has(Number(o.asset_id));if(!mapped&&!staticFixture)fail('TEST_ORDER_ASSET_UNRESOLVED',o.id);if(staticFixture)note('STATIC_TEST_CATALOG_ARCHIVE_ONLY',o.id);if(mapped?.sellerId===o.user_id)fail('LEGACY_SELF_PURCHASE',o.id);if(!safe(o.price)||Number(o.price)<1)fail('INVALID_TEST_ORDER_PRICE',o.id);const ledger=source.neon_test_ledger.filter(l=>l.order_id===o.id);if(ledger.length!==1||ledger.some(l=>l.user_id!==o.user_id||!safe(l.balance_before)||!safe(l.balance_after)||Number(l.delta)!==-Number(o.price)||Number(l.balance_before)+Number(l.delta)!==Number(l.balance_after)))fail('TEST_ORDER_LEDGER_MISMATCH',o.id);return {legacyOrderId:o.id,buyerId:o.user_id,legacyPublicId:Number(o.asset_id),assetId:mapped?.assetId??null,catalogSource:staticFixture?'STATIC_TEST_ARCHIVE':'CREATOR',priceNeon:Number(o.price),environment:'TEST',liveOrderCreated:false};});
  for(const l of source.neon_test_ledger)if(!source.neon_test_orders.some(o=>o.id===l.order_id))fail('ORPHAN_TEST_LEDGER_ORDER',l.id);
  for(const p of source.neon_topups)if(!safe(p.neon)||Number(p.neon)<1||!safe(p.amount)||Number(p.amount)!==Number(p.neon)*100||!['PENDING','PAID','FAILED','CANCELLED'].includes(p.state))fail('INVALID_TEST_TOPUP',p.id);
  for(const g of source.neon_test_grants)if(!safe(g.neon))fail('INVALID_TEST_GRANT',g.user_id);
  for(const a of accounts){const credits=source.neon_topups.filter(p=>p.user_id===a.userId&&p.state==='PAID').reduce((n,p)=>n+Number(p.neon),0)+source.neon_test_grants.filter(g=>g.user_id===a.userId).reduce((n,g)=>n+Number(g.neon),0),debits=orders.filter(o=>o.buyerId===a.userId).reduce((n,o)=>n+o.priceNeon,0),expected=credits-debits;a.testHistoryBalance=expected;a.testHistoryReconciled=safe(credits)&&safe(debits)&&safe(expected)&&expected===(a.archivedTestBalance??0);if(!a.testHistoryReconciled)fail('TEST_WALLET_HISTORY_MISMATCH',a.userId);}
  const rights=source.original_entitlements.map(e=>{if(!users.has(e.user_id)||!assets.has(e.asset_id))fail('ORPHAN_ENTITLEMENT',e.order_id);const o=orders.find(o=>o.legacyOrderId===e.order_id);if(!o||o.buyerId!==e.user_id||o.assetId!==e.asset_id)fail('ENTITLEMENT_ORDER_MISMATCH',e.order_id);if(!['PAID','REFUNDED','CANCELLED'].includes(e.status))fail('INVALID_ENTITLEMENT_STATUS',e.order_id);return {legacyOrderId:e.order_id,buyerId:e.user_id,assetId:e.asset_id,legacyStatus:e.status,environment:'TEST',grantAllowed:false,revocationRequired:e.status!=='PAID',manualRightsCheckRequired:true};});
  for(const a of mappedAssets.filter(a=>a.saleMode==='EXCLUSIVE'))if(rights.filter(e=>e.assetId===a.assetId&&e.legacyStatus==='PAID').length>1)fail('MULTIPLE_EXCLUSIVE_ENTITLEMENTS',a.assetId);
  const archive=Object.fromEntries(tables.map(t=>[t,{rows:source[t].length,sha256:digest(source[t])}]));
  const manifest={format:'NNX_LEGACY_MAPPING_V1',environment:'TEST',productionApplied:false,sourceDatabase:config.database,balanceSource,accounts,assets:mappedAssets,files:mappedFiles,orders,rights,archive,inventoryDigest:digest(files),problems,notes,readyForPreview:problems.length===0,liveActivationAllowed:false};
  await c.query('COMMIT');return {...manifest,checksum:digest(manifest)};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
}
async function persistStage(config,options,plan){
 localGuard(config);const {checksum,...body}=plan;if(checksum!==digest(body))throw Error('MAPPING_CHECKSUM_MISMATCH');if(!plan.readyForPreview||plan.problems.length||plan.environment!=='TEST'||plan.liveActivationAllowed!==false)throw Error('MAPPING_NOT_READY');
 const current=await build(config,options);if(current.checksum!==checksum)throw Error('SOURCE_CHANGED_SINCE_MAPPING');
 const c=new(require('pg').Client)(config);await c.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(771102106)');
  // Lock all source relations until the final recheck and manifest insertion complete.
  for(const t of tables)await c.query('LOCK TABLE public.'+t+' IN SHARE MODE');
  if((await c.query('SELECT marker FROM public.sandbox_environment')).rows[0]?.marker!=='NNX_REAL_PG_SANDBOX_V1')throw Error('SANDBOX_REQUIRED');
  const pinned=await load(c);if(tables.some(t=>digest(pinned[t])!==plan.archive[t].sha256)||digest(await disk.inventory(rootGuard(options.storageRoot)))!==plan.inventoryDigest)throw Error('SOURCE_CHANGED_SINCE_MAPPING');
  const exists=(await c.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount;
  if(exists&&!(await c.query('SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2',[schema,'manifests'])).rowCount)throw Error('UNKNOWN_MAPPING_SCHEMA_REFUSED');
  await c.query(`CREATE SCHEMA IF NOT EXISTS ${schema};CREATE TABLE IF NOT EXISTS ${schema}.manifests(checksum TEXT PRIMARY KEY,environment TEXT NOT NULL CHECK(environment='TEST'),payload JSONB NOT NULL,created TIMESTAMPTZ NOT NULL DEFAULT now());`);
  const inserted=await c.query(`INSERT INTO ${schema}.manifests(checksum,environment,payload) VALUES($1,'TEST',$2) ON CONFLICT DO NOTHING RETURNING checksum`,[checksum,JSON.stringify(plan)]);
  const existing=(await c.query(`SELECT payload FROM ${schema}.manifests WHERE checksum=$1`,[checksum])).rows[0].payload;if(digest(existing)!==digest(plan))throw Error('STAGED_MANIFEST_MISMATCH');
  await c.query('COMMIT');return {created:inserted.rowCount===1,checksum,productionApplied:false,rightsGranted:0};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
}
async function stage(config,options,plan){localGuard(config);rootGuard(options.storageRoot);if(typeof options.quiesce!=='function'||typeof options.resume!=='function')throw Error('WRITE_FREEZE_REQUIRED');try{await options.quiesce();return await persistStage(config,options,plan);}finally{await options.resume();}}
async function sourceArchive(client){const source=await load(client);return Object.fromEntries(tables.map(t=>[t,{rows:source[t].length,sha256:digest(source[t])}]));}
module.exports={build,stage,digest,tables,schema,sourceArchive};
