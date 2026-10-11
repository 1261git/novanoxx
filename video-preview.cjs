const {execFile}=require('node:child_process');
const run=(bin,args)=>new Promise((resolve,reject)=>execFile(bin,args,{timeout:180000,maxBuffer:1024*1024},(error,out)=>error?reject(error):resolve(out)));
module.exports=async(input,output,start,duration)=>{
 if(!Number.isFinite(start)||start<0||![4,8,12].includes(duration))throw Error('Invalid preview range');
 const info=JSON.parse(await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',input]));
 const total=Number(info.format?.duration);if(!info.streams?.some(s=>s.codec_type==='video')||!Number.isFinite(total)||start>=total||start+duration>total+0.15)throw Error('Preview range exceeds video duration');
 await run('ffmpeg',['-nostdin','-y','-ss',String(start),'-i',input,'-t',String(duration),'-map','0:v:0','-map','0:a?','-vf',"scale='min(1280,iw)':-2",'-c:v','libx264','-preset','veryfast','-crf','25','-c:a','aac','-b:a','96k','-movflags','+faststart',output]);
};
