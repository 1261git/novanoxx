// A fresh child owns capture/packaging/transfer. Main server is the only writer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const policy=require('./backup-automation-policy.cjs'),storeModule=require('./backup-automation-store.cjs');
function treeBytes(root){let total=0;for(const n of fs.readdirSync(root)){const p=path.join(root,n),s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('BACKUP_VAULT_SYMLINK');if(s.isDirectory())total+=treeBytes(p);else if(s.isFile())total+=s.size;else throw Error('BACKUP_VAULT_SPECIAL_FILE');}return total;}
async function execute({env,id,cfg,vault,root,temp,capture,packageBackup,transportFactory,sdk,now=Date.now}){
 const store=storeModule.open(root),record=store.read().runs.find(r=>r.id===id);
 if(!record||record.status!=='STARTED'||record.day!==policy.slot(now()).day)throw Error('AUTOMATION_JOB_RECORD_REQUIRED');
 const key=crypto.randomBytes(32),keyFile=path.join(temp,'ephemeral-aes.bin');let transport;
 try{
  if(treeBytes(vault)>policy.LIMITS.localBytes)throw Error('AUTOMATION_LOCAL_STORAGE_LIMIT');
  fs.writeFileSync(keyFile,key,{flag:'wx',mode:0o600});
  const c=await (capture||require('./operating-readonly-backup.cjs').capture)({...env,NNX_PRODUCTION_BACKUP_READ_ONLY:'1',NNX_WRITERS_FROZEN_CONFIRMED:'1',NNX_EXPECTED_MAIN_USER:decodeURIComponent(new URL(env.DATABASE_URL).username),NNX_BACKUP_KEY_FILE:keyFile,NNX_BACKUP_CAPTURE_MAX_BYTES:String(policy.LIMITS.bundleBytes)});
  store.update(id,r=>{r.status='CAPTURED';r.captureRoot=c.root;});
  const needed=treeBytes(c.root),space=fs.statfsSync(vault);if(Number(space.bavail)*Number(space.bsize)<needed+policy.LIMITS.minimumFreeBytes||treeBytes(vault)+needed>policy.LIMITS.localBytes)throw Error('AUTOMATION_LOCAL_STORAGE_LIMIT');
  const destination=path.join(root,'packet-'+id);fs.mkdirSync(destination,{mode:0o700});
  const p=await (packageBackup||require('./backup-offsite-package.cjs').createPackage)({captureRoot:c.root,captureAnchor:c.anchor,key,recipientPublicKey:cfg.publicKey,destination,scope:c.status,automationJournal:storeModule.snapshot(store.read())});
  fs.writeFileSync(keyFile,Buffer.alloc(32),{flag:'r+'});key.fill(0);
  const bytes=treeBytes(destination),objects=fs.readdirSync(destination).length,request=policy.reservation({bytes,objects});
  store.update(id,(r,s)=>{policy.reserve(s,r,request,now());r.status='TRANSFERRING';r.packetRoot=destination;r.packetId=p.id;r.indexAnchor=p.indexAnchor;});
  transport=(transportFactory||require('./backup-r2-transport.cjs').createTransport)({sdk:sdk||require('@aws-sdk/client-s3'),allowOperating:true,namespace:'automated-v1/'+record.kind,maximumOperatingBytes:policy.LIMITS.bundleBytes,credentials:{bucket:'novanoxx-private-backups',endpoint:'https://26fa9902e2359e7c8504081c66e34021.r2.cloudflarestorage.com',accessKeyId:env.NNX_BACKUP_R2_ACCESS_KEY_ID,secretAccessKey:env.NNX_BACKUP_R2_SECRET_ACCESS_KEY}});
  const receipt=await transport.publishPackage({packageRoot:destination,indexAnchor:p.indexAnchor});
  if(receipt.id!==p.id||receipt.indexAnchor!==p.indexAnchor||receipt.encryptedBytes!==bytes)throw Error('AUTOMATION_REMOTE_RECEIPT_MISMATCH');
  store.update(id,r=>{r.status='SUCCEEDED';r.finishedAt=new Date(now()).toISOString();r.prefix=receipt.prefix;r.objects=receipt.objects;r.encryptedBytes=receipt.encryptedBytes;});
 }catch(e){const code=String(e.code||e.message||'BACKUP_FAILED'),known=new Set(['AUTOMATION_LOCAL_STORAGE_LIMIT','BACKUP_SPACE_LOW','BACKUP_CAPTURE_POLICY_LIMIT','UNCONTROLLED_WRITER_PRESENT','DATABASE_CLIENT_NOT_QUIESCENT','UNPROVEN_DATABASE_CLIENT','BACKUP_AUTOMATION_MONTH_BUDGET_LIMIT','BACKUP_AUTOMATION_REMOTE_STORAGE_LIMIT','BACKUP_AUTOMATION_PACKAGE_LIMIT','BACKUP_LEASE_LOST','OPERATING_SOURCE_CHANGED','OPERATING_DUMP_FAILED','REMOTE_OBJECT_MISMATCH','LOCAL_PACKAGE_MISMATCH','PG18_CLIENT_NOT_INSTALLED','PG18_CLIENT_VERSION_REQUIRED']);store.update(id,r=>{r.status='FAILED';r.finishedAt=new Date(now()).toISOString();r.errorCode=known.has(code)?code:'BACKUP_JOB_FAILED';});throw Error('BACKUP_JOB_FAILED');}
 finally{key.fill(0);transport?.close();if(fs.existsSync(keyFile))fs.writeFileSync(keyFile,Buffer.alloc(32),{flag:'r+'});}
}
async function run({env=process.env,id}={}){
 const cfg=policy.config(env);if(!cfg.enabled||!id)throw Error('AUTOMATION_JOB_BINDING_REQUIRED');
 if(process.platform!=='linux'||env.RENDER_SERVICE_ID!==policy.SERVICE||env.NNX_BACKUP_EXPECTED_INSTANCE!==env.RENDER_INSTANCE_ID)throw Error('AUTOMATION_JOB_RUNTIME_REQUIRED');
 const vault='/data/.private-nnx-backups',root=path.join(vault,'automation-v1'),temp=fs.realpathSync(env.NNX_BACKUP_JOB_TEMP||'');
 if(!/^\/tmp\/nnx-backup-automation-[A-Za-z0-9]+$/.test(temp)||fs.statSync(temp).mode&0o077)throw Error('AUTOMATION_JOB_PRIVATE_TEMP_REQUIRED');
 return execute({env,id,cfg,vault,root,temp});
}
module.exports={run,execute,treeBytes};
if(require.main===module)run({id:process.argv[2]}).catch(()=>{process.exitCode=1;});
