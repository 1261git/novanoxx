'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function({db,dir,store,usage,order,tx,event}){
 const folder=require('./engine-private-store.cjs')({dir,location:path.join(store.root,'order-private')});
 db.exec('CREATE TABLE IF NOT EXISTS engine_order_attachments(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,actor TEXT NOT NULL,purpose TEXT NOT NULL,name TEXT NOT NULL,size INTEGER NOT NULL,digest TEXT NOT NULL,request_id TEXT NOT NULL,UNIQUE(actor,request_id));');
 const fail=code=>{throw Error(code);};
 function writable(actor,i){const o=order(actor,i.orderId);if(!['MATERIALS','MESSAGE'].includes(i.purpose))fail('INVALID_INPUT');if(i.purpose==='MATERIALS'&&(o.buyer!==actor||o.status!=='PAID'||o.materials)||i.purpose==='MESSAGE'&&!['PAID','IN_PROGRESS','PREVIEW_READY','REVIEW_PAUSED'].includes(o.status))fail('INVALID_STATE');return o;}
 function validate(actor,o,purpose,ids=[]){if(!Array.isArray(ids)||ids.length>10||new Set(ids).size!==ids.length)fail('INVALID_INPUT');return ids.map(id=>{const f=db.prepare('SELECT * FROM engine_order_attachments WHERE id=? AND order_id=? AND actor=? AND purpose=?').get(id,o.id,actor,purpose);if(!f)fail('ACCESS_DENIED');folder.read(f);return {id:f.id,name:f.name,size:f.size};});}
 function state(actor,o){order(actor,o.id);const rows=db.prepare("SELECT kind,detail FROM engine_events WHERE order_id=? AND kind IN ('SUBMIT','MESSAGE') ORDER BY created,id").all(o.id);return rows.flatMap(r=>JSON.parse(r.detail).attachments||[]);}
 async function upload(actor,req,i){writable(actor,i);if(!/^[a-f0-9-]{36}$/i.test(i.requestId||'')||typeof i.name!=='string'||!i.name.trim()||i.name.length>120||/[\\/\x00-\x1f]/.test(i.name))fail('INVALID_INPUT');const prior=db.prepare('SELECT * FROM engine_order_attachments WHERE actor=? AND request_id=?').get(actor,i.requestId),id=prior?.id||crypto.randomUUID(),hash=crypto.createHash('sha256');let size=0,file,committed=false;
  try{if(!prior)file=await fs.promises.open(folder.file(id),'wx',0o600);for await(const chunk of req){size+=chunk.length;if(size>300*1024*1024||!prior&&usage()+chunk.length>700*1024*1024)fail('FILE_LIMIT');hash.update(chunk);if(file)await file.write(chunk);}if(file){await file.sync();await file.close();file=null;}const digest=hash.digest('hex');if(!size)fail('INVALID_INPUT');if(prior){if(prior.order_id!==i.orderId||prior.purpose!==i.purpose||prior.name!==i.name||Number(prior.size)!==size||prior.digest!==digest)fail('REQUEST_CONFLICT');folder.read(prior);return {fileId:id};}
   tx(()=>{writable(actor,i);if(usage()>700*1024*1024)fail('FILE_LIMIT');db.prepare('INSERT INTO engine_order_attachments VALUES(?,?,?,?,?,?,?,?)').run(id,i.orderId,actor,i.purpose,i.name,size,digest,i.requestId);event(i.orderId,actor,'ATTACHMENT_STAGED',{fileId:id,size,purpose:i.purpose});});committed=true;return {fileId:id};
  }finally{await file?.close().catch(()=>{});if(!prior&&!committed)await fs.promises.unlink(folder.file(id)).catch(()=>{});}
 }
 function download(actor,id){const f=db.prepare('SELECT * FROM engine_order_attachments WHERE id=?').get(id);if(!f)fail('ACCESS_DENIED');const o=order(actor,f.order_id);if(!state(actor,o).some(a=>a.id===id))fail('ACCESS_DENIED');return {name:f.name,data:folder.read(f)};}
 return {upload,download,validate,state};
};
