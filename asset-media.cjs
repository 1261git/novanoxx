'use strict';
const fs=require('node:fs');
const ext=f=>(f?.name||'').split('.').pop().toLowerCase();
const images=['png','jpg','jpeg','webp'],videos=['mp4','webm','mov'],audios=['mp3','wav'],texts=['txt','md','json','yaml','yml'];
function descriptor(asset,files,{owner=false}={}){
 const pick=kind=>files.find(f=>f.kind===kind),thumbnail=pick('thumbnail'),preview=pick('preview'),full=pick('detailPreview'),original=owner?pick('original'):null;
 const url=f=>(owner?'/api/auth/creator/file?id=':'/api/catalog/file?id=')+encodeURIComponent(f.id)+(owner?'&inline=1':'');
 const poster=thumbnail||files.find(f=>f.kind==='preview'&&images.includes(ext(f)));
 const f=asset.category==='VIDEO'?(full||preview||original):asset.category==='3D'&&original&&['glb','gltf'].includes(ext(original))&&(!preview||!['glb','gltf'].includes(ext(preview)))?original:(preview||original);
 if(!f)return poster?{kind:'image',url:url(poster)}:null;
 const e=ext(f),p=poster?url(poster):null;
 if(videos.includes(e))return {kind:'video',url:url(f),poster:p||url(f)+'&poster=1'};
 if(audios.includes(e))return {kind:'audio',url:url(f),poster:p};
 if(images.includes(e))return {kind:'image',url:p||url(f)};
 if(e==='pdf')return {kind:'image',url:url(f)+'&poster=1'};
 if(['glb','gltf'].includes(e))return {kind:'model',url:url(f),poster:p};
 if(texts.includes(e))return {kind:'text',url:url(f)+'&sample=1',poster:p};
 return p?{kind:'image',url:p}:null;
}
// Only embedded, bounded glTF resources. Never fetch URLs or adjacent server files.
function validateModel(bytes,extension){
 if(!Buffer.isBuffer(bytes)||bytes.length>24*1024*1024)throw Error('MODEL_LIMIT');let doc,bin=0;
 if(extension==='glb'){
  if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('MODEL_FORMAT');
  let offset=12;while(offset<bytes.length){if(offset+8>bytes.length)throw Error('MODEL_FORMAT');const n=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);offset+=8;if(n%4||offset+n>bytes.length)throw Error('MODEL_FORMAT');if(type===0x4e4f534a&&!doc)doc=JSON.parse(bytes.subarray(offset,offset+n).toString('utf8').trim());else if(type===0x004e4942)bin+=n;else throw Error('MODEL_FORMAT');offset+=n;}
 }else if(extension==='gltf')doc=JSON.parse(bytes.toString('utf8'));else throw Error('MODEL_FORMAT');
 if(doc?.asset?.version!=='2.0'||!Array.isArray(doc.meshes)||!doc.meshes.length||doc.meshes.length>2000)throw Error('MODEL_FORMAT');
 if((doc.extensionsRequired||[]).some(x=>/draco|basisu|meshopt/i.test(x))||(doc.extensionsUsed||[]).some(x=>/draco|basisu|meshopt/i.test(x)))throw Error('MODEL_COMPRESSED');
 let nodes=0;function walk(v,depth=0){if(++nodes>200000||depth>50)throw Error('MODEL_LIMIT');if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(k==='uri'&&(typeof x!=='string'||!/^data:(?:application\/(?:octet-stream|gltf-buffer)|image\/(?:png|jpeg|webp));base64,[A-Za-z0-9+/]*={0,2}$/.test(x)))throw Error('MODEL_EXTERNAL_RESOURCE');walk(x,depth+1);}}
 walk(doc);for(const b of doc.buffers||[]){if(!Number.isSafeInteger(b.byteLength)||b.byteLength<0||b.byteLength>24*1024*1024||(!b.uri&&(extension!=='glb'||b.byteLength>bin)))throw Error('MODEL_BUFFER');}return doc;
}
function textSample(bytes){if(bytes.length>1024*1024)throw Error('TEXT_LIMIT');const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');return text.slice(0,4000);}
async function serve(req,res,f,file,{owner=false}={}){
 const e=f.ext||ext(f),headers={'Cache-Control':owner?'private, no-store':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"};
 try{
 if((['glb','gltf'].includes(e)&&fs.statSync(file).size>24*1024*1024)||(texts.includes(e)&&fs.statSync(file).size>1024*1024))throw Error('MEDIA_LIMIT');
 if(['glb','gltf'].includes(e))validateModel(fs.readFileSync(file),e);
 if(texts.includes(e)){const body=Buffer.from(textSample(fs.readFileSync(file)));res.writeHead(200,{...headers,'Content-Type':'text/plain; charset=utf-8','Content-Length':body.length});res.end(body);return;}
 const mime={glb:'model/gltf-binary',gltf:'model/gltf+json',mp3:'audio/mpeg',wav:'audio/wav',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'}[e];if(!mime)throw Error('MEDIA_UNSUPPORTED');
 const size=fs.statSync(file).size;let start=0,end=size-1,status=200;const range=req.headers.range;
 if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m)throw Error('MEDIA_RANGE');start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(!Number.isSafeInteger(start)||start>end||start>=size)throw Error('MEDIA_RANGE');status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;}
 res.writeHead(status,{...headers,'Content-Type':mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes'});fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
 }catch(error){res.writeHead(error.message==='MEDIA_RANGE'?416:422,{...headers,'Content-Type':'text/plain; charset=utf-8'});res.end('미리보기 형식을 확인해주세요. GLB 또는 리소스가 포함된 GLTF를 사용해주세요.');}
}
module.exports={descriptor,validateModel,textSample,serve,images,videos,texts};
