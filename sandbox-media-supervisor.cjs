// TEST worker. Owns the FFmpeg process/group until it exits; never searches other PIDs.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const base=fs.realpathSync(path.join(__dirname,'.sandbox-commerce')),input=JSON.parse(process.argv[2]||'{}');
const exe=fs.realpathSync(input.exe),log=path.resolve(input.log),folder=fs.realpathSync(path.dirname(log));
let approved=false;if(process.platform==='win32')approved=exe===fs.realpathSync(path.join(base,'work-media-runtime/ffmpeg.exe'))&&folder.startsWith(base+path.sep);else if(process.platform==='linux'){const manifest=JSON.parse(fs.readFileSync('/opt/nnx-media/runtime.json')),root=fs.realpathSync(input.jobRoot),name=path.basename(exe);approved=manifest.environment==='NNX_LINUX_TEST_VIDEO_V1'&&exe===fs.realpathSync('/usr/bin/'+name)&&['ffmpeg','ffprobe'].includes(name)&&require('node:crypto').createHash('sha256').update(fs.readFileSync(exe)).digest('hex')===(name==='ffmpeg'?manifest.binarySha256:manifest.probeSha256)&&folder.startsWith(root+path.sep);}
if(!process.connected||!approved||!path.basename(folder).startsWith('nnx-work-video-')||!Array.isArray(input.args)||input.args.some(a=>typeof a!=='string')||! /^(input-probe|encode|review-probe|preview-probe|preview-encode)\.log$/.test(path.basename(log)))throw Error('VERIFIED_MEDIA_SUPERVISOR_REQUIRED');
let child,err='',lost=false;const logFd=fs.openSync(log,'wx');
process.stdout.on('error',()=>{});process.stderr.on('error',()=>{});
const abort=()=>{if(child&&child.exitCode===null&&child.signalCode===null){if(process.platform==='linux'){try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}}else child.kill();}};
process.on('SIGTERM',()=>{lost=true;abort();});
process.on('disconnect',()=>{lost=true;abort();});process.on('message',m=>{if(m?.abort===true)abort();});
child=spawn(exe,input.args,{windowsHide:true,env:process.env,detached:process.platform==='linux'});
child.once('spawn',()=>{if(process.connected)process.send({mediaPid:child.pid,output:input.args.at(-1)},e=>{if(e){lost=true;abort();}});else{lost=true;abort();}});
child.stdout.on('data',b=>{if(!lost)process.stdout.write(b);});child.stderr.on('data',b=>{const remaining=262144-Buffer.byteLength(err);if(remaining>0)fs.writeSync(logFd,b.subarray(0,remaining));err+=b;if(err.length>262144){err=err.slice(0,262144);abort();}if(!lost)process.stderr.write(b);});
child.once('error',()=>{fs.closeSync(logFd);process.exit(1);});child.once('close',code=>{fs.closeSync(logFd);if(lost)fs.writeFileSync(path.join(folder,'owner-loss.json'),JSON.stringify({environment:'SANDBOX',reason:'OWNER_IPC_DISCONNECTED',childPid:child.pid,childClosed:true}),{flag:'wx'});process.exit(code===0&&!lost?0:1);});
