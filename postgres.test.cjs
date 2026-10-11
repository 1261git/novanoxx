const test=require('node:test'),assert=require('node:assert/strict');
const Postgres=require('./database/postgres.cjs');
test('PostgreSQL compatibility preserves rows, aliases, blobs, rollback and duplicate protection',()=>{
 const db=new Postgres({pglite:true});try{
 db.exec("PRAGMA journal_mode=WAL; CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL);CREATE TABLE catalog_links(public_id INTEGER PRIMARY KEY AUTOINCREMENT,asset_id TEXT UNIQUE NOT NULL);CREATE TABLE avatars(user_id TEXT PRIMARY KEY,data BLOB NOT NULL)");
 db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('user','user@example.com','Name','salt','hash');
 assert.equal(db.prepare('SELECT name AS displayName FROM users WHERE id=?').get('user').displayName,'Name');
 assert.equal(db.prepare("SELECT '?' AS literal,name FROM users WHERE id=?").get('user').literal,'?');
 db.prepare('INSERT OR IGNORE INTO catalog_links(asset_id) VALUES(?)').run('asset');assert.equal(db.prepare('INSERT OR IGNORE INTO catalog_links(asset_id) VALUES(?)').run('asset').changes,0);
 db.prepare('INSERT INTO avatars VALUES(?,?)').run('user',Buffer.from([0,255,128]));assert.deepEqual(Buffer.from(db.prepare('SELECT data FROM avatars').get().data),Buffer.from([0,255,128]));
 db.exec('BEGIN IMMEDIATE');db.prepare('DELETE FROM users WHERE id=?').run('user');db.exec('ROLLBACK');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);
 assert.throws(()=>db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('other','user@example.com','Name','s','h'));
 }finally{db.close()}
});
test('Real pg driver parses bigint sums numerically and rejects precision loss',()=>{const pg=require('pg');require('./database/pg-types.cjs')(pg);assert.equal(pg.types.getTypeParser(1700)('700000')+10,700010);assert.equal(pg.types.getTypeParser(20)('125'),125);assert.throws(()=>pg.types.getTypeParser(1700)('9007199254740993'));});
