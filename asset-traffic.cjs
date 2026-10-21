'use strict';
const DAY=86400000,day=t=>new Date(t+9*3600000).toISOString().slice(0,10);
module.exports=function({db,user,json,origin,isAdmin,clock=Date.now,enabled=false}){
 db.exec("CREATE TABLE IF NOT EXISTS asset_traffic_daily(day_key TEXT NOT NULL,asset_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('CARD_CLICK','DETAIL_VIEW')),audience TEXT NOT NULL CHECK(audience IN ('MEMBER','GUEST')),country TEXT NOT NULL,events BIGINT NOT NULL CHECK(events>0),PRIMARY KEY(day_key,asset_id,kind,audience,country));CREATE TABLE IF NOT EXISTS asset_traffic_meta(id TEXT PRIMARY KEY,started BIGINT NOT NULL);");
 if(enabled)db.prepare("INSERT INTO asset_traffic_meta VALUES('SEGMENTED_V1',?) ON CONFLICT(id) DO NOTHING").run(clock());
 const seen=new Map();let minute=-1,received=0,lastPrune=0,lastMemoryPrune=0;
 function add(assetId,kind,audience){
  if(!enabled)return {recorded:false};
  // Country lookup is intentionally disabled pending the separate IP review.
  db.prepare("INSERT INTO asset_traffic_daily VALUES(?,?,?,?, 'UNKNOWN',1) ON CONFLICT(day_key,asset_id,kind,audience,country) DO UPDATE SET events=asset_traffic_daily.events+1").run(day(clock()),assetId,kind,audience);
  return {recorded:true};
 }
 function prune(){const now=clock();if(now-lastMemoryPrune>=60000){for(const [key,at]of seen)if(at<=now-5*60000)seen.delete(key);lastMemoryPrune=now;}if(now-lastPrune<3600000)return;db.prepare('DELETE FROM asset_traffic_daily WHERE day_key<?').run(day(now-119*DAY));lastPrune=now;}
 function detail({assetId}){return add(assetId,'DETAIL_VIEW','MEMBER');}
 async function handle(req,res,name){
  if(name!=='/api/auth/asset-card-click')return false;
  if(req.method!=='POST'){json(res,405,{error:'METHOD_REQUIRED'});return true;}
  if(req.headers.origin!==origin){json(res,403,{error:'ORIGIN_REQUIRED'});return true;}
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json'){json(res,415,{error:'JSON_REQUIRED'});return true;}
  try{
   const nowMinute=Math.floor(clock()/60000);if(minute!==nowMinute){minute=nowMinute;received=0;}if(++received>600){json(res,429,{error:'CAPACITY_LIMIT'});return true;}
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>512)throw Error('INVALID_INPUT');chunks.push(chunk);}const i=JSON.parse(Buffer.concat(chunks));
   if(!i||typeof i!=='object'||Array.isArray(i)||Object.keys(i).some(k=>!['assetId','requestId'].includes(k))||!Number.isSafeInteger(i.assetId)||i.assetId<=1000||typeof i.requestId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(i.requestId))throw Error('INVALID_INPUT');
   if(!enabled){json(res,200,{recorded:false});return true;}
   prune();const actor=user(req);if(isAdmin(actor)||/bot|crawler|spider|headless|monitor|uptime/i.test(req.headers['user-agent']||'')){json(res,200,{recorded:false,excluded:true});return true;}
   if(actor&&['WITHDRAWN','SUSPENDED'].includes(db.prepare('SELECT state FROM member_restrictions WHERE user_id=?').get(actor.id)?.state)){json(res,200,{recorded:false,excluded:true});return true;}
   const a=db.prepare("SELECT a.id,a.user_id FROM creator_assets a JOIN catalog_links l ON l.asset_id=a.id LEFT JOIN asset_publication_policy p ON p.asset_id=a.id WHERE l.public_id=? AND a.status IN ('ACTIVE','SOLD') AND COALESCE(p.visibility,'PUBLIC')='PUBLIC'").get(i.assetId-1000);
   if(!a||actor?.id===a.user_id){json(res,200,{recorded:false,excluded:true});return true;}
   if(seen.has(i.requestId)){json(res,200,{recorded:false,duplicate:true});return true;}if(seen.size>=10000){json(res,429,{error:'CAPACITY_LIMIT'});return true;}
   const result=add(a.id,'CARD_CLICK',actor?'MEMBER':'GUEST');seen.set(i.requestId,clock());json(res,200,result);
  }catch{json(res,400,{error:'INVALID_INPUT'});}return true;
 }
 return {handle,detail,prune};
};
module.exports.report=function({db,period}){
 const exists=t=>!!db.prepare("SELECT name FROM sqlite_master WHERE name='"+t+"'").get();
 if(!exists('asset_traffic_daily')||!exists('asset_traffic_meta'))return {available:false,rows:[],startedAt:null};
 const startedAt=Number(db.prepare("SELECT started FROM asset_traffic_meta WHERE id='SEGMENTED_V1'").get()?.started||0)||null;
 const category=db.backend==='postgres'?"COALESCE((a.metadata::jsonb)->>'category','UNKNOWN')":"COALESCE(json_extract(a.metadata,'$.category'),'UNKNOWN')";
 const rows=db.prepare('SELECT t.kind,t.audience,t.country,'+category+" category,SUM(t.events) events FROM asset_traffic_daily t JOIN creator_assets a ON a.id=t.asset_id JOIN catalog_links l ON l.asset_id=a.id LEFT JOIN asset_publication_policy p ON p.asset_id=a.id WHERE t.day_key>=? AND t.day_key<=? AND a.status IN ('ACTIVE','SOLD','PAUSED') AND COALESCE(p.visibility,'PUBLIC')='PUBLIC' GROUP BY t.kind,t.audience,t.country,4 ORDER BY t.kind,t.audience,t.country,4").all(day(period.start),day(period.end)).map(r=>({...r,events:Number(r.events)}));
 return {available:!!startedAt,startedAt,rows,countryStatus:'IP_LOOKUP_NOT_ENABLED',ipStored:false,accountIdsStored:false,uniqueVisitors:false,retentionDays:120,detailGuestAccess:false};
};
module.exports.day=day;
