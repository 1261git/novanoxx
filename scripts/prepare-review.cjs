'use strict';
// Explicit offline provisioning, never run from npm start. The database must already exist.
const fs=require('node:fs'),path=require('node:path'),policy=require('../review-environment.cjs');
const cfg=policy.config();
if(process.argv[2]!=='--initialize-empty-review-target')throw Error('EXPLICIT_EMPTY_REVIEW_TARGET_REQUIRED');
if(fs.existsSync(cfg.dir))throw Error('REVIEW_TARGET_DIRECTORY_MUST_BE_NEW');
if(fs.realpathSync(path.dirname(cfg.dir))!==path.dirname(cfg.dir))throw Error('REVIEW_PRIVATE_PARENT_REQUIRED');
let db;
try{
 if(cfg.database)db=new(require('../database/postgres.cjs'))({url:cfg.databaseURL});
 else {fs.mkdirSync(cfg.dir,{mode:0o700});db=new(require('node:sqlite').DatabaseSync)(path.join(cfg.dir,'accounts.sqlite'));}
 const rows=cfg.database?db.prepare("SELECT tablename AS name FROM pg_tables WHERE schemaname='public'").all():db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
 if(rows.length)throw Error('REVIEW_DATABASE_MUST_BE_EMPTY');
 db.exec('CREATE TABLE nnx_review_environment(id INTEGER PRIMARY KEY,marker TEXT NOT NULL,origin TEXT NOT NULL)');
 db.prepare('INSERT INTO nnx_review_environment VALUES(1,?,?)').run(cfg.marker,cfg.origin);
 if(cfg.database)fs.mkdirSync(cfg.dir,{mode:0o700});
 fs.writeFileSync(path.join(cfg.dir,'review-environment.json'),JSON.stringify({marker:cfg.marker,origin:cfg.origin,database:cfg.database,host:cfg.host}),{flag:'wx',mode:0o600});
 console.log('Empty isolated review target initialized; no accounts, orders, funds or files imported.');
}finally{db?.close();}
