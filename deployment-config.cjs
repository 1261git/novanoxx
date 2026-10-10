const raw=process.env.PUBLIC_BASE_URL||process.env.RENDER_EXTERNAL_URL||'http://localhost:4317';
const url=new URL(raw);
if(url.pathname!=='/'||url.search||url.hash||!['http:','https:'].includes(url.protocol))throw Error('PUBLIC_BASE_URL must be an origin');
if(process.env.NODE_ENV==='production'&&url.protocol!=='https:')throw Error('Production requires HTTPS');
module.exports={base:url.origin,host:url.host,secure:url.protocol==='https:'};
