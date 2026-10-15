// Linux TEST runtime installed by the Docker build; temporary outputs are not storage.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function create(config,context,scratchRoot){
 require('./sandbox-external-test-context.cjs').assert(config,context);if(process.platform!=='linux')throw Error('LINUX_TEST_RUNTIME_REQUIRED');
 const executable=fs.realpathSync('/usr/bin/ffmpeg'),font=fs.realpathSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
 const manifest=JSON.parse(fs.readFileSync('/opt/nnx-media/runtime.json'));if(manifest.environment!=='NNX_LINUX_TEST_VIDEO_V1')throw Error('LINUX_MEDIA_MANIFEST_REQUIRED');
 const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const validate=()=>{if(hash(executable)!==manifest.binarySha256||hash(font)!==manifest.fontSha256)throw Error('LINUX_MEDIA_RUNTIME_CHANGED');};validate();fs.mkdirSync(scratchRoot,{recursive:true});
 return async(final,{orderId})=>{validate();return require('./sandbox-video-core.cjs')(final,{executable,scratchRoot,fontFilterPath:font,orderId,supervise:true,supervisionRoot:fs.realpathSync(scratchRoot)});};
};
