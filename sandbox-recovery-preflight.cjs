// Read-only local TEST preflight for BOTH resources. Does not restore or create targets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Client}=require('pg');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function local(p){const base=fs.realpathSync(path.join(__dirname,'.sandbox-commerce')),root=fs.realpathSync(p);if(!root.startsWith(base+path.sep))throw Error('LOCAL_PREFLIGHT_REQUIRED');let current=base;for(const part of path.relative(base,path.resolve(p)).split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('PREFLIGHT_SYMLINK_DENIED');}return root;}
function anchor(file,expected){if(!/^[a-f0-9]{64}$/.test(expected||'')||sha(fs.readFileSync(file))!==expected)throw Error('RECOVERY_TRUST_REQUIRED');}
async function check({pgArchive,pgManifestSha,diskArchive,diskManifestSha,targetFiles,targetConfig}){
 const pgRoot=local(pgArchive),diskRoot=local(diskArchive),dest=local(targetFiles);
 for(const source of [pgRoot,diskRoot])if(dest===source||dest.startsWith(source+path.sep)||source.startsWith(dest+path.sep))throw Error('RECOVERY_TARGET_OVERLAP');
 for(const file of [path.join(pgRoot,'manifest.json'),path.join(pgRoot,'database.dump'),path.join(diskRoot,'manifest.json')])if(fs.lstatSync(file).isSymbolicLink())throw Error('PREFLIGHT_SYMLINK_DENIED');
 anchor(path.join(pgRoot,'manifest.json'),pgManifestSha);anchor(path.join(diskRoot,'manifest.json'),diskManifestSha);
 const pg=require('./sandbox-pg-snapshot.cjs').verify(pgRoot),disk=JSON.parse(fs.readFileSync(path.join(diskRoot,'manifest.json'),'utf8'));
 if(disk.version!==1||disk.scope!=='LOCAL_CONTEST_FIXTURE_WITH_JOURNAL_AND_QUARANTINE'||JSON.stringify(require('./sandbox-contest-storage-backup.cjs').files(path.join(diskRoot,'data')))!==JSON.stringify(disk.files))throw Error('RECOVERY_FILES_MISMATCH');
 if(fs.readdirSync(dest).length)throw Error('RECOVERY_FILES_TARGET_NOT_EMPTY');
 require('./sandbox-transition.cjs').guard(targetConfig);
 const c=new Client(targetConfig);await c.connect();try{
  await c.query('BEGIN READ ONLY');
  const objects=await c.query("SELECT 1 FROM pg_namespace WHERE left(nspname,3) <> 'pg_' AND nspname NOT IN ('public','information_schema') UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' UNION ALL SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('e','d','c') LIMIT 1");
  if(objects.rowCount)throw Error('RECOVERY_PG_TARGET_NOT_EMPTY');
  await c.query('COMMIT');
 }finally{await c.end();}
 return {status:'PASS',scope:'LOCAL_READ_ONLY_PAIR_PREFLIGHT',pgTables:Object.keys(pg.fingerprint).length,files:disk.files.length,limitations:['No restore performed','Target may change after check; restore must recheck emptiness','Roles/ACL and external recovery not verified']};
}
module.exports={check};
