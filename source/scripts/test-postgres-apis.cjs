const fs=require('node:fs'),{spawnSync}=require('node:child_process');
for(const name of ['creator-api','contest-api','neon-payments','original-access']){
 let source=fs.readFileSync(name+'.test.cjs','utf8').replace(/\{DatabaseSync\}=require\('node:sqlite'\)/g,"{DatabaseSync}=({DatabaseSync:class extends require('./database/postgres.cjs'){constructor(){super({pglite:true})}}})");
 const output=name+'.postgres.generated.cjs';fs.writeFileSync(output,source);const result=spawnSync(process.execPath,['--test',output],{encoding:'utf8',timeout:90000});console.log(result.stdout,result.stderr);fs.unlinkSync(output);if(result.status!==0)process.exitCode=1;
}
