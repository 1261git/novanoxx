const deployment=require('./deployment-config.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const configDir=path.resolve(__dirname,'../문서파일');
function config(){if(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET)return {client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET};if(process.env.NNX_SANDBOX_REMOTE==='1')throw Error('sandbox_config');const files=fs.readdirSync(configDir).filter(n=>n.startsWith('client_secret_')&&n.endsWith('.json'));if(files.length!==1)throw Error('config');const c=JSON.parse(fs.readFileSync(path.join(configDir,files[0]),'utf8')).web;if(!c?.client_id||!c.client_secret||!c.redirect_uris?.includes('http://localhost:4317/api/auth/google/callback'))throw Error('config');return c;}
const pending=new Map();
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
function redirect(res,url,cookie){res.writeHead(303,{'Location':url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})});res.end();}
module.exports=async function google(req,res,name,db,session,json){
 if(!name.startsWith('/api/auth/google')&&name!=='/api/auth/providers')return false;
 if(name==='/api/auth/providers'){let ready=false;try{config();ready=true}catch{}json(res,200,{google:ready,naver:require('./naver-auth.cjs').ready(),kakao:require('./kakao-auth.cjs').ready()});return true;}
 const url=new URL(req.url,'http://localhost:4317');
 const base=deployment.base;
 if(name==='/api/auth/google/start'&&req.method==='GET'){
 try{const c=config();const next=url.searchParams.get('next')||'marketplace';const safe=/^assets\/\d+$/.test(next)?next:'marketplace';
 if(req.headers.host!==deployment.host){redirect(res,base+'/api/auth/google/start?next='+encodeURIComponent(safe));return true;}
 for(const [k,v] of pending)if(v.expires<Date.now())pending.delete(k);
 const state=crypto.randomBytes(32).toString('hex'),binding=crypto.randomBytes(32).toString('hex'),verifier=crypto.randomBytes(48).toString('base64url');pending.set(state,{binding:digest(binding),verifier,next:safe,expires:Date.now()+600000});
 const params=new URLSearchParams({client_id:c.client_id,redirect_uri:base+'/api/auth/google/callback',response_type:'code',scope:'openid email profile',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'});
 redirect(res,'https://accounts.google.com/o/oauth2/v2/auth?'+params,'nnx_oauth='+binding+'; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600');
 }catch{redirect(res,base+'/#/login?oauth_error=config');}return true;}
 if(name==='/api/auth/google/callback'&&req.method==='GET'){
 const state=url.searchParams.get('state');const p=pending.get(state);pending.delete(state);const binding=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('nnx_oauth='))?.slice(10)||'';
 const failure=code=>redirect(res,base+'/#/login?oauth_error='+code+(p?'&next='+encodeURIComponent(p.next):''),'nnx_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0');
 if(!p||p.expires<Date.now()||digest(binding)!==p.binding){failure('state');return true;}
 if(url.searchParams.get('error')){failure('cancelled');return true;}
 try{const c=config(),code=url.searchParams.get('code');if(!code)throw Error('code');
 const exchange=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,code,grant_type:'authorization_code',redirect_uri:base+'/api/auth/google/callback',code_verifier:p.verifier}),signal:AbortSignal.timeout(15000)});const tokens=await exchange.json();if(!exchange.ok||!tokens.access_token)throw Error('token');
 const response=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(15000)});const profile=await response.json();if(!response.ok||!profile.sub||!profile.email||profile.email_verified!==true)throw Error('profile');
 let u=db.prepare('SELECT u.id,u.name,u.email FROM users u JOIN identities i ON i.user_id=u.id WHERE i.provider=? AND i.subject=?').get('google',profile.sub);
 if(!u){if(db.prepare('SELECT id FROM users WHERE email=?').get(profile.email.toLowerCase())){failure('existing');return true;}
 u={id:crypto.randomUUID(),email:profile.email.toLowerCase(),name:String(profile.name||'Google 회원').slice(0,40)};
 db.exec('BEGIN');try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(u.id,u.email,u.name,crypto.randomBytes(16).toString('hex'),'');db.prepare('INSERT INTO identities VALUES(?,?,?)').run('google',profile.sub,u.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
 session(res,u,base+'/#/'+p.next,'google');return true;
 }catch{failure('failed');return true;}}
 json(res,404,{error:'지원하지 않는 인증 요청입니다.'});return true;
};
