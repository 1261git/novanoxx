'use strict';
// Explicit provisioning inside the existing TEST instance. No operating resource is accepted.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Client}=require('pg');
async function provision(env=process.env){
 const host='dpg-db6esfivcj2c73fu4re0-a',source='nnx_sandbox_home_20261012',target='nnx_review_20261018',dir='/var/data/nnx-review-20261018',origin='https://novanoxx-sandbox-staging.onrender.com';
 if(env.RENDER_SERVICE_ID!=='srv-db6essivcj2c73fu6460')throw Error('EXISTING_TEST_SERVICE_REQUIRED');
 const url=new URL(env.SANDBOX_PG_URL||'');if(url.hostname!==host||url.pathname!=='/'+source||url.search||url.hash)throw Error('EXISTING_TEST_DATABASE_REQUIRED');
 if(fs.realpathSync('/var/data')!=='/var/data'||fs.existsSync(dir))throw Error('NEW_PRIVATE_REVIEW_DIRECTORY_REQUIRED');
 const stat=fs.statfsSync('/var/data'),free=Number(stat.bavail)*Number(stat.bsize);if(free<800*1024*1024)throw Error('EXISTING_CAPACITY_INSUFFICIENT');
 const old=new Client({connectionString:url.href,connectionTimeoutMillis:8000,statement_timeout:8000});let next;
 try{
  await old.connect();await old.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tables=(await old.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename")).rows,summary=[];
  const quote=s=>'"'+s.replaceAll('"','""')+'"';
  for(const table of tables){const r=(await old.query('SELECT COUNT(*) count,md5(COALESCE(string_agg(digest,\'\' ORDER BY digest),\'\')) digest FROM (SELECT md5(row_to_json(t)::text) digest FROM '+quote(table.schemaname)+'.'+quote(table.tablename)+' t) s')).rows[0];summary.push({schema:table.schemaname,table:table.tablename,count:Number(r.count),digest:r.digest});}
  const size=Number((await old.query('SELECT pg_database_size(current_database()) bytes')).rows[0].bytes);await old.query('ROLLBACK');
  if(size>64*1024*1024)throw Error('SOURCE_SIZE_REVIEW_REQUIRED');
  if((await old.query('SELECT 1 FROM pg_database WHERE datname=$1',[target])).rows.length)throw Error('REVIEW_DATABASE_ALREADY_EXISTS');
  await old.query('CREATE DATABASE '+quote(target));
  url.pathname='/'+target;next=new Client({connectionString:url.href,connectionTimeoutMillis:8000,statement_timeout:8000});await next.connect();
  await next.query('CREATE TABLE nnx_review_environment(id bigint PRIMARY KEY,marker text NOT NULL,origin text NOT NULL)');await next.query('INSERT INTO nnx_review_environment VALUES(1,$1,$2)',['NNX_ISOLATED_REVIEW_V1',origin]);
  fs.mkdirSync(dir,{mode:0o700});fs.writeFileSync(path.join(dir,'review-environment.json'),JSON.stringify({marker:'NNX_ISOLATED_REVIEW_V1',origin,database:target,host}),{flag:'wx',mode:0o600});
  const result={sourceDatabase:source,sourceDatabaseBytes:size,sourceTables:summary,sourceRowsModified:false,originalFilesModified:false,reviewDatabase:target,reviewDirectory:dir,newPaidInstances:0,diskFreeBytes:free,createdAt:new Date().toISOString()};
  fs.writeFileSync(path.join(dir,'before-review-source-metadata.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  return result;
 }finally{await next?.end();await old.end();}
}
module.exports=provision;
if(require.main===module){if(process.argv[2]!=='--create-empty-review-target')throw Error('EXPLICIT_TARGET_PROVISIONING_REQUIRED');provision().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.code||error.message);process.exitCode=1;});}
