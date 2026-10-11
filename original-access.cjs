module.exports=function createOriginalAccess(db){
 db.exec("CREATE TABLE IF NOT EXISTS original_entitlements(order_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,asset_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('PAID','REFUNDED','CANCELLED')),created INTEGER NOT NULL)");
 return (userId,fileId)=>db.prepare("SELECT f.* FROM creator_files f WHERE f.id=? AND f.kind='original' AND EXISTS(SELECT 1 FROM original_entitlements e WHERE e.user_id=? AND e.asset_id=f.asset_id AND e.status='PAID')").get(fileId,userId);
};
