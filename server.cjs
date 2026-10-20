const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const deployment = require('./deployment-config.cjs');
const auth = require('./auth.cjs');
const backupGate = require('./backup-quiesce-gate.cjs').configured();
const backupAutomation = require('./backup-automation.cjs').configured({gate:backupGate});
const mail=auth.mail();
const engine=auth.localEngine();
const visitorPrune=setInterval(()=> (typeof backupGate.runTask==='function'?backupGate.runTask(()=>auth.visitors().prune()):Promise.resolve().then(()=>auth.visitors().prune())).catch(()=>console.error('NNX_VISITOR_PRUNE_DEFERRED')),3600000);visitorPrune.unref();
const mailWorker=mail?require('./mail-worker.cjs').create({mail,gate:backupGate,
  paused:require('./mail-worker.cjs').sendPaused(),
  beforeDispatch:()=>{engine?.notifications?.sync(mail);try{auth.engagement()?.tick(mail);}catch{console.error('NNX_OPTIONAL_MAIL_DEFERRED');}},
  onError:()=>console.error('NNX_MAIL_WORKER_DEFERRED')}):null;
const engineWorker=engine&&!engine.reviewOnly&&!engine.scheduledJobsDisabled?require('./engine-cycle-worker.cjs')({engine,intervalMs:Number(process.env.NNX_TEST_ENGINE_INTERVAL_MS||60000),gate:typeof backupGate.runTask==='function'?backupGate:{runTask:fn=>Promise.resolve().then(fn)},onError:()=>console.error('NNX_TEST_ENGINE_CYCLE_DEFERRED')}):null;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2'};
const server = http.createServer(backupGate.wrap((req,res)=>deployment.withRequest(req,async()=>{
  const writeHead=res.writeHead;
  res.writeHead=function(status,headers){if(deployment.secure&&headers&&headers['Set-Cookie']){const cookies=headers['Set-Cookie'];headers['Set-Cookie']=Array.isArray(cookies)?cookies.map(c=>c+'; Secure'):cookies+'; Secure'}return writeHead.call(this,status,headers)};
  let name;
  try { name = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if(process.env.RENDER_SERVICE_ID==='srv-db5aqunlk1mc739bi0m0'&&['/','/index.html'].includes(name)&&['GET','HEAD'].includes(req.method)){
    if(req.headers.host==='novanoxx.onrender.com'||req.headers.host==='www.novanoxx.com'){res.writeHead(308,{'Location':deployment.base+req.url,'Cache-Control':'no-store'});res.end();return;}
    const html=Buffer.from(require('./production-page.cjs')(fs.readFileSync(path.join(root,'index.html'),'utf8')));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':html.length,'Cache-Control':'no-cache','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:html);return;
  }
  if(await backupAutomation.handle(req,res,name)) return;
  if(await auth(req,res,name)) return;
  if(await require('./public-image-preview.cjs').staticHandle(req,res,name,{dir:process.env.DATA_DIR||path.join(root,'.private')})) return;
  if(name.split('/').some(p=>p.startsWith('.')) || !['/','/index.html','/landing.css','/page-routing.js'].includes(name)&&!name.startsWith('/assets/')) {res.writeHead(404).end();return;}
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file,(err,stat) => {
    if(err || !stat.isFile()) { res.writeHead(404).end(); return; }
    const headers = {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache','Referrer-Policy':'no-referrer'};
    const range = req.headers.range;
    if(range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      if(!m) { res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end(); return; }
      const start=Number(m[1]), end=m[2]?Math.min(Number(m[2]),stat.size-1):stat.size-1;
      if(start>end || start>=stat.size) { res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end(); return; }
      res.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${stat.size}`});
      fs.createReadStream(file,{start,end}).pipe(res);
    } else {
      res.writeHead(200,{...headers,'Content-Length':stat.size});
      fs.createReadStream(file).pipe(res);
    }
  });
})));
backupGate.ready.then(() => server.listen(Number(process.env.PORT||4317),process.env.HOST||'127.0.0.1',() => { console.log('NovaNoxX server ready'); mailWorker?.start(); engineWorker?.start(); backupAutomation.start().catch(() => console.error('NNX_BACKUP_AUTOMATION_ALERT START_FAILED')); }))
 .catch(() => { console.error('Backup control initialization failed; server not started.'); process.exitCode=1; });

server.once('close',()=>{engineWorker?.stop().catch(()=>{});});
