'use strict';
module.exports=function({db,member,request,clock}){
 const version='DISCOVERY_ACCOUNT_120_V1';
 db.exec('CREATE TABLE IF NOT EXISTS engine_discovery_preferences(actor TEXT PRIMARY KEY,allowed INTEGER NOT NULL,version TEXT NOT NULL,updated INTEGER NOT NULL);');
 function erase(actor){const rows=db.prepare('SELECT id FROM engine_discovery_events WHERE actor=?').all(actor);for(const row of rows)db.prepare('DELETE FROM engine_requests WHERE actor=? AND id=?').run(actor,row.id);return db.prepare('DELETE FROM engine_discovery_events WHERE actor=?').run(actor).changes;}
 function state(actor){member(actor);const row=db.prepare('SELECT * FROM engine_discovery_preferences WHERE actor=?').get(actor);return {version,allowed:row?.allowed===1&&row.version===version,retentionDays:120,accountLinked:true,ipCollected:false,updated:row?.updated||null,records:Number(db.prepare('SELECT COUNT(*) n FROM engine_discovery_events WHERE actor=?').get(actor).n)};}
 function check(actor){if(!state(actor).allowed)throw Error('DISCOVERY_PERMISSION_REQUIRED');}
 function act(actor,i){return request(actor,i,()=>{if(Object.keys(i).some(k=>!['requestId','action','version','allowed'].includes(k))||i.version!==version||!['preference','erase'].includes(i.action)||i.action==='preference'&&typeof i.allowed!=='boolean')throw Error('INVALID_INPUT');let deleted=0;if(i.action==='erase'||!i.allowed)deleted=erase(actor);if(i.action==='preference')db.prepare('INSERT INTO engine_discovery_preferences VALUES(?,?,?,?) ON CONFLICT(actor) DO UPDATE SET allowed=excluded.allowed,version=excluded.version,updated=excluded.updated').run(actor,Number(i.allowed),version,clock());return {deleted,allowed:state(actor).allowed};});}
 return {state,check,act,erase,version};
};
