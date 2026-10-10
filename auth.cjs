const deployment=require('./deployment-config.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const {DatabaseSync} = require('node:sqlite');
const derive = promisify(crypto.scrypt);
const dir = process.env.DATA_DIR || path.join(__dirname, '.private');
fs.mkdirSync(dir, {recursive:true});
const db = new DatabaseSync(path.join(dir,'accounts.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);');
db.exec('CREATE TABLE IF NOT EXISTS identities(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(provider,subject));');
db.exec('CREATE TABLE IF NOT EXISTS login_events(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,provider TEXT NOT NULL,occurred INTEGER NOT NULL);');
db.exec('CREATE TABLE IF NOT EXISTS creator_profiles(user_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,bio TEXT NOT NULL,country TEXT NOT NULL,language TEXT NOT NULL,portfolio TEXT NOT NULL,updated INTEGER NOT NULL);');
db.exec("CREATE TABLE IF NOT EXISTS account_status(user_id TEXT PRIMARY KEY,plan TEXT NOT NULL DEFAULT 'Free',neon_balance INTEGER NOT NULL DEFAULT 0 CHECK(neon_balance>=0));");
const google=require('./google-auth.cjs');
const naver=require('./naver-auth.cjs');
const kakao=require('./kakao-auth.cjs');
const creatorApi=require('./creator-api.cjs')(db,dir,user,json);
const neonPayments=require('./neon-payments.cjs')(db,user,json);
const attempts = new Map();
function json(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));}
function token(req){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('nnx_session='));return cookie?cookie.slice(12):'';}
function hashToken(value){return crypto.createHash('sha256').update(value).digest('hex');}
function user(req){const t=token(req);if(!t)return null;return db.prepare('SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(hashToken(t),Date.now())||null;}
function session(res,u,redirectTo,provider="email"){const t=crypto.randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hashToken(t),u.id,Date.now()+7*86400000);db.prepare('INSERT INTO login_events VALUES(?,?,?,?)').run(hashToken(t),u.id,provider,Date.now());const recentCookie='nnx_recent_login='+provider+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000';if(redirectTo){res.writeHead(303,{'Location':redirectTo,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':[recentCookie,`nnx_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`,'nnx_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0']});res.end();return;}json(res,200,{user:{id:u.id,name:u.name,email:u.email,loginProvider:provider},recentLogin:provider},{'Set-Cookie':[recentCookie,`nnx_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`]});}
async function body(req){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>8192)throw new Error('SIZE');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
module.exports=async function auth(req,res,name){
 if(!name.startsWith('/api/auth/')&&!name.startsWith('/api/catalog'))return false;
 try{
 if(await neonPayments(req,res,name))return true;
 if(await creatorApi(req,res,name))return true;
 if(await kakao(req,res,name,db,session,json,{user:user(req),sessionHash:hashToken(token(req))}))return true;
 if(await naver(req,res,name,db,session,json))return true;
 if(await google(req,res,name,db,session,json))return true;
 if(name==='/api/auth/me'&&req.method==='GET'){const u=user(req);const raw=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('nnx_recent_login='))?.split('=')[1];const recent=['google','naver','kakao','email'].includes(raw)?raw:null;if(u){db.prepare('INSERT OR IGNORE INTO account_status(user_id) VALUES(?)').run(u.id);const status=db.prepare('SELECT plan,neon_balance FROM account_status WHERE user_id=?').get(u.id);u.plan=status.plan;u.neonBalance=status.neon_balance;u.isAdmin=require('./admin-policy.cjs')(u);const event=db.prepare('SELECT provider,occurred FROM login_events WHERE token=?').get(hashToken(token(req)));u.loginProvider=event?.provider||null;u.lastLoginAt=event?.occurred||null;u.connectedProviders=db.prepare('SELECT provider FROM identities WHERE user_id=?').all(u.id).map(v=>v.provider);}json(res,200,{user:u,recentLogin:recent});return true;}
 if(name==='/api/auth/creator-profile'&&req.method==='GET'){const u=user(req);if(!u){json(res,401,{error:'로그인이 필요해요.'});return true;}json(res,200,{profile:db.prepare('SELECT display_name AS displayName,bio,country,language,portfolio,(SELECT updated FROM creator_avatars WHERE user_id=creator_profiles.user_id) AS avatarVersion FROM creator_profiles WHERE user_id=?').get(u.id)||null});return true;}
 if(req.method!=='POST'){json(res,405,{error:'지원하지 않는 요청입니다.'});return true;}
 const origin=req.headers.origin;if(origin!==deployment.base&&(process.env.NODE_ENV==='production'||origin!=='http://127.0.0.1:4317')){json(res,403,{error:'요청 출처를 확인할 수 없습니다.'});return true;}
 if(req.headers['content-type']?.split(';')[0]!=='application/json'){json(res,415,{error:'잘못된 요청 형식입니다.'});return true;}
 if(name==='/api/auth/logout'){db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(token(req)));json(res,200,{ok:true},{'Set-Cookie':'nnx_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return true;}
 if(name==='/api/auth/creator-profile'){const u=user(req);if(!u){json(res,401,{error:'로그인이 필요해요.'});return true;}const d=await body(req);const clean=k=>typeof d[k]==='string'?d[k].trim():'';const profile={displayName:clean('displayName'),bio:clean('bio'),country:clean('country'),language:clean('language'),portfolio:clean('portfolio')};let valid=profile.displayName.length>=1&&profile.displayName.length<=40&&profile.bio.length>=1&&profile.bio.length<=1000&&profile.country.length>=1&&profile.country.length<=60&&['ko','en','ko,en'].includes(profile.language)&&profile.portfolio.length<=500;if(profile.portfolio){try{valid=valid&&['https:','http:'].includes(new URL(profile.portfolio).protocol)}catch{valid=false}}if(!valid){json(res,400,{error:'프로필 입력값을 확인해주세요. 포트폴리오는 http 또는 https 주소로 입력해주세요.'});return true;}db.prepare('INSERT INTO creator_profiles VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,bio=excluded.bio,country=excluded.country,language=excluded.language,portfolio=excluded.portfolio,updated=excluded.updated').run(u.id,profile.displayName,profile.bio,profile.country,profile.language,profile.portfolio,Date.now());json(res,200,{profile});return true;}
 if(!['/api/auth/signup','/api/auth/login'].includes(name)){json(res,404,{error:'인증 메일 서비스는 아직 연결되지 않았습니다.'});return true;}
 const key=req.socket.remoteAddress;const now=Date.now();let a=attempts.get(key);if(!a||now-a.start>600000){a={start:now,count:0};attempts.set(key,a);}if(++a.count>30){json(res,429,{error:'요청이 많아요. 잠시 후 다시 시도해주세요.'});return true;}
 const data=await body(req);const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';const password=typeof data.password==='string'?data.password:'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<8||password.length>128){json(res,400,{error:'이메일과 비밀번호(8~128자)를 확인해주세요.'});return true;}
 if(name.endsWith('/signup')){const nameValue=typeof data.name==='string'?data.name.trim():'';if(!nameValue||nameValue.length>40){json(res,400,{error:'이름을 1~40자로 입력해주세요.'});return true;}
 const salt=crypto.randomBytes(16).toString('hex');const hashed=await derive(password,salt,64);const u={id:crypto.randomUUID(),email,name:nameValue};
 try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(u.id,email,nameValue,salt,hashed.toString('hex'));}catch(e){if(e.code?.includes('CONSTRAINT')||e.message.includes('UNIQUE')){json(res,409,{error:'가입할 수 없는 이메일입니다. 기존 계정이라면 로그인해주세요.'});return true;}throw e;}
 session(res,u);return true;}
 const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);const salt=u?.salt||'00000000000000000000000000000000';const calculated=await derive(password,salt,64);const expected=u?.hash?Buffer.from(u.hash,'hex'):Buffer.alloc(64);if(!crypto.timingSafeEqual(calculated,expected)||!u){json(res,401,{error:'이메일 또는 비밀번호가 올바르지 않아요.'});return true;}session(res,u);return true;
 }catch{json(res,400,{error:'요청을 처리하지 못했어요. 다시 시도해주세요.'});return true;}
};
