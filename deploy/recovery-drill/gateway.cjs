const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const policy=require('./policy.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function gateway({root,operatorToken,viewToken,receiverPrivateKey,restore,declaredAt,serviceId=null,production=false,initialResult=null}){
 if(!/^[A-Za-z0-9_-]{43}$/.test(operatorToken||'')||!/^[A-Za-z0-9_-]{43}$/.test(viewToken||'')||operatorToken===viewToken)throw Error('INDEPENDENT_SCOPED_TOKENS_REQUIRED');
 const publicKey=crypto.createPublicKey(receiverPrivateKey).export({type:'spki',format:'pem'});let restoring=false,result=initialResult,failed=fs.existsSync(path.join(root,'gateway-failure.json')),viewSessionHash;
 const report=()=>({version:1,serviceId,sourceCommit:policy.SOURCE_COMMIT,sourcePacketId:policy.SOURCE_ID,sourceIndexAnchor:policy.SOURCE_SHA,status:result?'READY':failed?'FAILED_PRESERVED':restoring?'RESTORING':'AWAITING_CAPSULE',report:result?.report||null});
 const send=(res,code,value,extra={})=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',...extra});res.end(JSON.stringify(value));};
 async function body(req,max){const chunks=[];let n=0;for await(const b of req){n+=b.length;if(n>max)throw Error('BODY_LIMIT');chunks.push(b);}return Buffer.concat(chunks);}
 function viewAuthorized(req){if(policy.authorized(req.headers.authorization,viewToken))return true;const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('nnx_drill_view='));return cookie&&viewSessionHash&&sha(cookie.slice('nnx_drill_view='.length))===viewSessionHash;}
 const server=http.createServer(async(req,res)=>{let u;try{u=new URL(req.url,'http://localhost');}catch{return send(res,400,{error:'INVALID_PATH'});}
  if(u.pathname==='/_drill/liveness'&&req.method==='GET')return send(res,200,{alive:true});
  if(production&&(!Number.isFinite(Date.parse(declaredAt))||Date.now()>=Date.parse(declaredAt)+86400000))return send(res,410,{error:'DRILL_WINDOW_EXPIRED'});
  if(u.pathname==='/_drill/access'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none';form-action 'self';base-uri 'none';frame-ancestors 'none'",'X-Robots-Tag':'noindex, nofollow'});return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>NovaNoxX 복원 검증 전용</title><h1>복원 검증 전용 홈페이지</h1><p>검증용 접속 코드를 입력해 주세요.</p><form method="post"><label>접속 코드 <input type="password" name="code" maxlength="64" autocomplete="off" required></label><button>복원 홈페이지 확인</button></form></html>');}
  if(u.pathname==='/_drill/access'&&req.method==='POST'){try{const expected=(production?'https://':'http://')+req.headers.host;if(req.headers.origin!==expected||!String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded'))return send(res,403,{error:'ORIGIN_REQUIRED'});const b=await body(req,256),params=new URLSearchParams(b.toString());const ok=policy.authorized('Bearer '+params.get('code'),viewToken);params.delete('code');b.fill(0);if(!ok)return send(res,401,{error:'UNAUTHORIZED'});const session=crypto.randomBytes(32).toString('base64url');viewSessionHash=sha(session);res.writeHead(303,{Location:'/', 'Cache-Control':'no-store','Set-Cookie':'nnx_drill_view='+session+'; HttpOnly; SameSite=Strict; Path=/'+(production?'; Secure':'')});return res.end();}catch{return send(res,400,{error:'ACCESS_FAILED'});}}
  if(u.pathname.startsWith('/_drill/')){if(!policy.authorized(req.headers.authorization,operatorToken))return send(res,401,{error:'UNAUTHORIZED'});
   if(req.method==='GET'&&u.pathname==='/_drill/public-key')return send(res,200,{version:1,serviceId,sourceCommit:policy.SOURCE_COMMIT,sourcePacketId:policy.SOURCE_ID,sourceIndexAnchor:policy.SOURCE_SHA,publicKey,keyFingerprint:sha(publicKey)});
   if(req.method==='GET'&&u.pathname==='/_drill/status')return send(res,200,report());
   if(req.method==='POST'&&u.pathname==='/_drill/restore'){
    if(restoring||failed||result||fs.existsSync(path.join(root,'received')))return send(res,409,{error:'FRESH_TARGET_REQUIRED'});restoring=true;
    try{const raw=await body(req,policy.MAX_BODY);let value;try{value=JSON.parse(raw);}finally{raw.fill(0);}const checked=policy.capsuleCheck(value),received=path.join(root,'received');fs.mkdirSync(received,{mode:0o700});for(const f of checked.files)fs.writeFileSync(path.join(received,f.name),f.bytes,{flag:'wx',mode:0o600});const target=path.join(root,'restored');fs.mkdirSync(target,{mode:0o700});
     result=await restore({root:target,packageRoot:received,indexAnchor:checked.indexAnchor,privateKey:receiverPrivateKey});
     // The independent client must still validate the external HTTPS homepage.
     result.report.declaredAt=declaredAt;result.report.internalVerifiedAt=new Date().toISOString();fs.writeFileSync(path.join(root,'gateway-report.json'),JSON.stringify(report(),null,2),{flag:'wx',mode:0o600});return send(res,200,report());
    }catch(e){failed=true;fs.writeFileSync(path.join(root,'gateway-failure.json'),JSON.stringify({status:'FAILED_NEW_TARGET_PRESERVED',at:new Date().toISOString(),code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'RESTORE_FAILED'}),{flag:'wx',mode:0o600});return send(res,422,{error:'RESTORE_FAILED_NEW_TARGET_PRESERVED'});}finally{restoring=false;}
   }return send(res,405,{error:'METHOD_NOT_ALLOWED'});
  }
  if(!viewAuthorized(req))return send(res,401,{error:'DRILL_ACCESS_REQUIRED'});
  if(!policy.route(req.method,req.url))return send(res,403,{error:'DRILL_READ_ONLY_ROUTE_REQUIRED'});
  if(!result)return send(res,503,{error:'RESTORED_WEBSITE_NOT_READY'});
  const backend=new URL(req.url,result.origin);const proxy=http.request(backend,{method:req.method,headers:{Accept:req.headers.accept||'*/*','User-Agent':'NovaNoxX-Isolated-Recovery-Viewer',...(/^bytes=\d+-\d*$/.test(req.headers.range||'')?{Range:req.headers.range}:{})}},reply=>{const headers={...reply.headers,'cache-control':'no-store','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer'};delete headers['set-cookie'];delete headers['access-control-allow-origin'];res.writeHead(reply.statusCode,headers);reply.pipe(res);});proxy.setTimeout(10000,()=>proxy.destroy());proxy.on('error',()=>{if(!res.headersSent)send(res,502,{error:'OWNED_WEBSITE_UNAVAILABLE'});else res.destroy();});proxy.end();
 });server.requestTimeout=120000;server.headersTimeout=15000;
 return {server,report,async close(){await new Promise(resolve=>server.close(resolve));await result?.stop();}};
}
module.exports={gateway};
