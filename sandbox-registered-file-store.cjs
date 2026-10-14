// Opt-in TEST registered bytes, in the same PostgreSQL DB as account metadata.
const crypto=require('node:crypto'),stores=new WeakSet();
const sql=`CREATE SCHEMA nnx_registered_files_test;
CREATE TABLE nnx_registered_files_test.version(id INTEGER PRIMARY KEY,checksum TEXT NOT NULL);
CREATE TABLE nnx_registered_files_test.bytes(id TEXT PRIMARY KEY REFERENCES public.creator_files(id),asset_id TEXT NOT NULL,user_id TEXT NOT NULL,size INTEGER NOT NULL CHECK(size>0 AND size<=1048576),sha TEXT NOT NULL,data BYTEA NOT NULL,CHECK(octet_length(data)=size));`;
const checksum=crypto.createHash('sha256').update(sql).digest('hex'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function create(db,config,context){require('./sandbox-external-test-context.cjs').assert(config,context);
 const identity=db.prepare('SELECT current_database() AS name,current_user AS actor').get();if(identity.name!==config.database||identity.actor!=='nnx_sandbox')throw Error('REGISTERED_FILE_DATABASE_MISMATCH');
 const markers=db.prepare('SELECT marker FROM public.sandbox_environment').all();if(markers.length!==1||markers[0].marker!=='NNX_REAL_PG_SANDBOX_V1')throw Error('REGISTERED_FILE_SANDBOX_REQUIRED');
 function guard(){const v=db.prepare('SELECT * FROM nnx_registered_files_test.version ORDER BY id').all();if(v.length!==1||v[0].id!==1||v[0].checksum!==checksum)throw Error('REGISTERED_FILE_VERSION_MISMATCH');}
 db.exec('BEGIN');try{db.prepare('SELECT pg_advisory_xact_lock(771106101)').get();if(!db.prepare("SELECT to_regnamespace('nnx_registered_files_test') AS n").get().n){db.exec(sql);db.prepare('INSERT INTO nnx_registered_files_test.version VALUES(1,?)').run(checksum);}guard();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 const store={maxFileBytes:1048576,backend:'TEST_PG_BYTES',
  put(f,data){guard();data=Buffer.from(data);if(!data.length||data.length>1048576||data.length!==f.size)throw Error('REGISTERED_FILE_LIMIT');db.prepare('INSERT INTO nnx_registered_files_test.bytes VALUES(?,?,?,?,?,?)').run(f.id,f.asset_id,f.user_id,data.length,hash(data),data);},
  read(f){guard();const r=db.prepare('SELECT * FROM nnx_registered_files_test.bytes WHERE id=? AND asset_id=? AND user_id=?').get(f.id,f.asset_id,f.user_id);if(!r)throw Error('REGISTERED_FILE_UNAVAILABLE');const data=Buffer.from(r.data);if(data.length!==f.size||r.size!==f.size||hash(data)!==r.sha)throw Error('REGISTERED_FILE_CORRUPT');return data;}};
 stores.add(store);return store;
}
function assert(store){if(!stores.has(store))throw Error('VERIFIED_REGISTERED_STORE_REQUIRED');}
module.exports={create,assert};
