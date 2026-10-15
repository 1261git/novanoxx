// Independent GitHub runner: reads only status, records trust hashes, never payloads.
const SERVICE='srv-db5aqunlk1mc739bi0m0',URL='https://novanoxx.onrender.com/api/backup/status';
function check(value,now=Date.now()){
 if(value?.version!==1||value.service!==SERVICE||!Array.isArray(value.problems)||!Array.isArray(value.receipts)||value.receipts.length>35||!Number.isFinite(Date.parse(value.checkedAt))||Math.abs(now-Date.parse(value.checkedAt))>300000)throw Error('BACKUP_MONITOR_RESPONSE_INVALID');
 const receipts=value.receipts.map(r=>{if(!/^[a-f0-9-]{36}$/.test(r.id||'')||!/^[a-f0-9]{64}$/.test(r.indexAnchor||'')||!['daily','weekly'].includes(r.kind)||r.prefix!=='bundles/automated-v1/'+r.kind+'/'+r.id+'/'||!Number.isFinite(Date.parse(r.createdAt)))throw Error('BACKUP_MONITOR_RECEIPT_INVALID');return {id:r.id,indexAnchor:r.indexAnchor,createdAt:r.createdAt,kind:r.kind};});
 if(value.problems.some(p=>!/^([A-Z][A-Z0-9_]{0,79})$/.test(p)))throw Error('BACKUP_MONITOR_PROBLEM_INVALID');
 const age=now-Date.parse(value.lastSuccessAt);
 return {receipts,healthy:value.healthy===true&&value.problems.length===0&&receipts.length>0&&age>=-300000&&age<=26*3600000,problems:value.problems};
}
async function monitor({token,request=fetch,now=Date.now()}={}){
 if(!/^[A-Za-z0-9_-]{43,128}$/.test(token||''))throw Error('BACKUP_MONITOR_SECRET_REQUIRED');
 const response=await request(URL,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(![200,503].includes(response.status))throw Error('BACKUP_MONITOR_HTTP_FAILED');
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>32768)throw Error('BACKUP_MONITOR_RESPONSE_LIMIT');chunks.push(chunk);}return check(JSON.parse(Buffer.concat(chunks).toString('utf8')),now);
}
module.exports={check,monitor};
if(require.main===module)(async()=>{try{const result=await monitor({token:process.env.NNX_BACKUP_MONITOR_TOKEN});for(const r of result.receipts)console.log('NNX_INDEPENDENT_BACKUP_TRUST '+JSON.stringify(r));if(!result.healthy)throw Error('BACKUP_MONITOR_ALERT '+result.problems.join(','));console.log('BACKUP_MONITOR_HEALTHY');}catch(e){console.error(/^(BACKUP_MONITOR_[A-Z_]+)(?: [A-Z_,]*)?$/.test(e.message)?e.message:'BACKUP_MONITOR_UNAVAILABLE');process.exitCode=1;}})();
