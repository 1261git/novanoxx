'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
module.exports=function({dir,location=path.join(dir,'engine-files')}){
 const base=fs.realpathSync(dir),root=path.resolve(location),relative=path.relative(base,root);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('PRIVATE_STORAGE_OUTSIDE_DATA_DIR');
 let current=base;for(const part of relative.split(path.sep)){current=path.join(current,part);if(!fs.existsSync(current))fs.mkdirSync(current,{mode:0o700});if(fs.lstatSync(current).isSymbolicLink()||!fs.lstatSync(current).isDirectory())throw Error('PRIVATE_STORAGE_INVALID');}
 function file(id){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('FILE_CORRUPT');if(fs.realpathSync(root)!==root)throw Error('FILE_CORRUPT');return path.join(root,id);}
 function read(record){const name=file(record.id),st=fs.lstatSync(name);if(!st.isFile()||st.isSymbolicLink()||st.size!==Number(record.size))throw Error('FILE_CORRUPT');const data=fs.readFileSync(name);if(hash(data)!==record.digest)throw Error('FILE_CORRUPT');return data;}
 // Explicit offline copy into an empty private destination. Never removes or rewrites source objects.
 function copyVerified(records,target){const dest=module.exports({dir,location:target});if(fs.readdirSync(dest.root).length)throw Error('STORAGE_TARGET_NOT_EMPTY');const copied=[];for(const record of records){const data=read(record),name=dest.file(record.id);fs.writeFileSync(name,data,{flag:'wx',mode:0o600});dest.read(record);copied.push({id:record.id,size:data.length,digest:record.digest});}return {root:dest.root,copied,sourcePreserved:true};}
 return {root,file,read,copyVerified};
};
