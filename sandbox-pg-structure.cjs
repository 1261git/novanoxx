// Structure/sequence comparison for a marked localhost rehearsal, not remote production.
const {Client}=require('pg'),quote=s=>'"'+s.replaceAll('"','""')+'"';
module.exports=async config=>{require('./sandbox-transition.cjs').guard(config);const c=new Client(config);await c.connect();try{await c.query('BEGIN READ ONLY');const result={};
 result.columns=(await c.query("SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,ordinal_position")).rows;
 result.constraints=(await c.query("SELECT n.nspname AS schema,t.relname AS table_name,c.conname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,3")).rows;
 result.indexes=(await c.query("SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,3")).rows;
 result.functions=(await c.query("SELECT n.nspname AS schema,p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2")).rows;
 result.triggers=(await c.query("SELECT n.nspname AS schema,t.relname AS table_name,g.tgname,pg_get_triggerdef(g.oid) AS definition FROM pg_trigger g JOIN pg_class t ON t.oid=g.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE NOT g.tgisinternal AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,3")).rows;
 result.sequences=(await c.query("SELECT schemaname,sequencename,start_value::text,min_value::text,max_value::text,increment_by::text,cycle,cache_size::text FROM pg_sequences WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2")).rows;
 for(const s of result.sequences)Object.assign(s,(await c.query('SELECT last_value::text,is_called FROM '+quote(s.schemaname)+'.'+quote(s.sequencename))).rows[0]);await c.query('COMMIT');return result;
 }finally{await c.end();}};
