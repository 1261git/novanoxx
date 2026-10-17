const raw=process.env.PUBLIC_BASE_URL||process.env.RENDER_EXTERNAL_URL||'http://localhost:4317';
const url=new URL(raw);
if(url.pathname!=='/'||url.search||url.hash||!['http:','https:'].includes(url.protocol))throw Error('PUBLIC_BASE_URL must be an origin');
if(process.env.NODE_ENV==='production'&&url.protocol!=='https:')throw Error('Production requires HTTPS');
const aliases=process.env.RENDER_SERVICE_ID==='srv-db5aqunlk1mc739bi0m0'?new Set(['novanoxx.com','www.novanoxx.com','novanoxx.onrender.com']):new Set();
module.exports={base:url.origin,host:url.host,secure:url.protocol==='https:',requestOrigin(req){return aliases.has(req.headers.host)?'https://'+req.headers.host:url.origin;},withRequest(req,fn){const host=req.headers.host;if(aliases.has(host)&&req.headers.origin==='https://'+host)req.headers.origin=url.origin;return fn();}};
