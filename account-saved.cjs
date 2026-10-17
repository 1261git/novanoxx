'use strict';
module.exports=function createSaved({db,user,json,origin}){
 db.exec('CREATE TABLE IF NOT EXISTS account_saved_assets(user_id TEXT NOT NULL,asset_id INTEGER NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(user_id,asset_id));');
 const list=id=>db.prepare('SELECT asset_id FROM account_saved_assets WHERE user_id=? ORDER BY created,asset_id').all(id).map(r=>r.asset_id);
 function published(id){
  if(id<1001)return require('./test-purchase-assets.json').some(a=>a.id===id);
  return !!db.prepare("SELECT c.public_id FROM catalog_links c JOIN creator_assets a ON a.id=c.asset_id WHERE c.public_id=? AND a.status IN ('ACTIVE','SOLD')").get(id-1000);
 }
 return async function handleSaved(req,res,name){
  if(name!=='/api/auth/saved')return false;
  const owner=user(req);if(!owner){json(res,401,{error:'찜을 이용하려면 로그인해주세요.'});return true;}
  if(req.method==='GET'){json(res,200,{ids:list(owner.id)});return true;}
  if(req.method!=='POST'){json(res,405,{error:'지원하지 않는 요청입니다.'});return true;}
  if(req.headers.origin!==origin){json(res,403,{error:'요청 출처를 확인해주세요.'});return true;}
  if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){json(res,415,{error:'JSON 요청이 필요합니다.'});return true;}
  let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1024){json(res,413,{error:'요청이 너무 큽니다.'});return true;}chunks.push(chunk);}
  let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{json(res,400,{error:'입력값을 확인해주세요.'});return true;}
  if(!input||typeof input!=='object'||Array.isArray(input)||!Number.isSafeInteger(input.assetId)||input.assetId<1||typeof input.saved!=='boolean'){json(res,400,{error:'찜 요청을 확인해주세요.'});return true;}
  if(input.saved){if(!published(input.assetId)){json(res,404,{error:'공개된 에셋을 찾을 수 없습니다.'});return true;}db.prepare('INSERT OR IGNORE INTO account_saved_assets(user_id,asset_id,created) VALUES(?,?,?)').run(owner.id,input.assetId,Date.now());}
  else db.prepare('DELETE FROM account_saved_assets WHERE user_id=? AND asset_id=?').run(owner.id,input.assetId);
  json(res,200,{assetId:input.assetId,saved:input.saved,ids:list(owner.id)});return true;
 };
};
