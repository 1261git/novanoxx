// Separate service ONLY; no source-service credentials accepted.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const forbidden=new Set(['srv-db5aqunlk1mc739bi0m0','srv-db6essivcj2c73fu6460']);
const e=process.env,service=e.RENDER_SERVICE_ID,id=e.NNX_DRILL_ID;
if(process.platform!=='linux'||!/^srv-[a-z0-9]+$/.test(service||'')||forbidden.has(service)||!/^\d{4}-\d{2}-\d{2}T/.test(e.NNX_DRILL_DECLARED_AT||'')||!/^[a-f0-9-]{36}$/.test(id||'')||fs.realpathSync('/data')!=='/data')throw Error('NEW_EXTERNAL_SERVICE_REQUIRED');
if(['DATABASE_URL','NNX_BACKUP_R2_SECRET_ACCESS_KEY','NNX_BACKUP_PUBLIC_KEY_BASE64','NNX_BACKUP_MONITOR_TOKEN','GOOGLE_CLIENT_SECRET','RESEND_API_KEY','SMTP_PASSWORD'].some(k=>e[k]))throw Error('SOURCE_OR_PROVIDER_SECRETS_REFUSED');
const root=path.join('/data','nnx-recovery-'+id);
if(process.getuid()===0){if(fs.existsSync(root)){const s=fs.lstatSync(root),b=JSON.parse(fs.readFileSync(path.join(root,'binding.json')));if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==1001||(s.mode&0o077)||b.service!==service||b.id!==id||b.sourceCommit!==require('./policy.cjs').SOURCE_COMMIT)throw Error('OWNED_RESTART_BINDING_REQUIRED');}else{fs.mkdirSync(root,{mode:0o700});fs.writeFileSync(path.join(root,'binding.json'),JSON.stringify({version:1,service,id,sourceCommit:require('./policy.cjs').SOURCE_COMMIT}),{flag:'wx',mode:0o600});fs.chownSync(root,1001,1001);fs.chownSync(path.join(root,'binding.json'),1001,1001);}
 const allowed=['PATH','LANG','PORT','RENDER_SERVICE_ID','NNX_DRILL_ID','NNX_DRILL_DECLARED_AT','NNX_DRILL_OPERATOR_TOKEN','NNX_DRILL_VIEW_TOKEN'];const safe=Object.fromEntries(allowed.filter(k=>e[k]!==undefined).map(k=>[k,e[k]]));safe.NNX_DRILL_ROOT=root;
 const child=spawn(process.execPath,[__filename],{uid:1001,gid:1001,env:safe,stdio:'inherit'});process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('SIGINT',()=>child.kill('SIGTERM'));child.on('exit',code=>process.exit(code===0?0:1));
}else{
 if(process.getuid()!==1001||e.NNX_DRILL_ROOT!==root)throw Error('RECOVERY_OWNER_REQUIRED');const binding=JSON.parse(fs.readFileSync(path.join(root,'binding.json')));if(binding.service!==service||binding.id!==id||fs.lstatSync(root).isSymbolicLink())throw Error('RECOVERY_BINDING_REQUIRED');
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:3072});
 (async()=>{const runtime=require('./restore-runtime.cjs'),options={bin:'/usr/lib/postgresql/18/bin',appRoot:path.resolve(__dirname,'../..')};let initialResult;
 if(fs.existsSync(path.join(root,'restored/report.json'))&&!fs.existsSync(path.join(root,'gateway-failure.json')))initialResult=await runtime.resume({root:path.join(root,'restored'),...options});
 const app=require('./gateway.cjs').gateway({root,operatorToken:e.NNX_DRILL_OPERATOR_TOKEN,viewToken:e.NNX_DRILL_VIEW_TOKEN,receiverPrivateKey:pair.privateKey,declaredAt:e.NNX_DRILL_DECLARED_AT,production:true,serviceId:service,initialResult,restore:args=>runtime.restore({...args,...options})});app.server.listen(Number(e.PORT||10000),'0.0.0.0',()=>console.log('NNX_ISOLATED_RECOVERY_GATEWAY_READY'));process.on('SIGTERM',()=>app.close().finally(()=>process.exit(0)));})().catch(()=>{console.error('NNX_ISOLATED_RECOVERY_RESTART_REFUSED_DATA_PRESERVED');process.exitCode=1;});
}
