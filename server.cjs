const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const deployment = require('./deployment-config.cjs');
const auth = require('./auth.cjs');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2'};
http.createServer(async (req,res) => {
  const writeHead=res.writeHead;
  res.writeHead=function(status,headers){if(deployment.secure&&headers&&headers['Set-Cookie']){const cookies=headers['Set-Cookie'];headers['Set-Cookie']=Array.isArray(cookies)?cookies.map(c=>c+'; Secure'):cookies+'; Secure'}return writeHead.call(this,status,headers)};
  let name;
  try { name = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if(await auth(req,res,name)) return;
  if(name.split('/').some(p=>p.startsWith('.')) || !['/','/index.html','/landing.css','/page-routing.js'].includes(name)&&!name.startsWith('/assets/')) {res.writeHead(404).end();return;}
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file,(err,stat) => {
    if(err || !stat.isFile()) { res.writeHead(404).end(); return; }
    const headers = {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache'};
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
}).listen(Number(process.env.PORT||4317),process.env.HOST||'127.0.0.1',() => console.log('NovaNoxX server ready'));
