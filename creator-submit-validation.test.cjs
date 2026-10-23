'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{missing}=require('./assets/creator-submit-validation.js');
test('Submission reports precise required sections while leaving frame rate and format optional',()=>{
 const asset={category:'VIDEO',subcategory:'Commercial',title:'Title',description:'Description',deliverables:'Final MP4',contribution:'Own work',thirdPartyAssets:'no',price:10,saleMode:'MULTI',rightsConfirmed:true,usageRights:{commercial:true},contract:{mode:'MULTI',version:'2026-10-11-v1'}};
 const files=[{kind:'original'},{kind:'preview'}];assert.deepEqual(missing(asset,files),[]);
 const result=missing({...asset,description:'',contribution:'',contract:null},[{kind:'original'}]);assert.deepEqual(result.map(x=>[x.key,x.step]),[['description',1],['contribution',5],['preview',2],['contractAccepted',6]]);assert.ok(!result.some(x=>/frameRate|format/.test(x.key)));
 assert.ok(missing({...asset,rightsConfirmed:false},files).some(x=>x.key==='rightsConfirmed'));
});
