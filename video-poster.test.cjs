'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
test('Video poster uses first frame, shares cached work, preserves source and rejects corrupt input',async()=>{
 const dir=fs.mkdtempSync(path.join(__dirname,'../novanoxx-stage10-evidence-20261017/video-poster-')),input=path.join(dir,'video.mp4'),p=require('./public-image-preview.cjs'),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 try{
 cp.execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=red:s=1280x720:d=1','-f','lavfi','-i','color=c=blue:s=1280x720:d=1','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[out]','-map','[out]','-pix_fmt','yuv420p',input],{windowsHide:true});
 const before=sha(input),[a,b]=await Promise.all([p.derivative({input,extension:'mp4',dir}),p.derivative({input,extension:'mp4',dir})]);assert.equal(a,b);assert.deepEqual(p.dimensions(fs.readFileSync(a)),{width:960,height:540});
 const rgb=cp.execFileSync('ffmpeg',['-v','error','-i',a,'-vf','format=rgb24,crop=1:1:10:10','-f','rawvideo','-'],{windowsHide:true});assert.ok(rgb[0]>150&&rgb[2]<80,'first red frame, not later blue frame');assert.equal(sha(input),before);assert.equal(await p.derivative({input,extension:'mp4',dir}),a);
 const bad=path.join(dir,'bad.mp4');fs.writeFileSync(bad,'invalid');await assert.rejects(p.derivative({input:bad,extension:'mp4',dir}));assert.equal(fs.readdirSync(path.dirname(a)).filter(n=>n.endsWith('.tmp')||n.startsWith('image-work-')).length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});


