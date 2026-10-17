const raw=process.env.PUBLIC_BASE_URL||process.env.RENDER_EXTERNAL_URL||'http://localhost:4317';
const url=new URL(raw);
if(url.pathname!=='/'||url.search||url.hash||!['http:','https:'].includes(url.protocol))throw Error('PUBLIC_BASE_URL must be an origin');
if(process.env.NODE_ENV==='production'&&url.protocol!=='https:')throw Error('Production requires HTTPS');
const context=new(require('node:async_hooks').AsyncLocalStorage)();
const aliases=process.env.RENDER_SERVICE_ID==='srv-db5aqunlk1mc739bi0m0'?new Set(['novanoxx.com','www.novanoxx.com','novanoxx.onrender.com']):new Set();
module.exports={get base(){return context.getStore()?.origin||url.origin;},get host(){return new URL(this.base).host;},get secure(){return new URL(this.base).protocol==='https:';},withRequest(req,fn){const host=req.headers.host,origin=aliases.has(host)?'https://'+host:url.origin;return context.run({origin},fn);}};
