'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('15% migration preserves data and rejects a non-empty legacy ledger',()=>{
 const dir=fs.mkdtempSync(path.resolve('../novanoxx-stage10-evidence-20261017/fee254-migration-'));
 const db=new(require('./database/postgres.cjs'))({pglite:true,pglitePath:path.join(dir,'pg')});
 try{
 db.exec("CREATE SCHEMA nnx_operating_v1;CREATE TABLE nnx_operating_v1.schema_version(version text PRIMARY KEY);CREATE TABLE nnx_operating_v1.orders(id text PRIMARY KEY,amount_krw bigint,fee_krw bigint,CHECK(fee_krw=floor(amount_krw::numeric*12/100)));INSERT INTO nnx_operating_v1.orders VALUES('old',1000,120);");
 const sql=fs.readFileSync('database/010-sale-fee-15.sql','utf8');
 assert.throws(()=>db.exec(sql),/FEE_15_REQUIRES_EMPTY_OPERATING_LEDGER/);db.exec('ROLLBACK');
 assert.equal(Number(db.prepare('SELECT fee_krw FROM nnx_operating_v1.orders').get().fee_krw),120);
 db.exec("DELETE FROM nnx_operating_v1.orders WHERE id='old'");
 db.exec(sql);db.exec(sql);
 db.exec("INSERT INTO nnx_operating_v1.orders VALUES('new',1000,150)");
 assert.equal(Number(db.prepare('SELECT fee_krw FROM nnx_operating_v1.orders').get().fee_krw),150);
 assert.throws(()=>db.exec("INSERT INTO nnx_operating_v1.orders VALUES('wrong',1000,120)"));
 assert.equal(db.prepare('SELECT count(*) n FROM nnx_operating_v1.orders').get().n,1);
 }finally{db.close();}
});
test('all current public fee guides and translations say 15% / 85%',()=>{
 for(const f of ['assets/about-faq.js','assets/creator-workspace.js','assets/english-guides.js','assets/ui-translations.js','assets/ui-translations-extra.js','page-routing.js']){
 const s=fs.readFileSync(f,'utf8');assert.ok(s.includes('15%'),f);assert.doesNotMatch(s,/(?:12|88)\s*[%％]/,f);
 }
 assert.equal(require('./sale-policy.cjs').fee(39900).feeKrw,5985);
 assert.equal(require('./sale-policy.cjs').fee(19900).sellerNetKrw,16915);
});
