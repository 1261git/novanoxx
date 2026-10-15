const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const create=require('./sandbox-commerce.cjs');
function startSandboxServer(options={}){
 const pointer=path.join(__dirname,'.sandbox-commerce','ui-current.json');
 const saved=options.resumeRoot||(!options.fresh&&fs.existsSync(pointer)?JSON.parse(fs.readFileSync(pointer,'utf8')).root:null);
 const commerce=create(saved?{resumeRoot:saved}:{});
 if(!saved){
  commerce.addWallet('buyer-a',100);commerce.addWallet('buyer-b',100);
  for(const [id,price,saleMode] of [['prompt-pack',10,'MULTI'],['exclusive-pack',20,'EXCLUSIVE'],['large-pack',200,'MULTI']])commerce.addAsset({id,sellerId:'sandbox-creator',price,saleMode,files:[{name:id+'.txt',data:Buffer.from('NovaNoxX sandbox deliverable: '+id)}]});
  if(!options.fresh)fs.writeFileSync(pointer,JSON.stringify({root:commerce.root}),{flag:'wx'});
 }
 const sessions=new Map();let origin;
 const titles={'prompt-pack':'AI 프롬프트 스타터','exclusive-pack':'독점 크리에이티브 패키지','large-pack':'확장 워크플로우 패키지'};
 const json=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value))};
 const errors={INSUFFICIENT_BALANCE:'테스트 잔액이 부족합니다.',ASSET_UNAVAILABLE:'이미 판매됐거나 구매할 수 없는 에셋입니다.',ALREADY_PURCHASED:'이미 구매하셨습니다. 주문 내역을 확인해 주세요.',TERMS_CHANGED:'거래 조건이 변경됐습니다. 화면을 새로고침해 주세요.',REQUEST_CONFLICT:'다른 거래에 사용된 요청입니다.',INVALID_REQUEST:'추가 작업 없는 구매 요청을 확인해 주세요.'};
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.headers.host!==new URL(origin).host){json(res,403,{error:'허용되지 않은 접속입니다.'});return}
   const url=new URL(req.url,origin);
   if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(fs.readFileSync(path.join(__dirname,'sandbox-ui/index.html')));return}
   if(req.method==='GET'&&url.pathname==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(__dirname,'sandbox-ui/app.js')));return}
   if(req.method==='GET'&&url.pathname==='/assets/novanoxx-brand-logo.png'){res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(__dirname,'assets/novanoxx-brand-logo.png')));return}
   const cookie=/\bnnx_sandbox=([0-9a-f]{48})\b/.exec(req.headers.cookie||'');let session=cookie&&sessions.get(cookie[1]);
   if(req.method==='GET'&&url.pathname==='/api/state'){
    const headers={};if(!session){const token=crypto.randomBytes(24).toString('hex');session={buyer:'buyer-a',csrf:crypto.randomBytes(24).toString('hex')};sessions.set(token,session);headers['Set-Cookie']=`nnx_sandbox=${token}; HttpOnly; SameSite=Strict; Path=/`}
    const orders=commerce.db.prepare('SELECT id FROM orders WHERE buyer_id=? ORDER BY created DESC,id').all(session.buyer).map(row=>{const o=commerce.getOrder(session.buyer,row.id);return {...o,title:titles[o.asset_id]}});
    const assets=commerce.db.prepare('SELECT * FROM assets ORDER BY price').all().map(a=>({...a,title:titles[a.id],files:commerce.db.prepare("SELECT id,name,size FROM files WHERE asset_id=? AND kind='original'").all(a.id),purchased:orders.some(o=>o.asset_id===a.id&&o.status==='COMPLETED')}));
    json(res,200,{environment:'SANDBOX',buyer:session.buyer,balance:commerce.db.prepare('SELECT balance FROM wallets WHERE user_id=?').get(session.buyer).balance,csrf:session.csrf,assets,orders},headers);return
   }
   if(!session){json(res,401,{error:'테스트 화면을 먼저 열어 주세요.'});return}
   if(req.method==='GET'&&url.pathname==='/api/download'){
    try{const f=commerce.download(session.buyer,url.searchParams.get('order'),url.searchParams.get('file'));res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(f.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(f.data)}catch{json(res,403,{error:'완료된 본인 주문의 약정 파일만 다운로드할 수 있습니다.'})}return
   }
   if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-sandbox-csrf']!==session.csrf){json(res,403,{error:'요청 출처를 확인해 주세요.'});return}
   if(req.headers['content-type']?.split(';')[0]!=='application/json'){json(res,415,{error:'요청 형식을 확인해 주세요.'});return}
   let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>4096){json(res,413,{error:'요청이 너무 큽니다.'});return}chunks.push(chunk)}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString());if(!data||typeof data!=='object')throw Error()}catch{json(res,400,{error:'입력값을 확인해 주세요.'});return}
   if(url.pathname==='/api/switch'){if(!['buyer-a','buyer-b'].includes(data.buyer)){json(res,400,{error:'테스트 계정을 선택해 주세요.'});return}session.buyer=data.buyer;json(res,200,{ok:true});return}
   if(url.pathname==='/api/purchase'){
    try{const order=commerce.purchase({...data,buyerId:session.buyer});json(res,200,{orderId:order.id,status:order.status,balance:order.balance})}catch(e){json(res,409,{error:errors[e.message]||'구매를 완료하지 못했습니다. 주문 내역을 확인한 뒤 다시 시도해 주세요.'})}return
   }
   json(res,404,{error:'페이지를 찾을 수 없습니다.'});
  }catch{json(res,500,{error:'격리 환경 요청 처리에 실패했습니다.'})}
 });
 return new Promise((resolve,reject)=>{server.once('error',error=>{commerce.close();reject(error)});server.listen(options.port??4318,'127.0.0.1',()=>{origin='http://127.0.0.1:'+server.address().port;resolve({server,commerce,origin,close:()=>new Promise(done=>server.close(()=>{commerce.close();done()}))})})});
}
module.exports=startSandboxServer;
if(require.main===module)startSandboxServer().then(app=>{console.log('NovaNoxX SANDBOX: '+app.origin+' — 가상 잔액 및 파일 전용');for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0)})}).catch(()=>{console.error('격리 서버를 시작하지 못했습니다. 기존 격리 기록은 삭제하지 않았습니다.');process.exitCode=1});
