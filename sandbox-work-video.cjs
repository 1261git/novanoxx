// Keep the existing Windows LOCAL TEST runtime checks unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async function convert(final,{runtime,orderId}){
 const base=fs.realpathSync(path.join(__dirname,'.sandbox-commerce')),exe=fs.realpathSync(runtime);
 if(exe!==fs.realpathSync(path.join(base,'work-media-runtime','ffmpeg.exe')))throw Error('ISOLATED_MEDIA_RUNTIME_REQUIRED');
 const manifest=JSON.parse(fs.readFileSync(path.join(path.dirname(exe),'runtime.json'),'utf8'));
 if(crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex')!==manifest.binarySha256||manifest.wheelSha256!=='02fa47c83703c37df6bfe4896aab339013f62bf02c5ebf2dce6da56af04ffc0a')throw Error('MEDIA_RUNTIME_CHANGED');
 return require('./sandbox-video-core.cjs')(final,{executable:exe,scratchRoot:base,fontFilterPath:'C\\:/Windows/Fonts/segoeui.ttf',orderId});
};