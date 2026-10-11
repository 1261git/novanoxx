const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const Postgres=require('./database/postgres.cjs');
test('Full existing schema migrates losslessly, retains SQLite backup, and restarts without recopying',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nnx-migrate-'));const source=path.join(dir,'accounts.sqlite');
 const setup=spawnSync(process.execPath,['-e',`require('./auth.cjs');const db=new(require('node:sqlite').DatabaseSync)(process.env.DATA_DIR+'/accounts.sqlite');db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('migration-user','migration@example.com','User','salt','hash');db.prepare('INSERT INTO account_status VALUES(?,?,?)').run('migration-user','Free',125);db.close();`],{cwd:__dirname,env:{...process.env,DATA_DIR:dir,DATABASE_BACKEND:'sqlite'},encoding:'utf8'});assert.equal(setup.status,0,setup.stderr);
 const options={pglite:true,pglitePath:path.join(dir,'pg'),migrateSource:source};let db=new Postgres(options);
 try{assert.equal(db.prepare('SELECT neon_balance FROM account_status WHERE user_id=?').get('migration-user').neon_balance,125);assert.equal(db.prepare('SELECT name FROM users WHERE id=?').get('migration-user').name,'User');const manifest=JSON.parse(db.prepare('SELECT manifest FROM nnx_migrations').get().manifest);assert.ok(Object.keys(manifest.tables).length>10);assert.equal(manifest.tables.users.count,1);assert.equal(fs.readdirSync(path.join(dir,'backups')).filter(p=>p.endsWith('.sqlite')).length,1);db.prepare('UPDATE account_status SET neon_balance=? WHERE user_id=?').run(126,'migration-user');}finally{db.close()}
 db=new Postgres(options);try{assert.equal(db.prepare('SELECT neon_balance FROM account_status').get().neon_balance,126);assert.equal(fs.readdirSync(path.join(dir,'backups')).filter(p=>p.endsWith('.sqlite')).length,1);}finally{db.close()}
 fs.rmSync(dir,{recursive:true,force:true});
});
