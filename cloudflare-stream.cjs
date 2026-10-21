'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const UID=/^[a-f0-9]{32}$/i;
const problem=(message,status=503)=>Object.assign(Error(message),{status});
module.exports=function({account=process.env.NNX_STREAM_ACCOUNT_ID,token=process.env.NNX_STREAM_API_TOKEN,webhookSecret=process.env.NNX_STREAM_WEBHOOK_SECRET,enabled=process.env.NNX_STREAM_ENABLED==='1',origin,dir,fetcher=fetch,now=Date.now}={}){
 const ready=()=>enabled&&UID.test(account||'')&&!!token;
 let usageCache=null,storageCache=null;
 async function call(suffix,options={}){
  if(!ready())throw problem('Cloudflare Stream 연결 설정이 필요합니다.');
  const {allowMissing,...request}=options;
  const r=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+'/stream/'+suffix,{...request,headers:{Authorization:'Bearer '+token,...request.headers},signal:AbortSignal.timeout(20000)});
  if(r.status===404&&allowMissing)return null;
  let d;try{d=await r.json();}catch{throw problem('영상 서비스 응답을 확인해주세요.');}
  if(!r.ok||d.success!==true)throw problem('영상 서비스 연결 또는 사용 한도를 확인해주세요.');return d.result;
 }
 async function storage(force=false){if(!force&&storageCache&&now()-storageCache.at<60000)return storageCache.value;const d=await call('storage-usage');if(!Number.isFinite(d?.totalStorageMinutes)||!Number.isFinite(d?.totalStorageMinutesLimit))throw problem('영상 사용량을 확인할 수 없습니다.');storageCache={at:now(),value:d};return d;}
 async function create({bytes,reservedSeconds=1200,pendingMinutes=0}){
  if(dir&&!webhookSecret)throw problem('영상 처리 알림 연결을 확인해주세요.');
  const s=await storage(true);if(s.totalStorageMinutes+reservedSeconds/60+pendingMinutes>Math.min(1000,s.totalStorageMinutesLimit))throw problem('영상 저장 용량 한도에 도달했습니다.',409);
  const metadata='maxDurationSeconds '+Buffer.from(String(reservedSeconds)).toString('base64')+',requiresignedurls,allowedorigins '+Buffer.from(new URL(origin).hostname).toString('base64')+',expiry '+Buffer.from(new Date(now()+3600000).toISOString()).toString('base64');
  const r=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+'/stream?direct_user=true',{method:'POST',headers:{Authorization:'Bearer '+token,'Tus-Resumable':'1.0.0','Upload-Length':String(bytes),'Upload-Metadata':metadata},signal:AbortSignal.timeout(20000)});
  const uploadURL=r.headers.get('location'),uid=r.headers.get('stream-media-id');let u;try{u=new URL(uploadURL);}catch{}
  if(!r.ok||!UID.test(uid||'')||!u||u.protocol!=='https:'||!['upload.videodelivery.net','upload.cloudflarestream.com'].includes(u.hostname))throw problem('영상 업로드 연결을 확인해주세요.');
  await call(uid,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requireSignedURLs:true,allowedOrigins:[new URL(origin).hostname]})});
  storageCache=null;return {uid,uploadURL};
 }
 async function video(uid){if(!UID.test(uid||''))throw problem('영상 정보를 찾을 수 없습니다.',404);return call(uid);}
 async function playback(uid){const d=await video(uid);if(d.requireSignedURLs!==true||d.readyToStream!==true||!d.allowedOrigins?.includes(new URL(origin).hostname))throw problem('보호된 영상 준비 상태를 확인해주세요.',409);let host='https://videodelivery.net';if(d.playback?.hls){const source=new URL(d.playback.hls);if(source.protocol!=='https:'||!(/^(?:customer-[a-z0-9]+\.cloudflarestream\.com|videodelivery\.net)$/.test(source.hostname)))throw problem('영상 서비스 응답을 확인해주세요.');host=source.origin;}const result=await call(uid+'/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exp:Math.floor(now()/1000)+1800,downloadable:false})});if(typeof result?.token!=='string'||!/^[A-Za-z0-9_.-]+$/.test(result.token))throw problem('영상 재생 권한을 확인해주세요.');return {url:host+'/'+result.token+'/manifest/video.m3u8',expires:now()+1800000};}
 function verify(body,header){if(!webhookSecret||typeof header!=='string')return false;const parts=Object.fromEntries(header.split(',').map(x=>x.trim().split('=')));if(!/^\d+$/.test(parts.time||'')||Math.abs(now()/1000-Number(parts.time))>300||!/^[a-f0-9]{64}$/i.test(parts.sig1||''))return false;const expected=crypto.createHmac('sha256',webhookSecret).update(parts.time+'.').update(body).digest();return crypto.timingSafeEqual(expected,Buffer.from(parts.sig1,'hex'));}
 async function usage(){if(usageCache&&now()-usageCache.at<300000)return usageCache.value;const s=await storage();let minutes=null,analyticsAvailable=false;const date=new Date(now()),start=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1)).toISOString(),end=date.toISOString();
  try{const query='query($account: string!, $start: Time!, $end: Time!) { viewer { accounts(filter:{accountTag:$account}) { streamMinutesViewedAdaptiveGroups(limit:1,filter:{datetime_geq:$start,datetime_lt:$end}) { sum { minutesViewed } } } } }';const r=await fetcher('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{account,start,end}}),signal:AbortSignal.timeout(20000)});const d=await r.json(),rows=d.data?.viewer?.accounts?.[0]?.streamMinutesViewedAdaptiveGroups;if(r.ok&&!d.errors&&Array.isArray(rows)){minutes=rows.reduce((n,x)=>n+Number(x.sum.minutesViewed),0);analyticsAvailable=Number.isFinite(minutes);if(!analyticsAvailable)minutes=null;}}catch{}
  const capacity=s.totalStorageMinutesLimit,value={configured:true,webhookConnected:!!webhookSecret,periodStart:start,periodEnd:end,observedAt:now(),storageMinutes:s.totalStorageMinutes,capacityMinutes:capacity,videoCount:s.videoCount??null,deliveryMinutes:minutes,includedDeliveryMinutes:5000,billableDeliveryMinutes:minutes===null?null:Math.max(0,minutes-5000),analyticsAvailable,storageMonthlyUsd:Math.max(5,Math.ceil(capacity/1000)*5),deliveryEstimatedUsd:minutes===null?null:Math.max(0,minutes-5000)/1000,estimatedTotalUsd:minutes===null?null:Math.max(5,Math.ceil(capacity/1000)*5)+Math.max(0,minutes-5000)/1000,storageWarning:s.totalStorageMinutes>=800,deliveryWarning:minutes!==null&&minutes>=5000,dashboard:'https://dash.cloudflare.com/'+account+'/stream/analytics',billing:'https://dash.cloudflare.com/'+account+'/billing'};usageCache={at:now(),value};return value;
 }
 async function connectWebhook(){
  if(!ready()||!dir)return;
  const notificationUrl=origin+'/api/drama/stream/webhook';
  let current=await call('webhook',{allowMissing:true});
  if(current?.notificationUrl&&current.notificationUrl!==notificationUrl)throw problem('영상 처리 알림 연결을 확인해주세요.');
  if(!current?.notificationUrl)current=await call('webhook',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({notificationUrl})});
  if(current?.notificationUrl!==notificationUrl||typeof current.secret!=='string'||!current.secret)throw problem('영상 처리 알림 연결을 확인해주세요.');
  // This recovery copy stays on the approved production persistent disk, never in source or local workstation files.
  const file=path.join(dir,'drama-stream-webhook-'+account+'.json'),payload=JSON.stringify({account,notificationUrl,secret:current.secret});
  if(fs.existsSync(file)){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw problem('영상 처리 알림 연결을 확인해주세요.');if(fs.readFileSync(file,'utf8')!==payload)fs.copyFileSync(file,file+'.previous-'+now(),fs.constants.COPYFILE_EXCL);}
  fs.writeFileSync(file,payload,{mode:0o600});webhookSecret=current.secret;usageCache=null;
 }
 const initialization=ready()&&dir?connectWebhook().catch(()=>console.error('NNX_STREAM_WEBHOOK_CONNECTION_PENDING')):Promise.resolve();
 return {ready,create,video,playback,verify,usage,storage,initialize:()=>initialization};
};
