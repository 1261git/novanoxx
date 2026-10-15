// Synthetic TEST rehearsal only; no production startup import and no LIVE entitlement.
const fs=require('node:fs'),path=require('node:path');
const mapping=require('./sandbox-legacy-mapping.cjs'),{guard}=require('./sandbox-transition.cjs');
const schema='nnx_agreed_original_preview';
function verifyMapping(m){const {checksum,...body}=m;if(checksum!==mapping.digest(body)||!m.readyForPreview||m.problems.length||m.environment!=='TEST'||m.liveActivationAllowed!==false)throw Error('VALIDATED_TEST_MAPPING_REQUIRED');}
function build(m,declarations){verifyMapping(m);if(!Array.isArray(declarations))throw Error('EXPLICIT_DECLARATIONS_REQUIRED');
 const orders=new Map(m.orders.map(o=>[o.legacyOrderId,o])),seen=new Set(),problems=[],candidates=[];
 for(const d of declarations){const fail=code=>problems.push({code,orderId:d.orderId??null});const o=orders.get(d.orderId);
  if(!o){fail('UNKNOWN_DECLARED_ORDER');continue;}if(seen.has(d.orderId)){fail('DUPLICATE_DECLARED_ORDER');continue;}seen.add(d.orderId);
  const a=m.assets.find(a=>a.assetId===o.assetId),right=m.rights.find(r=>r.legacyOrderId===o.legacyOrderId);
  if(d.action==='ARCHIVE_ONLY'){if(typeof d.reason!=='string'||!d.reason.trim())fail('ARCHIVE_REASON_REQUIRED');candidates.push({orderId:o.legacyOrderId,buyerId:o.buyerId,assetId:o.assetId,saleMode:a?.saleMode??null,state:'ARCHIVE_ONLY',files:[],evidence:null,grantAllowed:false,liveActivationAllowed:false});continue;}
  if(d.action!=='PIN_SYNTHETIC_AGREEMENT'||d.evidence!=='SYNTHETIC_TEST_FIXTURE'||d.environment!=='TEST'){fail('SYNTHETIC_EVIDENCE_REQUIRED');continue;}
  if(!a||o.catalogSource!=='CREATOR'){fail('STATIC_ORDER_CANNOT_GAIN_ORIGINALS');continue;}
  if(d.buyerId!==o.buyerId||d.assetId!==o.assetId||d.sellerId!==a.sellerId||d.saleMode!==a.saleMode)fail('DECLARATION_IDENTITY_MISMATCH');
  if(typeof d.contractVersion!=='string'||!d.contractVersion.startsWith('synthetic-')||!d.contractVersion.trim()||!d.recordedAt||!Number.isFinite(Date.parse(d.recordedAt)))fail('SYNTHETIC_CONTRACT_REQUIRED');
  if(!right){fail('LEGACY_ENTITLEMENT_REQUIRED');continue;}
  if(!Array.isArray(d.files)||!d.files.length){fail('EXPLICIT_AGREED_FILES_REQUIRED');continue;}
  const fileIds=new Set(),files=[];for(const f of d.files){const registered=m.files.find(x=>x.fileId===f.fileId);if(fileIds.has(f.fileId))fail('DUPLICATE_AGREED_FILE');fileIds.add(f.fileId);
   if(!registered||registered.assetId!==o.assetId||registered.ownerId!==a.sellerId||registered.kind!=='original'){fail('AGREED_ORIGINAL_IDENTITY_MISMATCH');continue;}
   if(f.sha256!==registered.sha256||f.size!==registered.size)fail('AGREED_BYTES_MISMATCH');files.push({fileId:registered.fileId,key:registered.key,size:registered.size,sha256:registered.sha256});
  }
  candidates.push({orderId:o.legacyOrderId,buyerId:o.buyerId,assetId:o.assetId,sellerId:a.sellerId,saleMode:a.saleMode,state:right.legacyStatus==='PAID'?'TEST_ACTIVE_CANDIDATE':'REVOKED_CANDIDATE',legacyStatus:right.legacyStatus,contractVersion:d.contractVersion,recordedAt:d.recordedAt,evidence:'SYNTHETIC_TEST_FIXTURE',files:files.sort((a,b)=>a.fileId.localeCompare(b.fileId)),grantAllowed:false,liveActivationAllowed:false});
 }
 for(const o of m.orders)if(!seen.has(o.legacyOrderId))problems.push({code:'ORDER_DECISION_MISSING',orderId:o.legacyOrderId});
 for(const a of m.assets.filter(a=>a.saleMode==='EXCLUSIVE'))if(candidates.filter(c=>c.assetId===a.assetId&&c.state==='TEST_ACTIVE_CANDIDATE').length>1)problems.push({code:'EXCLUSIVE_CANDIDATE_CONFLICT',assetId:a.assetId});
 const body={format:'NNX_AGREED_ORIGINAL_PLAN_V1',environment:'TEST',mappingChecksum:m.checksum,sourceDatabase:m.sourceDatabase,candidates:candidates.sort((a,b)=>a.orderId.localeCompare(b.orderId)),problems,ready:problems.length===0,productionApplied:false,rightsGranted:0};return {...body,checksum:mapping.digest(body)};
}
function local(config,options){guard(config);if(config.connectionString||config.service||!Number.isInteger(config.port)||options.fixtureExecution!=='SYNTHETIC_TEST_ONLY')throw Error('SYNTHETIC_LOCAL_ONLY');}
async function lockSource(c){await c.query('LOCK TABLE public.sandbox_environment IN SHARE MODE');for(const t of mapping.tables)await c.query('LOCK TABLE public.'+t+' IN SHARE MODE');if((await c.query('SELECT marker FROM sandbox_environment')).rows[0]?.marker!=='NNX_REAL_PG_SANDBOX_V1')throw Error('SANDBOX_REQUIRED');}
async function stage(config,options,m,declarations,plan){local(config,options);verifyMapping(m);const {checksum,...body}=plan;if(checksum!==mapping.digest(body)||build(m,declarations).checksum!==checksum)throw Error('AGREEMENT_PLAN_TAMPERED');if(!plan.ready)throw Error('AGREEMENT_PLAN_NOT_READY');if(typeof options.quiesce!=='function'||typeof options.resume!=='function')throw Error('WRITE_FREEZE_REQUIRED');
 let c;try{await options.quiesce();c=new(require('pg').Client)(config);await c.connect();await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(771102107)');await lockSource(c);
  if((await mapping.build(config,options)).checksum!==m.checksum)throw Error('SOURCE_CHANGED_SINCE_AGREEMENT');
  const stored=(await c.query('SELECT payload FROM '+mapping.schema+'.manifests WHERE checksum=$1',[m.checksum])).rows[0];if(!stored||mapping.digest(stored.payload)!==mapping.digest(m))throw Error('STAGED_MAPPING_REQUIRED');
  const exists=(await c.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount;if(exists&&!(await c.query("SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name='plans'",[schema])).rowCount)throw Error('UNKNOWN_AGREEMENT_SCHEMA');
  await c.query(`CREATE SCHEMA IF NOT EXISTS ${schema};CREATE TABLE IF NOT EXISTS ${schema}.plans(checksum TEXT PRIMARY KEY,mapping_checksum TEXT NOT NULL,payload JSONB NOT NULL,environment TEXT NOT NULL CHECK(environment='TEST'));
  CREATE TABLE IF NOT EXISTS ${schema}.candidates(order_id TEXT PRIMARY KEY,plan_checksum TEXT NOT NULL REFERENCES ${schema}.plans(checksum),mapping_checksum TEXT NOT NULL,asset_id TEXT,state TEXT NOT NULL CHECK(state IN ('ARCHIVE_ONLY','TEST_ACTIVE_CANDIDATE','REVOKED_CANDIDATE')),sale_mode TEXT CHECK(sale_mode IN ('MULTI','EXCLUSIVE')),payload JSONB NOT NULL,grant_allowed BOOLEAN NOT NULL CHECK(grant_allowed=false));
  CREATE UNIQUE INDEX IF NOT EXISTS one_exclusive_candidate ON ${schema}.candidates(asset_id) WHERE sale_mode='EXCLUSIVE' AND state='TEST_ACTIVE_CANDIDATE';`);
  const added=await c.query(`INSERT INTO ${schema}.plans VALUES($1,$2,$3,'TEST') ON CONFLICT DO NOTHING RETURNING checksum`,[checksum,m.checksum,JSON.stringify(plan)]);
  if(mapping.digest((await c.query(`SELECT payload FROM ${schema}.plans WHERE checksum=$1`,[checksum])).rows[0].payload)!==mapping.digest(plan))throw Error('STORED_PLAN_MISMATCH');
  for(const candidate of plan.candidates){const prior=(await c.query(`SELECT payload FROM ${schema}.candidates WHERE order_id=$1`,[candidate.orderId])).rows[0];if(prior){if(mapping.digest(prior.payload)!==mapping.digest(candidate))throw Error('ORDER_CANDIDATE_CONFLICT');continue;}
   await c.query(`INSERT INTO ${schema}.candidates VALUES($1,$2,$3,$4,$5,$6,$7,false)`,[candidate.orderId,checksum,m.checksum,candidate.assetId,candidate.state,candidate.saleMode,JSON.stringify(candidate)]);
  }
  await c.query('COMMIT');return {created:added.rowCount===1,rightsGranted:0,productionApplied:false};
 }catch(e){if(c)await c.query('ROLLBACK');throw e;}finally{if(c)await c.end();await options.resume();}
}
// Test bytes only. Never wire this to the public homepage or operational original API.
async function readFixture(config,options,{orderId,buyerId,fileId}){local(config,options);const c=new(require('pg').Client)(config);await c.connect();try{await c.query('BEGIN');await lockSource(c);
 const row=(await c.query(`SELECT mapping_checksum,plan_checksum,payload FROM ${schema}.candidates WHERE order_id=$1`,[orderId])).rows[0],candidate=row?.payload,file=candidate?.files.find(f=>f.fileId===fileId);
 if(!candidate||candidate.buyerId!==buyerId||candidate.state!=='TEST_ACTIVE_CANDIDATE'||candidate.evidence!=='SYNTHETIC_TEST_FIXTURE'||!file)throw Error('FIXTURE_ACCESS_DENIED');
 const stored=(await c.query(`SELECT payload FROM ${schema}.plans WHERE checksum=$1`,[row.plan_checksum])).rows[0]?.payload;if(!stored)throw Error('STORED_PLAN_MISMATCH');const {checksum,...body}=stored,member=stored.candidates.find(x=>x.orderId===orderId);if(checksum!==row.plan_checksum||stored.mappingChecksum!==row.mapping_checksum||checksum!==mapping.digest(body)||!member||mapping.digest(member)!==mapping.digest(candidate))throw Error('STORED_PLAN_MISMATCH');
 if(options.readyRoot){const disk=require('./sandbox-file-db-backup.cjs');await disk.validateReady(options.readyRoot,config);if(fs.realpathSync(options.storageRoot)!==fs.realpathSync(path.join(options.readyRoot,'storage')))throw Error('RESTORE_STORAGE_PAIR_MISMATCH');
  const pinned=(await c.query('SELECT payload FROM '+mapping.schema+'.manifests WHERE checksum=$1',[row.mapping_checksum])).rows[0]?.payload;if(!pinned)throw Error('STAGED_MAPPING_REQUIRED');verifyMapping(pinned);if(mapping.digest(await mapping.sourceArchive(c))!==mapping.digest(pinned.archive)||mapping.digest(await disk.inventory(options.storageRoot))!==pinned.inventoryDigest)throw Error('SOURCE_CHANGED_SINCE_AGREEMENT');
 }else if((await mapping.build(config,options)).checksum!==row.mapping_checksum)throw Error('SOURCE_CHANGED_SINCE_AGREEMENT');
 const right=(await c.query("SELECT 1 FROM original_entitlements WHERE order_id=$1 AND user_id=$2 AND asset_id=$3 AND status='PAID'",[orderId,buyerId,candidate.assetId])).rowCount;if(!right)throw Error('FIXTURE_ACCESS_DENIED');
 const bytes=fs.readFileSync(path.join(options.storageRoot,file.key));if(bytes.length!==file.size||require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('AGREED_FILE_CHANGED');
 await c.query('COMMIT');return bytes;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}}
module.exports={build,stage,readFixture,schema};
