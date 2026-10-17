'use strict';
// Explicit additive archive. Original records and files are never deleted or renamed.
module.exports=async function({url=process.env.DATABASE_URL,service=process.env.RENDER_SERVICE_ID}={}){
 const u=new URL(url);if(service!=='srv-db5aqunlk1mc739bi0m0'||u.hostname!=='dpg-db5ps6navr4c739lilj0-a'||u.pathname!=='/novanoxx_jk4i')throw Error('OPERATING_ARCHIVE_BINDING_REQUIRED');
 const fs=require('node:fs'),crypto=require('node:crypto'),root='/data/.stage10-release182-20261018',snapshot=JSON.parse(fs.readFileSync(root+'/snapshot.json','utf8'));if(snapshot.database!=='novanoxx_jk4i'||!snapshot.archiveListVerified||Date.now()-Date.parse(snapshot.createdAt)>3600000||crypto.createHash('sha256').update(fs.readFileSync(root+'/database.dump')).digest('hex')!==snapshot.dumpSha256)throw Error('CURRENT_PRESERVATION_SNAPSHOT_REQUIRED');
 const c=new(require('pg').Client)({connectionString:url});await c.connect();
 try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await c.query('CREATE SCHEMA nnx_test_archive_v1');
  const assets=(await c.query("SELECT id,metadata FROM public.creator_assets WHERE metadata::jsonb->>'title' IN ('TEST - AI Prompt Starter','TEST - PostgreSQL Upload Verification') ORDER BY id")).rows;
  if(assets.length!==2)throw Error('EXPECTED_TEST_ASSETS_REVIEW_REQUIRED');
  await c.query('CREATE TABLE nnx_test_archive_v1.assets AS SELECT a.* FROM public.creator_assets a WHERE a.id=ANY($1::text[])',[assets.map(x=>x.id)]);
  for(const table of ['neon_test_wallet','neon_test_orders','neon_test_ledger','neon_test_grants','neon_topups','review_checkouts'])await c.query('CREATE TABLE nnx_test_archive_v1.'+table+' AS TABLE public.'+table);
  await c.query("CREATE TABLE nnx_test_archive_v1.manifest(version text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now(),source_rows_deleted boolean NOT NULL DEFAULT false);INSERT INTO nnx_test_archive_v1.manifest(version) VALUES('PRESERVED_TEST_ARCHIVE_182');");
  await c.query("CREATE TABLE IF NOT EXISTS public.asset_publication_policy(asset_id text PRIMARY KEY,visibility text NOT NULL CHECK(visibility IN ('PUBLIC','TEST_ARCHIVE')),reason text NOT NULL,updated bigint NOT NULL)");
  for(const a of assets)await c.query("INSERT INTO public.asset_publication_policy VALUES($1,'TEST_ARCHIVE','OWNER_REQUEST_20261018', $2) ON CONFLICT(asset_id) DO UPDATE SET visibility=excluded.visibility,reason=excluded.reason,updated=excluded.updated",[a.id,Date.now()]);
  await c.query('COMMIT');return {hiddenTestAssets:assets.length,archive:'nnx_test_archive_v1',sourceRowsDeleted:0,sourceFilesMoved:0};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
};
if(require.main===module)module.exports().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('TEST_ARCHIVE_NOT_APPLIED');process.exitCode=1;});
