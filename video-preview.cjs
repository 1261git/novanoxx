const {execFile}=require('node:child_process');
const path=require('node:path');
const run=(bin,args)=>new Promise((resolve,reject)=>execFile(bin,args,{timeout:180000,maxBuffer:1024*1024},(error,out)=>error?reject(error):resolve(out)));
module.exports=async(input,output,start,duration)=>{
 if(!Number.isFinite(start)||start<0||![4,8,12].includes(duration))throw Error('Invalid preview range');
 const info=JSON.parse(await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',input]));
 const total=Number(info.format?.duration);if(!info.streams?.some(s=>s.codec_type==='video')||!Number.isFinite(total)||start>=total||start+duration>total+0.15)throw Error('Preview range exceeds video duration');
 const video=info.streams.find(stream=>stream.codec_type==='video');if(!Number.isFinite(video.width)||video.width<2)throw Error('Video dimensions required');
 const width=Math.max(2,Math.min(360,Math.floor(Math.min(1280,video.width)*0.45)));
 const graph="[0:v]scale='min(1280,iw)':-2[base];[1:v]scale="+width+":-1,format=rgba,colorchannelmixer=aa=0.38[mark];[base][mark]overlay=(W-w)/2:(H-h)/2:format=auto[v]";
 await run('ffmpeg',['-nostdin','-y','-ss',String(start),'-i',input,'-i',path.join(__dirname,'assets','novanoxx-brand-logo.png'),'-t',String(duration),'-filter_complex',graph,'-map','[v]','-map','0:a?','-c:v','libx264','-pix_fmt','yuv420p','-preset','veryfast','-crf','25','-c:a','aac','-b:a','96k','-movflags','+faststart',output]);
};
