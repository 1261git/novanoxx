// Separate Render entrypoint. Production server.cjs never imports this module.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function settings(env,localTest=false){
 if(env.NNX_SANDBOX_REMOTE!=='1')throw Error('SANDBOX_MODE_REQUIRED');
 const url=new URL(env.SANDBOX_PG_URL||'');const origin=new URL(env.SANDBOX_PUBLIC_ORIGIN||env.RENDER_EXTERNAL_URL||'');
 if(!['postgres:','postgresql:'].includes(url.protocol)||decodeURIComponent(url.username)!=='nnx_sandbox'||!/^\/nnx_sandbox_home_[a-z0-9_]+$/.test(url.pathname))throw Error('SANDBOX_DATABASE_REQUIRED');
 if(!localTest&&!/^dpg-[a-z0-9-]+(?:\.[a-z0-9.-]+)?$/.test(url.hostname))throw Error('SANDBOX_HOST_REQUIRED');
 if(localTest&&url.hostname!=='127.0.0.1')throw Error('LOCAL_TEST_ONLY');
 if(!localTest&&(origin.protocol!=='https:'||origin.hostname==='novanoxx.onrender.com'))throw Error('SEPARATE_HTTPS_ORIGIN_REQUIRED');
 if(origin.pathname!=='/'||origin.search||origin.hash)throw Error('ORIGIN_REQUIRED');
 if(typeof env.SANDBOX_ACCESS_PASSWORD!=='string'||env.SANDBOX_ACCESS_PASSWORD.length<32)throw Error('ACCESS_GATE_REQUIRED');
 if(!localTest&&url.hostname.includes('.'))url.searchParams.set('sslmode','verify-full');
 return {connection:url.href,origin:origin.origin,gate:env.SANDBOX_ACCESS_PASSWORD,config:{host:url.hostname,port:Number(url.port||5432),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:decodeURIComponent(url.pathname.slice(1)),ssl:!localTest&&url.hostname.includes('.')?{rejectUnauthorized:true}:undefined,externalSandbox:localTest?undefined:{host:url.hostname}}};
}
async function start({env=process.env,localTest=false,root}={}){
 const cfg=settings(env,localTest);const service=await require('./sandbox-postgres-commerce.cjs')({...cfg.config,initialize:true});
 // Fixture creation is explicit, idempotent and confined to the marked sandbox DB.
 const c=await service.pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(771102100)');for(const [id,price,mode]of [['prompt-pack',10,'MULTI'],['exclusive-pack',20,'EXCLUSIVE'],['large-pack',200,'MULTI']]){const added=await c.query('INSERT INTO assets(id,seller_id,price,sale_mode,status,contract_version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id',[id,'sandbox-creator',price,mode,'ACTIVE','sandbox-contract-v1']);if(added.rowCount){const bytes=Buffer.from('NovaNoxX cloud sandbox deliverable: '+id);await c.query('INSERT INTO files VALUES($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),id,'original',id+'.txt',bytes.length,crypto.createHash('sha256').update(bytes).digest('hex'),bytes]);}}await c.query('COMMIT');}catch(error){await c.query('ROLLBACK');await service.close();throw error;}finally{c.release();}
 const runtimeRoot=root||env.SANDBOX_RUNTIME_DIR||path.join(__dirname,'.sandbox-cloud-runtime');fs.mkdirSync(runtimeRoot,{recursive:true});
 const expected=crypto.createHash('sha256').update('novanoxx-test:'+cfg.gate).digest();
 const gate=(req,res)=>{if(req.method==='GET'&&req.url==='/api/health')return true;const header=req.headers.authorization||'';const value=header.startsWith('Basic ')?Buffer.from(header.slice(6),'base64').toString('utf8'):'';if(crypto.timingSafeEqual(expected,crypto.createHash('sha256').update(value).digest()))return true;res.writeHead(401,{'WWW-Authenticate':'Basic realm="NovaNoxX isolated test", charset="UTF-8"','Cache-Control':'no-store'});res.end('Isolated test access required');return false;};
 let app,timer,running=false;try{app=await require('./sandbox-home-server.cjs')({commerce:require('./sandbox-pg-adapter.cjs')(service,runtimeRoot),authDatabaseUrl:cfg.connection,publicOrigin:cfg.origin,bindHost:localTest?'127.0.0.1':'0.0.0.0',port:Number(env.PORT||10000),fresh:true,accessGate:gate});app.server.prependListener('request',(req,res)=>{const original=res.writeHead;res.writeHead=function(status,headers){if(headers?.['Set-Cookie']&&cfg.origin.startsWith('https:')){const secure=value=>value+'; Secure';headers['Set-Cookie']=Array.isArray(headers['Set-Cookie'])?headers['Set-Cookie'].map(secure):secure(headers['Set-Cookie']);}return original.call(this,status,headers);};});timer=setInterval(async()=>{if(running)return;running=true;try{await service.expire();}catch{console.error('Sandbox expiry check failed');}finally{running=false;}},1000);timer.unref();await service.expire();return {...app,service,close:async()=>{clearInterval(timer);while(running)await new Promise(resolve=>setTimeout(resolve,10));await app.close();}};}catch(error){clearInterval(timer);await service.close();throw error;}
}
module.exports={settings,start};
if(require.main===module)start().then(app=>{console.log('Isolated cloud sandbox ready');for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});}).catch(()=>{console.error('Cloud sandbox startup refused; check isolated configuration.');process.exitCode=1;});
