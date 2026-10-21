'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{promisify}=require('node:util');
const execFile=promisify(require('node:child_process').execFile);
const UUID=/^[a-f0-9-]{36}$/i,LANG=/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/i;
function caption(bytes){
 const value=bytes.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 if(!value.startsWith('WEBVTT\n')||value.includes('\0')||/^(STYLE|REGION)(?:\s|$)/m.test(value)||/<(script|iframe|style)\b/i.test(value))throw Error('자막은 올바른 VTT 파일로 올려주세요.');
 const time='(?:\\d{2,}:)?[0-5]\\d:[0-5]\\d\\.\\d{3}',pattern=new RegExp('^('+time+') --> ('+time+')(?: .*)?$','m');
 if(!pattern.test(value))throw Error('자막은 올바른 VTT 파일로 올려주세요.');
 const seconds=s=>s.split(':').reduce((a,b)=>a*60+Number(b),0);
 for(const line of value.split('\n'))if(line.includes('-->')){const m=line.match(pattern);if(!m||seconds(m[2])<=seconds(m[1]))throw Error('자막은 올바른 VTT 파일로 올려주세요.');}
 return Buffer.from(value.replace(/<[^>]*>/g,''));
}
async function probe(file){
 const {stdout}=await execFile(process.env.NNX_DRAMA_FFPROBE||'ffprobe',['-v','error','-protocol_whitelist','file,pipe','-f','mov','-show_entries','format=duration:stream=codec_type,codec_name,width,height,pix_fmt','-of','json',file],{timeout:15000,maxBuffer:65536,windowsHide:true});
 const data=JSON.parse(stdout),video=data.streams?.find(s=>s.codec_type==='video'),duration=Number(data.format?.duration);
 if(!video||video.codec_name!=='h264'||!['yuv420p','yuvj420p'].includes(video.pix_fmt)||data.streams.some(s=>s.codec_type==='audio'&&s.codec_name!=='aac')||!Number.isFinite(duration)||duration<=0||duration>1200||video.width*video.height>3840*2160)throw Error('영상은 20분 이하의 H.264/AAC MP4로 올려주세요.');
 return {duration,width:video.width,height:video.height};
}
module.exports=function({db,dir,user,json,origin,isAdmin,blocked=()=>false,uploadsEnabled=false,neon=null}){
 db.exec(`CREATE TABLE IF NOT EXISTS drama_series(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,created BIGINT NOT NULL,updated BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS drama_episodes(id TEXT PRIMARY KEY,series_id TEXT NOT NULL,user_id TEXT NOT NULL,position INTEGER NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,created BIGINT NOT NULL,updated BIGINT NOT NULL,UNIQUE(series_id,position));
 CREATE TABLE IF NOT EXISTS drama_media(id TEXT PRIMARY KEY,episode_id TEXT NOT NULL,user_id TEXT NOT NULL,kind TEXT NOT NULL,language TEXT NOT NULL,label TEXT NOT NULL,bytes BIGINT NOT NULL,body TEXT NOT NULL,active INTEGER NOT NULL,created BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS drama_entitlements(actor TEXT NOT NULL,episode_id TEXT NOT NULL,transaction_id TEXT NOT NULL UNIQUE,price INTEGER NOT NULL,status TEXT NOT NULL,created BIGINT NOT NULL,PRIMARY KEY(actor,episode_id));
 CREATE TABLE IF NOT EXISTS drama_purchase_intents(id TEXT PRIMARY KEY,actor TEXT NOT NULL,episode_id TEXT NOT NULL,price INTEGER NOT NULL,status TEXT NOT NULL,created BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS drama_reviews(id TEXT PRIMARY KEY,series_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,created BIGINT NOT NULL);`);
 const folder=path.join(dir,'drama-media'),fileLimit=300*1024*1024,totalLimit=600*1024*1024;let busy=false;
 const fail=(message,status=400)=>{const error=Error(message);error.status=status;throw error;};
 const series=id=>UUID.test(id||'')?db.prepare('SELECT * FROM drama_series WHERE id=?').get(id):null;
 const episode=id=>UUID.test(id||'')?db.prepare('SELECT * FROM drama_episodes WHERE id=?').get(id):null;
 const ownerActive=id=>!blocked(id)&&!!db.prepare('SELECT user_id FROM creator_profiles WHERE user_id=?').get(id);
 const admin=actor=>!!actor&&isAdmin(actor);
 const own=(row,actor)=>!!row&&!!actor&&(row.user_id===actor.id||admin(actor));
 const publicSeries=row=>!!row&&row.status==='PUBLISHED'&&ownerActive(row.user_id);
 const visible=(ep,actor)=>!!ep&&(own(ep,actor)||ep.status==='PUBLISHED'&&publicSeries(series(ep.series_id)));
 const price=ep=>ep.position<=2?0:Number(JSON.parse(ep.body).priceNeon||3);
 const purchased=(actor,ep)=>!!actor&&!!db.prepare("SELECT actor FROM drama_entitlements WHERE actor=? AND episode_id=? AND status='ACTIVE'").get(actor.id,ep.id);
 const watchable=(ep,actor)=>visible(ep,actor)&&(own(ep,actor)||price(ep)===0||purchased(actor,ep));
 const paymentsReady=()=>neon?.ready?.()===true;
 const purchasing=new Set();
 const media=ep=>db.prepare('SELECT * FROM drama_media WHERE episode_id=? AND active=1 ORDER BY created,id').all(ep.id);
 function outputEpisode(ep,actor){const files=media(ep),video=files.find(f=>f.kind==='video'),allowed=watchable(ep,actor);return {id:ep.id,number:ep.position,...JSON.parse(ep.body),priceNeon:price(ep),locked:!allowed,purchased:purchased(actor,ep),paymentReady:paymentsReady(),status:ep.status,duration:video?Number(JSON.parse(video.body).duration)||null:null,video:allowed&&video?'/api/drama/media?id='+video.id:null,tracks:allowed?files.filter(f=>f.kind==='caption').map(f=>({language:f.language,label:f.label,url:'/api/drama/media?id='+f.id})):[],editable:own(ep,actor)};}
 function output(row,actor,detail=false){const name=db.prepare('SELECT display_name FROM creator_profiles WHERE user_id=?').get(row.user_id)?.display_name||'Creator';const episodes=db.prepare('SELECT * FROM drama_episodes WHERE series_id=? ORDER BY position,id').all(row.id).filter(e=>visible(e,actor));return {id:row.id,...JSON.parse(row.body),creator:name,status:row.status,episodeCount:episodes.length,...(detail?{episodes:episodes.map(e=>outputEpisode(e,actor)),editable:own(row,actor),reviews:own(row,actor)?db.prepare('SELECT action,reason,created FROM drama_reviews WHERE series_id=? ORDER BY created DESC LIMIT 10').all(row.id):[]}:{} )};}
 const text=(value,max,required=false)=>{if(typeof value!=='string'||value.trim().length>max||required&&!value.trim())fail('입력 내용을 확인해주세요.');return value.trim();};
 function record(row,actor,action,reason=''){db.prepare('INSERT INTO drama_reviews VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),row.id,actor.id,action,reason,Date.now());}
 function diskBytes(){if(!fs.existsSync(folder))return 0;return fs.readdirSync(folder).reduce((sum,name)=>{const s=fs.lstatSync(path.join(folder,name));if(s.isSymbolicLink()||!s.isFile())fail('영상 저장 공간을 확인해주세요.',409);return sum+s.size;},0);}
 async function readJSON(req){let bytes=0,chunks=[];for await(const c of req){bytes+=c.length;if(bytes>16384)fail('입력 내용을 확인해주세요.');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks));}catch{fail('입력 내용을 확인해주세요.');}}
 async function stream(req,res,url,actor){
  const id=url.searchParams.get('id');const f=UUID.test(id||'')?db.prepare('SELECT * FROM drama_media WHERE id=? AND active=1').get(id):null;
  if(!f||!watchable(episode(f.episode_id),actor))fail('공개된 회차를 찾을 수 없습니다.',404);
  const file=path.join(folder,f.id),stat=await fs.promises.lstat(file).catch(()=>null);if(!stat||!stat.isFile()||stat.isSymbolicLink()||stat.size!==Number(f.bytes))fail('공개된 회차를 찾을 수 없습니다.',404);
  const headers={'Content-Type':f.kind==='video'?'video/mp4':'text/vtt; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Disposition':'inline','Cache-Control':'private, no-store','Accept-Ranges':'bytes'};
  let start=0,end=stat.size-1,status=200;const range=req.headers.range;
  if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||!m[1]&&!m[2]){res.writeHead(416,{'Content-Range':'bytes */'+stat.size}).end();return;}start=m[1]?Number(m[1]):Math.max(0,stat.size-Number(m[2]));end=m[1]?(m[2]?Math.min(Number(m[2]),end):end):end;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){res.writeHead(416,{'Content-Range':'bytes */'+stat.size}).end();return;}status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;}
  res.writeHead(status,{...headers,'Content-Length':end-start+1});if(req.method==='HEAD'){res.end();return;}const input=fs.createReadStream(file,{start,end});input.on('error',()=>res.destroy());res.on('close',()=>input.destroy());input.pipe(res);
 }
 async function upload(req,url,actor){
  if(!uploadsEnabled)fail('영상 업로드는 저장·전송 비용 확인 후 활성화됩니다.',409);
  const ep=episode(url.searchParams.get('episodeId'));if(!ep||ep.user_id!==actor.id||ep.status!=='DRAFT'||!['DRAFT','PUBLISHED'].includes(series(ep.series_id)?.status))fail('편집 가능한 회차를 선택해주세요.',409);
  const kind=url.searchParams.get('kind'),language=kind==='caption'?url.searchParams.get('language')||'ko':'';
  if(!['video','caption'].includes(kind)||kind==='caption'&&!LANG.test(language))fail('입력 내용을 확인해주세요.');
  if(kind==='caption'&&media(ep).filter(f=>f.kind==='caption'&&f.language!==language).length>=8)fail('자막은 회차당 8개 언어까지 등록할 수 있습니다.');
  if(busy)fail('다른 영상 업로드가 진행 중입니다. 잠시 후 다시 시도해주세요.',409);busy=true;
  const id=crypto.randomUUID();let file,committed=false;
  try{
   fs.mkdirSync(folder,{recursive:true});file=path.join(folder,id);const space=fs.statfsSync(folder);if(Number(space.bavail)*Number(space.bsize)<fileLimit+256*1024*1024)fail('영상 저장 공간을 확인해주세요.',409);
   const before=diskBytes();if(before>=totalLimit)fail('영상 저장 공간을 확인해주세요.',409);let size=0;const handle=await fs.promises.open(file,'wx',0o600);
   try{for await(const chunk of req){size+=chunk.length;if(size>(kind==='video'?fileLimit:1024*1024)||before+size>totalLimit)fail('영상 저장 공간 또는 파일 크기를 확인해주세요.');await handle.write(chunk);}if(!size)fail('빈 파일은 올릴 수 없습니다.');await handle.sync();}finally{await handle.close();}
   let info={};if(kind==='video')info=await probe(file);else{const bytes=caption(await fs.promises.readFile(file));await fs.promises.writeFile(file,bytes);size=bytes.length;}
   const current=episode(ep.id);if(!current||current.status!=='DRAFT'||!['DRAFT','PUBLISHED'].includes(series(ep.series_id)?.status)||!ownerActive(actor.id))fail('편집 가능한 회차를 선택해주세요.',409);
   db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE drama_media SET active=0 WHERE episode_id=? AND kind=? AND language=? AND active=1').run(ep.id,kind,language);db.prepare('INSERT INTO drama_media VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,ep.id,actor.id,kind,language,language||'',size,JSON.stringify(info),1,Date.now());db.prepare('UPDATE drama_episodes SET updated=? WHERE id=?').run(Date.now(),ep.id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}committed=true;return {ok:true,id,...info};
  }finally{if(file&&!committed)await fs.promises.unlink(file).catch(()=>{});busy=false;}
 }
 async function handle(req,res,name){
  if(!name.startsWith('/api/drama/'))return false;const url=new URL(req.url,origin),actor=user(req);
  try{
   if(['GET','HEAD'].includes(req.method)&&name==='/api/drama/media'){await stream(req,res,url,actor);return true;}
   if(req.method==='GET'){
    if(name==='/api/drama/catalog'){const rows=db.prepare("SELECT * FROM drama_series WHERE status='PUBLISHED' ORDER BY updated DESC,id LIMIT 100").all().filter(publicSeries);json(res,200,{series:rows.map(r=>output(r,null)).filter(r=>r.episodeCount>0)});return true;}
    if(name==='/api/drama/series'){const row=series(url.searchParams.get('id'));if(!row||!own(row,actor)&&!publicSeries(row))fail('공개된 작품을 찾을 수 없습니다.',404);json(res,200,{series:output(row,actor,true)});return true;}
    if(name==='/api/drama/studio'){if(!actor)fail('로그인이 필요합니다.',401);if(!ownerActive(actor.id)&&!admin(actor))fail('크리에이터 프로필을 먼저 등록해주세요.',403);json(res,200,{uploadsEnabled,series:db.prepare('SELECT * FROM drama_series WHERE user_id=? ORDER BY updated DESC,id').all(actor.id).map(r=>output(r,actor,true)),reviews:admin(actor)?db.prepare("SELECT * FROM drama_series WHERE status='PUBLISHED' ORDER BY updated,id LIMIT 100").all().map(r=>output(r,actor,true)):null});return true;}
    fail('요청한 화면을 찾을 수 없습니다.',404);
   }
   if(req.method!=='POST')fail('지원하지 않는 요청입니다.',405);if(!actor)fail('로그인이 필요합니다.',401);if(req.headers.origin!==origin)fail('요청 출처를 확인해주세요.',403);if(name!=='/api/drama/purchase'&&!ownerActive(actor.id)&&!admin(actor))fail('크리에이터 프로필을 먼저 등록해주세요.',403);
   if(name==='/api/drama/upload'){json(res,200,await upload(req,url,actor));return true;}
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail('JSON 요청이 필요합니다.',415);const input=await readJSON(req);
   if(name==='/api/drama/purchase'){
    const ep=episode(input.episodeId);if(!ep||ep.status!=='PUBLISHED'||!publicSeries(series(ep.series_id)))fail('공개된 회차를 찾을 수 없습니다.',404);
    if(own(ep,actor)||price(ep)===0||purchased(actor,ep)){json(res,200,{ok:true,alreadyOwned:true});return true;}
    if(!paymentsReady())fail('NEON 운영 결제 연결 후 구매할 수 있습니다.',409);
    if(!UUID.test(input.requestId||'')||input.expectedPrice!==price(ep))fail('회차 가격을 다시 확인해주세요.',409);
    const lock=actor.id+':'+ep.id;if(purchasing.has(lock))fail('결제 결과를 확인 중입니다.',409);purchasing.add(lock);
    try{
     const prior=db.prepare('SELECT * FROM drama_purchase_intents WHERE id=?').get(input.requestId);if(prior&&(prior.actor!==actor.id||prior.episode_id!==ep.id||prior.price!==price(ep)))fail('결제 요청을 다시 확인해주세요.',409);
     if(!prior)db.prepare('INSERT INTO drama_purchase_intents VALUES(?,?,?,?,?,?)').run(input.requestId,actor.id,ep.id,price(ep),'PENDING',Date.now());
     const receipt=await neon.purchase({actor:actor.id,episodeId:ep.id,priceNeon:price(ep),requestId:input.requestId,idempotencyKey:crypto.createHash('sha256').update('DRAMA_V1\0'+actor.id+'\0'+ep.id).digest('hex')});
     if(receipt?.kind!=='VERIFIED_NEON_CHARGE'||receipt.actor!==actor.id||receipt.episodeId!==ep.id||receipt.priceNeon!==price(ep)||typeof receipt.transactionId!=='string'||!receipt.transactionId||receipt.transactionId.length>120)throw Error('UNVERIFIED_NEON_RECEIPT');
     db.exec('BEGIN IMMEDIATE');try{db.prepare("INSERT INTO drama_entitlements VALUES(?,?,?,?,?,?) ON CONFLICT(actor,episode_id) DO NOTHING").run(actor.id,ep.id,receipt.transactionId,price(ep),'ACTIVE',Date.now());db.prepare("UPDATE drama_purchase_intents SET status='SUCCEEDED' WHERE id=?").run(input.requestId);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}json(res,200,{ok:true});return true;
    }catch(error){db.prepare("UPDATE drama_purchase_intents SET status='UNKNOWN' WHERE id=? AND actor=? AND status<>'SUCCEEDED'").run(input.requestId,actor.id);if(error.status)throw error;fail('결제 결과를 확인해주세요. 재구매하지 마세요.',409);}finally{purchasing.delete(lock);}
   }
   if(name==='/api/drama/series/save'){
    const old=input.id?series(input.id):null;if(input.id&&(!old||old.user_id!==actor.id||old.status!=='DRAFT'))fail('편집 가능한 작품을 선택해주세요.',409);
    if(!old&&Number(db.prepare('SELECT COUNT(*) n FROM drama_series WHERE user_id=?').get(actor.id).n)>=50)fail('작품 등록 한도를 확인해주세요.');
    const body={title:text(input.title,120,true),description:text(input.description,3000,true),genre:text(input.genre||'',60),rightsNote:text(input.rightsNote||'',1000),screeningRights:input.screeningRights===true};const now=Date.now(),id=old?.id||crypto.randomUUID();if(old)db.prepare('UPDATE drama_series SET body=?,updated=? WHERE id=?').run(JSON.stringify(body),now,id);else db.prepare('INSERT INTO drama_series VALUES(?,?,?,?,?,?)').run(id,actor.id,JSON.stringify(body),'DRAFT',now,now);json(res,200,{id});return true;
   }
   if(name==='/api/drama/episode/save'){
    const row=series(input.seriesId),old=input.id?episode(input.id):null;if(!row||row.user_id!==actor.id||!['DRAFT','PUBLISHED'].includes(row.status)||input.id&&(!old||old.series_id!==row.id||old.status!=='DRAFT'))fail('편집 가능한 회차를 선택해주세요.',409);
    if(!Number.isSafeInteger(input.number)||input.number<1||input.number>200)fail('회차 번호는 1~200의 정수로 입력해주세요.');if(db.prepare('SELECT id FROM drama_episodes WHERE series_id=? AND position=?').get(row.id,input.number)?.id!==(old?.id)&&db.prepare('SELECT id FROM drama_episodes WHERE series_id=? AND position=?').get(row.id,input.number))fail('이미 사용 중인 회차 번호입니다.',409);
    const episodePrice=input.number<=2?0:(input.priceNeon??3);if(!Number.isSafeInteger(episodePrice)||episodePrice<(input.number<=2?0:1)||episodePrice>1000000)fail('회차 가격은 1 이상의 정수 NEON으로 입력해주세요.');const body={title:text(input.title,120,true),description:text(input.description||'',2000),priceNeon:episodePrice},now=Date.now(),id=old?.id||crypto.randomUUID();if(old)db.prepare('UPDATE drama_episodes SET position=?,body=?,updated=? WHERE id=?').run(input.number,JSON.stringify(body),now,id);else db.prepare('INSERT INTO drama_episodes VALUES(?,?,?,?,?,?,?,?)').run(id,row.id,actor.id,input.number,JSON.stringify(body),'DRAFT',now,now);json(res,200,{id});return true;
   }
   if(name==='/api/drama/action'){
    const row=series(input.id);if(!row)fail('작품을 찾을 수 없습니다.',404);const reason=text(input.reason||'',1000);let next;
    if(['publishEpisode','unpublishEpisode'].includes(input.action)&&row.user_id===actor.id&&row.status==='PUBLISHED'){
     const ep=episode(input.episodeId);if(!ep||ep.series_id!==row.id)fail('회차를 찾을 수 없습니다.',404);const publish=input.action==='publishEpisode';if(publish&&(ep.status!=='DRAFT'||!JSON.parse(row.body).screeningRights||!media(ep).some(f=>f.kind==='video'))||!publish&&ep.status!=='PUBLISHED')fail('회차 영상을 먼저 등록해주세요.');
     db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE drama_episodes SET status=?,updated=? WHERE id=?').run(publish?'PUBLISHED':'DRAFT',Date.now(),ep.id);record(row,actor,input.action+':'+ep.id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}json(res,200,{ok:true});return true;
    }
    if(input.action==='publish'&&row.user_id===actor.id&&row.status==='DRAFT'){
     const eps=db.prepare('SELECT * FROM drama_episodes WHERE series_id=? ORDER BY position').all(row.id);if(!JSON.parse(row.body).screeningRights||!eps.length||eps.some(e=>!media(e).some(f=>f.kind==='video')))fail('상영 권한 확인과 각 회차 영상을 준비해주세요.');next='PUBLISHED';
    }else if(input.action==='unpublish'&&row.user_id===actor.id&&['PUBLISHED','REVIEW'].includes(row.status))next='DRAFT';
    else if(admin(actor)&&input.action==='hide'&&row.status==='PUBLISHED'&&reason)next='DRAFT';
    else fail('현재 상태에서 처리할 수 없습니다.',409);
    db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE drama_series SET status=?,updated=? WHERE id=?').run(next,Date.now(),row.id);db.prepare('UPDATE drama_episodes SET status=?,updated=? WHERE series_id=?').run(next,Date.now(),row.id);record(row,actor,input.action,reason);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}json(res,200,{ok:true,status:next});return true;
   }
   fail('요청한 화면을 찾을 수 없습니다.',404);
  }catch(error){if(res.headersSent){res.destroy();return true;}json(res,error.status||400,{error:error.status?error.message:'파일 또는 입력 내용을 확인해주세요.'});return true;}
 }
 return {handle};
};
module.exports.caption=caption;
