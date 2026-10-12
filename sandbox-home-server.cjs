// Local-only integration: existing homepage/auth, separate account and commerce stores.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const create=require('./sandbox-commerce.cjs');
async function start(options={}){
 if(require.cache[require.resolve('./auth.cjs')])throw Error('AUTH_ALREADY_INITIALIZED');
 const pointer=path.join(__dirname,'.sandbox-commerce','home-current.json');
 const saved=options.resumeRoot||(!options.fresh&&fs.existsSync(pointer)?JSON.parse(fs.readFileSync(pointer,'utf8')).root:null);
 const commerce=options.commerce||create(saved?{resumeRoot:saved}:{});
 const definitions=[['prompt-pack',91001,'AI 프롬프트 스타터',10,'MULTI','Prompt'],['exclusive-pack',91002,'독점 AI 에이전트 패키지',20,'EXCLUSIVE','AI Agent'],['large-pack',91003,'확장 워크플로우 패키지',200,'MULTI','Skill & Workflow']];
 if(!saved&&!options.commerce){for(const [id,, ,price,saleMode]of definitions)commerce.addAsset({id,sellerId:'sandbox-creator',price,saleMode,files:[{name:id+'.txt',data:Buffer.from('NovaNoxX sandbox deliverable: '+id)}]});if(!options.fresh)fs.writeFileSync(pointer,JSON.stringify({root:commerce.root}),{flag:'wx'});}
 const accountDir=path.join(commerce.root,'accounts');fs.mkdirSync(accountDir,{recursive:true});
 // Override before loading the existing auth module. Never inherit remote DB or OAuth/PG secrets.
 for(const key of Object.keys(process.env))if(/^(DATABASE_|DATA_DIR$|MIGRATE_SQLITE$|PUBLIC_BASE_URL$|RENDER_EXTERNAL_URL$|TOSS_|GOOGLE_|NAVER_|KAKAO_)/.test(key))delete process.env[key];
 if(options.googleOAuth){process.env.GOOGLE_CLIENT_ID=options.googleOAuth.clientId;process.env.GOOGLE_CLIENT_SECRET=options.googleOAuth.clientSecret;}
 process.env.DATABASE_BACKEND=options.authDatabaseUrl?'postgres':'sqlite';if(options.authDatabaseUrl)process.env.DATABASE_URL=options.authDatabaseUrl;process.env.DATA_DIR=accountDir;process.env.NODE_ENV=options.publicOrigin?.startsWith('https:')?'production':'development';
 const sessions=new Map();let auth,accounts,origin,paused=false,inflight=0;
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 function currentUser(req){const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('nnx_session='))?.slice(12);if(!raw)return null;return accounts.prepare('SELECT u.id,u.name FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(crypto.createHash('sha256').update(raw).digest('hex'),Date.now())||null;}
 async function ensureWallet(id){if(!await commerce.db.prepare('SELECT user_id FROM wallets WHERE user_id=?').get(id)){try{await commerce.addWallet(id,100);}catch(error){if(!await commerce.db.prepare('SELECT user_id FROM wallets WHERE user_id=?').get(id))throw error;}}}
 async function catalog(){return Promise.all(definitions.map(async([id,publicId,title,,,subcategory])=>{const a=await commerce.db.prepare('SELECT * FROM assets WHERE id=?').get(id);return {id:publicId,title:'SANDBOX · '+title,creator:'NovaNoxX 격리 크리에이터',desc:'가상 파일과 잔액으로 구매 흐름을 검증하는 격리 에셋입니다. 실제 판매·납품이 아닙니다.',cat:'AI_TOOLS',subcategory,purpose:'BRANDING',price:a.price,fit:false,saleMode:a.sale_mode,sold:a.status==='SOLD',spec:'가상 TXT 파일 · 추가 작업 없음',contract:{mode:a.sale_mode,version:a.contract_version},imgUrl:'/assets/novanoxx-brand-logo.png'};}));}
 async function state(u){await ensureWallet(u.id);if(!sessions.has(u.id))sessions.set(u.id,crypto.randomBytes(24).toString('hex'));const assets=await Promise.all(definitions.map(async([id,publicId,title])=>{const a=await commerce.db.prepare('SELECT * FROM assets WHERE id=?').get(id);const reservation=a.reserved_by===u.id?{token:a.reservation_token,expires:a.reserved_until}:null;delete a.reserved_by;delete a.reservation_token;return {...a,reservation,publicId,title,files:await commerce.db.prepare("SELECT id,name,size FROM files WHERE asset_id=? AND kind='original'").all(id)};}));const rows=await commerce.db.prepare('SELECT id FROM orders WHERE buyer_id=? ORDER BY created DESC,id').all(u.id);const orders=await Promise.all(rows.map(async row=>{const o=await commerce.getOrder(u.id,row.id);return {...o,title:definitions.find(d=>d[0]===o.asset_id)?.[2]};}));return {environment:'SANDBOX',backend:commerce.backend||'pglite',serverTime:commerce.now?await commerce.now():Date.now(),csrf:sessions.get(u.id),refundWorkflow:!!options.refundWorkflow,refundAdmin:options.refundWorkflow?await options.refundWorkflow.isAdmin(u.id):false,refundRequests:options.refundWorkflow?await options.refundWorkflow.listBuyer(u.id):[],balance:(await commerce.db.prepare('SELECT balance FROM wallets WHERE user_id=?').get(u.id)).balance,assets,orders};}
 const server=http.createServer(async(req,res)=>{inflight++;let ended=false;const done=()=>{if(!ended){ended=true;inflight--;}};res.once('finish',done);res.once('close',done);try{
  if(paused){json(res,503,{error:'격리 백업 중입니다. 잠시 후 다시 시도해 주세요.'});return;}
  if(options.accessGate&&!options.accessGate(req,res))return;
  if(req.headers.host!==new URL(origin).host&&req.url!=='/api/health'){json(res,403,{error:'허용되지 않은 접속입니다.'});return;}
  const url=new URL(req.url,origin),name=url.pathname;
  if(name==='/api/health'){try{if(commerce.now)await commerce.now();else commerce.db.prepare('SELECT 1 AS ok').get();json(res,200,{status:'ok',environment:'SANDBOX',database:commerce.backend||'isolated-sqlite-and-pglite'});}catch{json(res,503,{status:'unavailable',environment:'SANDBOX'});}return;}
  if(name==='/api/catalog'&&req.method==='GET'){json(res,200,{assets:await catalog()});return;}
  if(name==='/api/auth/providers'&&req.method==='GET'){json(res,200,{google:!!options.googleOAuth,naver:false,kakao:false});return;}
  if(options.googleOAuth&&['/api/auth/google/start','/api/auth/google/callback'].includes(name)&&req.method==='GET'){await auth(req,res,name);return;}
  if(name==='/api/auth/neon/status'&&req.method==='GET'){const u=currentUser(req);if(!u){json(res,401,{error:'로그인이 필요합니다.'});return;}json(res,200,{mode:'test',ready:false,testBalance:(await state(u)).balance,history:[]});return;}
  if(name.startsWith('/api/sandbox-commerce/')){
   const u=currentUser(req);if(!u){json(res,401,{error:'격리 계정으로 로그인해 주세요.'});return;}
   if(req.method==='GET'&&name.endsWith('/state')){json(res,200,await state(u));return;}
   if(req.method==='GET'&&name==='/api/sandbox-commerce/refund-admin/list'&&options.refundWorkflow){try{json(res,200,{requests:await options.refundWorkflow.listAdmin(u.id)});}catch{json(res,403,{error:'격리 관리자만 조회할 수 있습니다.'});}return;}
   if(req.method==='GET'&&name.endsWith('/download')){try{const file=await commerce.download(u.id,url.searchParams.get('order'),url.searchParams.get('file'));res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(file.data);}catch{json(res,403,{error:'완료된 본인 주문의 약정 파일만 받을 수 있습니다.'});}return;}
   if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-sandbox-csrf']!==sessions.get(u.id)||!sessions.has(u.id)){json(res,403,{error:'요청 출처를 확인해 주세요.'});return;}
   if(req.headers['content-type']?.split(';')[0]!=='application/json'){json(res,415,{error:'JSON 요청이 필요합니다.'});return;}
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096){json(res,413,{error:'요청이 너무 큽니다.'});return;}chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks).toString());if(!input||typeof input!=='object')throw Error();}catch{json(res,400,{error:'입력값을 확인해 주세요.'});return;}
   const messages={INSUFFICIENT_BALANCE:'격리 잔액이 부족합니다.',ALREADY_PURCHASED:'이미 구매하셨습니다. 주문 내역을 확인해 주세요.',ASSET_UNAVAILABLE:'이미 판매되었거나 구매할 수 없습니다.',TERMS_CHANGED:'거래 조건이 변경되었습니다.',ASSET_RESERVED:'다른 구매자가 예약 중입니다.',RESERVATION_REQUIRED:'본인의 유효한 예약이 필요합니다.',RESERVATION_EXPIRED:'예약 시간이 만료되었습니다. 다시 예약해 주세요.'};
   if(options.refundWorkflow&&['/api/sandbox-commerce/refund/request','/api/sandbox-commerce/refund-admin/action'].includes(name)){try{const result=name.endsWith('/request')?await options.refundWorkflow.request(u.id,{orderId:input.orderId,requestId:input.requestId,reason:input.reason}):await options.refundWorkflow.action(u.id,{requestId:input.requestId,action:input.action,reason:input.reason});json(res,200,{request:result});}catch(e){const text={REVIEW_ON_HOLD:'검토 보류를 해제한 후 다시 승인해 주세요.',REASON_REQUIRED:'사유를 3~1000자로 입력해 주세요.',ADMIN_REQUIRED:'격리 관리자 권한이 필요합니다.',SELF_REVIEW_DENIED:'자기 주문은 검토·승인·실행할 수 없습니다.',APPROVAL_REQUIRED:'승인된 신청만 실행할 수 있습니다.',REFUND_NOT_ALLOWED:'완료·정산 대기 주문만 신청할 수 있습니다.',INVALID_STATE:'신청 상태가 변경되었습니다. 새로고침해 주세요.'};json(res,['ACCESS_DENIED','ADMIN_REQUIRED','SELF_REVIEW_DENIED'].includes(e.message)?403:409,{error:text[e.message]||'환불 신청을 처리하지 못했습니다.'});}return;}
   if(options.refundWorkflow&&name.endsWith('/refund')){json(res,403,{error:'환불 신청 후 관리자 승인·실행이 필요합니다.'});return;}
   if(name.endsWith('/reserve')&&commerce.reserve){try{await ensureWallet(u.id);json(res,200,{...await commerce.reserve({buyerId:u.id,assetId:input.assetId}),serverTime:await commerce.now()});}catch(e){json(res,409,{error:messages[e.message]||'예약할 수 없습니다.'});}return;}
   if(name.endsWith('/cancel')&&commerce.cancel){json(res,200,{cancelled:await commerce.cancel({buyerId:u.id,assetId:input.assetId,token:input.token})});return;}
   if(name.endsWith('/refund')&&commerce.refund){try{const order=await commerce.refund(u.id,input.orderId);json(res,200,{orderId:order.id,status:order.status});}catch(e){json(res,e.message==='ACCESS_DENIED'?403:409,{error:'본인의 완료된 격리 주문만 전액환불할 수 있습니다.'});}return;}
   if(name.endsWith('/purchase')){try{const order=await commerce.purchase({buyerId:u.id,assetId:input.assetId,requestId:input.requestId,expectedPrice:input.expectedPrice,contractVersion:input.contractVersion,token:input.token,additionalWork:input.additionalWork??false});json(res,200,{orderId:order.id,status:order.status,balance:order.balance});}catch(e){json(res,409,{error:messages[e.message]||'구매 조건을 확인해 주세요.'});}return;}
   json(res,404,{error:'지원하지 않는 거래 요청입니다.'});return;
  }
  if(name.startsWith('/api/')){
   // Only existing email authentication and read-only profile run in this integration.
   if(!['/api/auth/me','/api/auth/login','/api/auth/signup','/api/auth/logout','/api/auth/creator-profile'].includes(name)||name.endsWith('creator-profile')&&req.method!=='GET'){json(res,403,{error:'이 격리 환경에서는 해당 기능을 실행하지 않습니다.'});return;}
   if(req.method==='POST'&&req.headers.origin!==origin){json(res,403,{error:'요청 출처를 확인해 주세요.'});return;}
   await auth(req,res,name);return;
  }
  if(req.method!=='GET'){json(res,405,{error:'지원하지 않는 요청입니다.'});return;}
  if(name==='/'||name==='/index.html'){
   let html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');html=html.replace('</head>','<link rel="stylesheet" href="/sandbox-home.css"></head>').replace('</body>','<script src="/sandbox-home.js"></script><script src="/sandbox-refunds.js"></script></body>');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; media-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});res.end(html);return;
  }
  const files={'/sandbox-home.js':'sandbox-ui/home-integration.js','/sandbox-home.css':'sandbox-ui/home-integration.css','/sandbox-refunds.js':'sandbox-ui/refund-workflow.js','/landing.css':'landing.css','/page-routing.js':'page-routing.js'};
  const relative=files[name]||(name.startsWith('/assets/')?name.slice(1):null);
  if(!relative||name.split('/').some(p=>p.startsWith('.'))){res.writeHead(404).end();return;}
  const file=path.resolve(__dirname,relative);if(!file.startsWith(__dirname+path.sep)){res.writeHead(403).end();return;}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  const types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.webp':'image/webp'};res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch{if(!res.headersSent)json(res,500,{error:'격리 환경 요청 처리에 실패했습니다.'});else res.end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(options.port??4320,options.bindHost||'127.0.0.1',()=>{try{origin=options.publicOrigin||'http://127.0.0.1:'+server.address().port;process.env.PUBLIC_BASE_URL=origin;auth=require('./auth.cjs');accounts=require('./database.cjs')(accountDir);resolve();}catch(error){reject(error);}});});
 return {origin,root:commerce.root,server,commerce,quiesce:async()=>{paused=true;const deadline=Date.now()+10000;while(inflight){if(Date.now()>deadline)throw Error('QUIESCE_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,10));}},resume:()=>{paused=false;},close:()=>new Promise(resolve=>server.close(async()=>{accounts.close();await commerce.close();resolve();}))};
}
module.exports=start;
if(require.main===module)start({port:Number(process.env.SANDBOX_HOME_PORT||4320),fresh:process.env.SANDBOX_HOME_FRESH==='1'}).then(app=>{console.log(JSON.stringify({origin:app.origin,root:app.root,environment:'SANDBOX'}));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});}).catch(()=>{console.error('격리 홈페이지를 시작하지 못했습니다. 기록은 삭제하지 않았습니다.');process.exitCode=1;});
