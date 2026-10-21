'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{create,rename}=require('./assets/demo-creators.js');
test('example creators group only immutable example data and never match real members by name',()=>{
 const input=[{id:1,creator:'Same name',img:'one'},{id:3,creator:'Same name',sold:true,clip:'preview.mp4'},{id:8,creator:'Other',sold:true,img:'eight'},{id:1001,creator:'Same name',published:true,creatorPublicId:'real-uuid'}],before=JSON.stringify(input),d=create(input);
 assert.equal(d.href(input[0]),'#/creator?demo=demo-1');assert.equal(d.href(input[3]),'#/creator?id=real-uuid');assert.equal(d.data('demo-1').profile.isDemo,true);assert.deepEqual(d.data('demo-1').assets.map(a=>a.id),[1,3]);assert.equal(d.data('demo-1').assets[0].imgUrl,'assets/one.jpg');assert.equal(d.data('demo-1').assets[1].clipUrl,'assets/preview.mp4');assert.equal(d.list().length,2);assert.deepEqual(d.list().find(c=>c.demoId==='demo-1'),{demoId:'demo-1',displayName:'Same name',activeCount:1,soldCount:1});assert.equal(d.data('real-uuid'),null);assert.equal(d.data('demo-1001'),null);assert.equal(JSON.stringify(input),before);
 rename(input,{publicId:'real-uuid',displayName:'Updated real name'});assert.equal(input[3].creator,'Updated real name');assert.equal(input[0].creator,'Same name');assert.equal(d.data('demo-1').profile.displayName,'Same name');assert.deepEqual(d.data('demo-1').assets.map(a=>a.creator),['Same name','Same name']);
 rename(input,{displayName:'Missing identity'});assert.equal(input[0].creator,'Same name');
});
