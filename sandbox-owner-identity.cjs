// PID namespace + boot + process start distinguish PID reuse. Unknown hosts stay held.
const fs=require('node:fs'),os=require('node:os'),crypto=require('node:crypto');
function start(pid){const text=fs.readFileSync('/proc/'+pid+'/stat','utf8');return text.slice(text.lastIndexOf(')')+2).split(' ')[19];}
function current(){if(process.platform==='linux')return {host:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),namespace:fs.readlinkSync('/proc/self/ns/pid'),start:start(process.pid),pid:process.pid,generation:crypto.randomUUID()};return {host:os.hostname(),namespace:'windows-local',start:null,pid:process.pid,generation:crypto.randomUUID()};}
function state(owner,self){if(owner.host!==self.host||owner.namespace!==self.namespace)return 'UNKNOWN_HOST';try{process.kill(owner.pid,0);if(process.platform==='linux'&&owner.start!==start(owner.pid))return 'DEAD_GENERATION';return 'ALIVE';}catch(e){return e.code==='ESRCH'||e.code==='ENOENT'?'DEAD':'UNKNOWN';}}
module.exports={current,state};
