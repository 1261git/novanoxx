'use strict';
module.exports=function({engine,gate,intervalMs=60000,onError=()=>{}}){
 if(typeof engine?.tick!=='function'||typeof gate?.runTask!=='function'||!Number.isSafeInteger(intervalMs)||intervalMs<1)throw Error('ENGINE_WORKER_GATE_REQUIRED');let timer=null,pending=null,stopped=false;
 function tick(){if(stopped)return Promise.resolve({skipped:'STOPPED'});if(pending)return pending;pending=Promise.resolve().then(()=>gate.runTask(async()=>engine.tick())).finally(()=>{pending=null;});return pending;}
 function start(){if(stopped||timer)return;timer=setInterval(()=>tick().catch(onError),intervalMs);timer.unref();tick().catch(onError);}
 async function stop(){stopped=true;if(timer)clearInterval(timer);timer=null;await pending;}
 return {start,stop,tick};
};
