'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');

const run=(bin,args)=>new Promise((resolve,reject)=>execFile(bin,args,{timeout:180000,maxBuffer:1024*1024,windowsHide:true},error=>error?reject(Error('PREVIEW_CONVERSION_FAILED')):resolve()));
module.exports=async function protect(input,output,extension){
 if(!['png','jpg','jpeg','webp','mp3','wav','pdf'].includes(extension))throw Error('PREVIEW_UNSUPPORTED');const release=require('./preview-work-slot.cjs')();let temp;
 try{temp=await fs.promises.mkdtemp(path.join(path.dirname(output),'preview-work-'));let source=input;
  if(extension==='pdf'){const prefix=path.join(temp,'page');await run('pdftoppm',['-f','1','-l','1','-singlefile','-scale-to','1280','-jpeg',input,prefix]);source=prefix+'.jpg';}
  if(['mp3','wav'].includes(extension)){
   await run('ffmpeg',['-nostdin','-y','-v','error','-protocol_whitelist','file,pipe','-f',extension==='wav'?'wav':'mp3','-i',source,'-f','lavfi','-i','sine=frequency=1100:sample_rate=44100:duration=30','-filter_complex',"[0:a]atrim=duration=30,asetpts=PTS-STARTPTS,volume=0.8[base];[1:a]volume='if(lt(mod(t,5),0.25),0.08,0)':eval=frame[mark];[base][mark]amix=inputs=2:duration=first:normalize=0[out]",'-map','[out]','-t','30','-ac','1','-c:a','libmp3lame','-b:a','96k','-map_metadata','-1','-f','mp3',output]);
   return {ext:'mp3',version:'audio-tone-v1',description:'audio-sample-up-to-30s-with-audible-mark'};
  }
  const logo=path.join(__dirname,'assets','novanoxx-brand-logo.png');const graph='[0:v]scale=1280:1280:force_original_aspect_ratio=decrease,pad=1280:1280:(ow-iw)/2:(oh-ih)/2:color=0x202024[base];[1:v]scale=460:-1,format=rgba,colorchannelmixer=aa=0.45[mark];[base][mark]overlay=(W-w)/2:(H-h)/2:format=auto[out]';
  const decoder=extension==='png'?'png':extension==='webp'?'webp':'mjpeg';await run('ffmpeg',['-nostdin','-y','-v','error','-protocol_whitelist','file,pipe','-f','image2','-pattern_type','none','-c:v',decoder,'-i',source,'-i',logo,'-filter_complex',graph,'-map','[out]','-frames:v','1','-q:v','5','-map_metadata','-1','-f','image2','-update','1',output]);
  return {ext:'jpg',version:'image-logo-v1',description:extension==='pdf'?'pdf-first-page-image-with-logo':'flattened-image-with-logo'};
 }finally{try{if(temp&&path.dirname(path.resolve(temp))===path.dirname(path.resolve(output))&&path.basename(temp).startsWith('preview-work-'))await fs.promises.rm(temp,{recursive:true,force:true});}finally{release();}}
};
