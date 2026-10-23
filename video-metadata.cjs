'use strict';
const {execFile}=require('node:child_process'),{promisify}=require('node:util'),run=promisify(execFile);
module.exports=async(input,extension)=>{
 if(!['mp4','mov','webm'].includes(extension))return {};
 const {stdout}=await run('ffprobe',['-v','error','-threads','1','-protocol_whitelist','file,pipe','-f',extension==='webm'?'matroska':'mov','-show_entries','format=duration:stream=codec_type,codec_name,avg_frame_rate,r_frame_rate','-of','json',input],{timeout:15000,maxBuffer:1024*1024,windowsHide:true});
 const info=JSON.parse(stdout),video=info.streams?.find(s=>s.codec_type==='video');if(!video)return {};
 const rate=String(video.avg_frame_rate||video.r_frame_rate||'').split('/'),fps=Number(rate[0])/(rate.length===2?Number(rate[1]):1),duration=Number(info.format?.duration),result={format:extension.toUpperCase()+(video.codec_name?' · '+video.codec_name.toUpperCase():'')};
 if(Number.isFinite(fps)&&fps>0)result.frameRate=Math.round(fps*1000)/1000;
 if(Number.isFinite(duration)&&duration>0)result.durationSeconds=Math.round(duration*1000)/1000;
 return result;
};
