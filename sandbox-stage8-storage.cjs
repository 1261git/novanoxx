// Local rehearsal of the cloud entrypoint only; remote/production guards remain closed.
const fs=require('node:fs'),path=require('node:path');
function prepare({localTest,stage6,runtimeRoot,policy,context}){
 if(policy===undefined)return {};
 if(context){require('./sandbox-storage-context.cjs').assertPath(context,runtimeRoot);if(stage6!==true||localTest!==context.localTest||!Number.isSafeInteger(policy.minFree)||policy.minFree<0||!Number.isSafeInteger(policy.fileBytes)||policy.fileBytes<1||policy.fileBytes>1048576||!Number.isSafeInteger(policy.totalBytes)||policy.totalBytes<policy.fileBytes)throw Error('STAGE8_POLICY_REQUIRED');return {pgFileQuota:{fileBytes:policy.fileBytes,totalBytes:policy.totalBytes},home:{storageContext:context,pgBudgetFactory:db=>require('./sandbox-managed-pg-budget.cjs').create(db,context,{maxBytes:policy.databaseMaxBytes??512*1048576,minHeadroom:policy.databaseHeadroomBytes??64*1048576}),...(process.platform==='linux'?{previewConverterFactory:dir=>require('./sandbox-preview-converter.cjs').create(dir,{context})}:{}),volumeBudgetFactory:(_db,dir)=>require('./sandbox-volume-budget.cjs').create(dir,{context,minFree:policy.minFree,videoSlots:policy.videoSlots??1,availableBytes:policy.availableBytes}),contestDiskPolicyFactory:(_db,dir)=>require('./sandbox-contest-disk.cjs').create(dir,{context,minFree:policy.minFree,availableBytes:policy.availableBytes})}};}
 if(localTest!==true||stage6!==true)throw Error('LOCAL_STAGE8_STORAGE_REQUIRED');
 const base=fs.realpathSync(path.join(__dirname,'.sandbox-commerce')),root=path.resolve(runtimeRoot);
 if(!root.startsWith(base+path.sep))throw Error('STAGE8_RUNTIME_REQUIRED');
 let cursor=base;
 for(const part of path.relative(base,root).split(path.sep)){cursor=path.join(cursor,part);if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('STAGE8_RUNTIME_SYMLINK_DENIED');}
 const {minFree,fileBytes,totalBytes,availableBytes}=policy;
 if(!Number.isSafeInteger(minFree)||minFree<0||!Number.isSafeInteger(fileBytes)||fileBytes<1||fileBytes>1048576||!Number.isSafeInteger(totalBytes)||totalBytes<fileBytes||availableBytes!==undefined&&typeof availableBytes!=='function')throw Error('STAGE8_POLICY_REQUIRED');
 return {pgFileQuota:{fileBytes,totalBytes},
  home:{volumeBudgetFactory:(_db,dir)=>require('./sandbox-volume-budget.cjs').create(dir,{minFree,availableBytes}),contestDiskPolicyFactory:(_db,dir)=>require('./sandbox-contest-disk.cjs').create(dir,{minFree,availableBytes})}};
}
module.exports={prepare};
