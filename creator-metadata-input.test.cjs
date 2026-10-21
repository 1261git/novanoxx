'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),schema=require('./assets/creator-metadata-schema.js');
test('all category numeric inputs share positive server rules and integer step base is aligned',()=>{
 let integers=0,decimals=0;for(const [category,fields]of Object.entries(schema.fields))for(const [key,,type]of fields){if(type==='text'){assert.equal(schema.validate(category,{[key]:'PNG'})[key],'PNG');continue;}const attrs=schema.numericAttributes(type);assert(!attrs.includes('0.000001'));assert.equal(schema.validate(category,{[key]:3000})[key],3000);for(const value of [0,-1,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>schema.validate(category,{[key]:value}));assert.deepEqual(schema.validate(category,{[key]:''}),{});if(type==='integer'){integers++;assert(attrs.includes('min="1"'));assert(attrs.includes('step="1"'));assert.throws(()=>schema.validate(category,{[key]:29.97}));}else{decimals++;assert(attrs.includes('step="any"'));for(const value of [29.97,0.0000001])assert.equal(schema.validate(category,{[key]:value})[key],value);}}
 assert.equal(integers,7);assert.equal(decimals,4);
});
