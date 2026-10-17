'use strict';
module.exports=function(db){
 db.exec("CREATE TABLE IF NOT EXISTS asset_publication_policy(asset_id TEXT PRIMARY KEY,visibility TEXT NOT NULL CHECK(visibility IN ('PUBLIC','TEST_ARCHIVE')),reason TEXT NOT NULL,updated INTEGER NOT NULL);");
 return {visible:id=>db.prepare('SELECT visibility FROM asset_publication_policy WHERE asset_id=?').get(id)?.visibility!=='TEST_ARCHIVE'};
};
