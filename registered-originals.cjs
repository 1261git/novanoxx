'use strict';
// Collapse identical named copies in new order snapshots only. Every physical
// source is still validated by the caller and all stored records are preserved.
module.exports=originals=>{
 const seen=new Set();
 return originals.filter(file=>{
  if(typeof file.name!=='string'||!/^[a-f0-9]{64}$/i.test(file.digest||''))return true;
  const key=JSON.stringify([file.name,file.size,file.digest.toLowerCase()]);
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
};
