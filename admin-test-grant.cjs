const crypto=require('node:crypto');
const targets=new Set(['a2fa373915ef5a1c21bcb6980c21c62c21e41c93aa31ac4a98623a96d47be907','9f3180ddc7c746bed59cdb94a841e88241350a909d8729e2c54cdbaf8eae90f8']);
module.exports=function(db){
 db.exec('CREATE TABLE IF NOT EXISTS neon_test_grants(campaign TEXT NOT NULL,user_id TEXT NOT NULL,neon INTEGER NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(campaign,user_id))');
 db.exec('BEGIN IMMEDIATE');try{
 for(const u of db.prepare('SELECT id,email FROM users').all()){
 if(!targets.has(crypto.createHash('sha256').update(u.email.trim().toLowerCase()).digest('hex')))continue;
 const r=db.prepare('INSERT OR IGNORE INTO neon_test_grants VALUES(?,?,?,?)').run('admin-test-2026-10-11-1000',u.id,1000,Date.now());
 if(r.changes)db.prepare('INSERT INTO neon_test_wallet(user_id,balance) VALUES(?,1000) ON CONFLICT(user_id) DO UPDATE SET balance=balance+1000').run(u.id);
 }db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
};
