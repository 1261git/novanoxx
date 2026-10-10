const deployment=require('./deployment-config.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

function config(){if(process.env.NAVER_CLIENT_ID&&process.env.NAVER_CLIENT_SECRET)return {client_id:process.env.NAVER_CLIENT_ID,client_secret:process.env.NAVER_CLIENT_SECRET};const c=JSON.parse(fs.readFileSync(path.join(__dirname,'.private/naver.json'),'utf8').replace(/^\uFEFF/,''));if(!c.client_id||!c.client_secret||c.client_id.includes('붙여넣기')||c.client_secret.includes('붙여넣기'))throw Error('config');return c;}
module.exportsReady=()=>{try{config();return true}catch{return false}};
const pending=new Map();
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
function redirect(res,url,cookie){res.writeHead(303,{'Location':url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})});res.end();}
module.exports=async function naver(req,res,name,db,session,json){
 if(!name.startsWith('/api/auth/naver'))return false;
 const url=new URL(req.url,'http://localhost:4317');
 const base=deployment.base;
 if(name==='/api/auth/naver/start'&&req.method==='GET'){
 try{const c=config();const next=url.searchParams.get('next')||'marketplace';const safe=/^assets\/\d+$/.test(next)?next:'marketplace';
 if(req.headers.host!==deployment.host){redirect(res,base+'/api/auth/naver/start?next='+encodeURIComponent(safe));return true;}
 for(const [k,v] of pending)if(v.expires<Date.now())pending.delete(k);
 const state=crypto.randomBytes(32).toString('hex'),binding=crypto.randomBytes(32).toString('hex'),verifier=crypto.randomBytes(48).toString('base64url');pending.set(state,{binding:digest(binding),verifier,next:safe,expires:Date.now()+600000});
 const params=new URLSearchParams({client_id:c.client_id,redirect_uri:base+'/api/auth/naver/callback',response_type:'code',state});
 redirect(res,'https://nid.naver.com/oauth2.0/authorize?'+params,'nnx_naver_oauth='+binding+'; HttpOnly; SameSite=Lax; Path=/api/auth/naver; Max-Age=600');
 }catch{redirect(res,base+'/#/login?oauth_error=config');}return true;}
 if(name==='/api/auth/naver/callback'&&req.method==='GET'){
 const state=url.searchParams.get('state');const p=pending.get(state);pending.delete(state);const binding=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('nnx_naver_oauth='))?.slice(16)||'';
 const failure=code=>redirect(res,base+'/#/login?oauth_error='+code+(p?'&next='+encodeURIComponent(p.next):''),'nnx_naver_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/naver; Max-Age=0');
 if(!p||p.expires<Date.now()||digest(binding)!==p.binding){failure('state');return true;}
 if(url.searchParams.get('error')){failure('cancelled');return true;}
 try{const c=config(),code=url.searchParams.get('code');if(!code)throw Error('code');
 const exchange=await fetch('https://nid.naver.com/oauth2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,code,grant_type:'authorization_code',redirect_uri:base+'/api/auth/naver/callback',state}),signal:AbortSignal.timeout(15000)});const tokens=await exchange.json();if(!exchange.ok||!tokens.access_token)throw Error('token');
 const response=await fetch('https://openapi.naver.com/v1/nid/me',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(15000)});const result=await response.json();const profile=result.response;if(!response.ok||result.resultcode!=='00'||!profile?.id||!profile.email)throw Error('profile');
 let u=db.prepare('SELECT u.id,u.name,u.email FROM users u JOIN identities i ON i.user_id=u.id WHERE i.provider=? AND i.subject=?').get('naver',profile.id);
 if(!u){if(db.prepare('SELECT id FROM users WHERE email=?').get(profile.email.toLowerCase())){failure('existing');return true;}
 u={id:crypto.randomUUID(),email:profile.email.toLowerCase(),name:String(profile.nickname||'네이버 회원').slice(0,40)};
 db.exec('BEGIN');try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(u.id,u.email,u.name,crypto.randomBytes(16).toString('hex'),'');db.prepare('INSERT INTO identities VALUES(?,?,?)').run('naver',profile.id,u.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
 session(res,u,base+'/#/'+p.next,'naver');return true;
 }catch{failure('failed');return true;}}
 json(res,404,{error:'지원하지 않는 인증 요청입니다.'});return true;
};

module.exports.ready=()=>{try{config();return true}catch{return false}};
