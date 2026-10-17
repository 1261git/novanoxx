module.exports=function configureIntegerTypes(pg){
 const parse=value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error('Unsafe database integer');return n;};
 pg.types.setTypeParser(20,parse);
 // PostgreSQL SUM(bigint) returns NUMERIC; upload capacity must remain numeric.
 pg.types.setTypeParser(1700,parse);
};
