'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),distinct=require('./registered-originals.cjs');
test('New delivery snapshots omit identical named duplicates without dropping distinct sources or mutating stored metadata',()=>{
 const a={id:'first',name:'final.mp4',size:15,digest:'a'.repeat(64)};
 const files=[a,{...a,id:'copy'},{...a,id:'third'},{...a,id:'other-name',name:'alternate.mp4'},{...a,id:'other-content',digest:'b'.repeat(64)},{...a,id:'other-size',size:16},{...a,id:'unverified',digest:null}];
 const before=JSON.stringify(files);assert.deepEqual(distinct(files).map(f=>f.id),['first','other-name','other-content','other-size','unverified']);assert.equal(JSON.stringify(files),before);assert.deepEqual(distinct([]),[]);
});
