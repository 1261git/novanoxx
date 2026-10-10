const deployment=require('./deployment-config.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

function config(){if(process.env.KAKAO_CLIENT_ID&&process.env.KAKAO_CLIENT_SECRET)return {client_id:process.env.KAKAO_CLIENT_ID,client_secret:process.env.KAKAO_CLIENT_SECRET};const c=JSON.parse(fs.readFileSync(path.join(__dirname,'.private/kakao.json'),'utf8').replace(/^\uFEFF/,''));if(!c.client_id||!c.client_secret||/HERE|붙여넣기/.test(c.client_id)||/HERE|붙여넣기/.test(c.client_secret))throw Error('config');return c;}
module.exportsReady=()=>{try{config();return true}catch{return false}};
const pending=new Map();
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
function redirect(res,url,cookie){res.writeHead(303,{'Location':url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})});res.end();}
module.exports=async function kakao(req,res,name,db,session,json,context={}){
 if(!name.startsWith('/api/auth/kakao'))return false;
 const url=new URL(req.url,'http://localhost:4317');
 const base=deployment.base;
 const linking=name==='/api/auth/kakao/link'&&req.method==='POST';
 if(linking&&(req.headers.origin!==deployment.base||!context.user)){json(res,403,{error:'localhost에서 기존 계정으로 로그인한 뒤 연결해주세요.'});return true;}
 if(linking||name==='/api/auth/kakao/start'&&req.method==='GET'){
 try{const c=config();const next=url.searchParams.get('next')||'marketplace';const safe=/^assets\/\d+$/.test(next)?next:'marketplace';
 if(req.headers.host!==deployment.host){redirect(res,base+'/api/auth/kakao/start?next='+encodeURIComponent(safe));return true;}
 for(const [k,v] of pending)if(v.expires<Date.now())pending.delete(k);
 const state=crypto.randomBytes(32).toString('hex'),binding=crypto.randomBytes(32).toString('hex'),verifier=crypto.randomBytes(48).toString('base64url');pending.set(state,{binding:digest(binding),verifier,next:safe,linkUser:linking?context.user.id:null,sessionHash:linking?context.sessionHash:null,expires:Date.now()+600000});
 const params=new URLSearchParams({client_id:c.client_id,redirect_uri:base+'/api/auth/kakao/callback',response_type:'code',state,scope:'account_email'});
 const cookie='nnx_kakao_oauth='+binding+'; HttpOnly; SameSite=Lax; Path=/api/auth/kakao; Max-Age=600';
 if(linking)json(res,200,{url:'https://kauth.kakao.com/oauth/authorize?'+params},{'Set-Cookie':cookie});else redirect(res,'https://kauth.kakao.com/oauth/authorize?'+params,cookie);
 }catch{redirect(res,base+'/#/login?oauth_error=config');}return true;}
 if(name==='/api/auth/kakao/callback'&&req.method==='GET'){
 const state=url.searchParams.get('state');const p=pending.get(state);pending.delete(state);const binding=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('nnx_kakao_oauth='))?.slice('nnx_kakao_oauth='.length)||'';
 const failure=code=>redirect(res,base+'/#/login?oauth_error='+code+(p?'&next='+encodeURIComponent(p.next):''),'nnx_kakao_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/kakao; Max-Age=0');
 if(!p||p.expires<Date.now()||digest(binding)!==p.binding){failure('state');return true;}
 if(url.searchParams.get('error')){failure('cancelled');return true;}
 try{const c=config(),code=url.searchParams.get('code');if(!code)throw Error('code');
 const exchange=await fetch('https://kauth.kakao.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,code,grant_type:'authorization_code',redirect_uri:base+'/api/auth/kakao/callback',state}),signal:AbortSignal.timeout(15000)});const tokens=await exchange.json();if(!exchange.ok||!tokens.access_token){console.warn('Kakao token error',exchange.status,tokens.error_code||tokens.error);throw Error(tokens.error_code==='KOE237'?'rate_limit':'token');}
 const response=await fetch('https://kapi.kakao.com/v2/user/me',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok||!result.id)throw Error('profile');const account=result.kakao_account||{};const profile={id:String(result.id),email:account.is_email_valid&&account.is_email_verified?account.email:null,nickname:account.profile?.nickname};if(!profile.email){console.warn('Kakao email check:',JSON.stringify({hasEmail:!!account.email,needsAgreement:account.email_needs_agreement===true,valid:account.is_email_valid===true,verified:account.is_email_verified===true}));failure(account.email?'email_unverified':'email');return true;}
 let u=db.prepare('SELECT u.id,u.name,u.email FROM users u JOIN identities i ON i.user_id=u.id WHERE i.provider=? AND i.subject=?').get('kakao',profile.id);
 if(p.linkUser){
 const target=db.prepare('SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=? AND s.token=? AND s.expires>?').get(p.linkUser,p.sessionHash,Date.now());
 if(!target){failure('link_session');return true;}
 if(u&&u.id!==target.id){failure('link_used');return true;}
 if(!u)db.prepare('INSERT INTO identities VALUES(?,?,?)').run('kakao',profile.id,target.id);
 session(res,target,base+'/#/connections?linked=kakao','kakao');return true;
 }
 if(!u){if(db.prepare('SELECT id FROM users WHERE email=?').get(profile.email.toLowerCase())){failure('existing');return true;}
 u={id:crypto.randomUUID(),email:profile.email.toLowerCase(),name:String(profile.nickname||'카카오 회원').slice(0,40)};
 db.exec('BEGIN');try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(u.id,u.email,u.name,crypto.randomBytes(16).toString('hex'),'');db.prepare('INSERT INTO identities VALUES(?,?,?)').run('kakao',profile.id,u.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
 session(res,u,base+'/#/'+p.next,'kakao');return true;
 }catch(e){console.warn('Kakao callback failure',e.code||e.message);failure(e.message==='rate_limit'?'rate_limit':'failed');return true;}}
 json(res,404,{error:'지원하지 않는 인증 요청입니다.'});return true;
};

module.exports.ready=()=>{try{config();return true}catch{return false}};
