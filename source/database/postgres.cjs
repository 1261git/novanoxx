const {Worker}=require('node:worker_threads');
const {serialize,deserialize}=require('node:v8');
const path=require('node:path');
class PostgresDatabase {
 constructor(options={}){
  this.backend='postgres';this.closed=false;this.fatal=false;
  this.worker=new Worker(path.join(__dirname,'postgres-worker.cjs'),{workerData:options});
  this.worker.on('error',()=>{this.fatal=true});this.worker.unref();
  try{this.call({operation:'ready'});}catch(error){this.worker.terminate();throw error;}
 }
 call(request){
  if(this.closed||this.fatal)throw Error('Database unavailable');
  const memory=new SharedArrayBuffer(32*1024*1024),header=new Int32Array(memory,0,2);
  this.worker.postMessage({request,memory});
  if(Atomics.wait(header,0,0,45000)==='timed-out'){this.fatal=true;this.worker.terminate();throw Error('Database timeout; connection disabled to prevent uncertain writes');}
  const response=deserialize(Buffer.from(new Uint8Array(memory,8,header[1])));
  if(response.error){const error=Error(response.error.message);error.code=response.error.code;throw error;}
  return response.value;
 }
 exec(sql){return this.call({operation:'exec',sql})}
 prepare(sql){return {get:(...params)=>this.call({operation:'get',sql,params}),all:(...params)=>this.call({operation:'all',sql,params}),run:(...params)=>this.call({operation:'run',sql,params})}}
 close(){if(this.closed)return;this.call({operation:'close'});this.closed=true;this.worker.terminate();}
}
module.exports=PostgresDatabase;
