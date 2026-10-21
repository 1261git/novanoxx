'use strict';
const {randomUUID}=require('node:crypto');
module.exports=function({db,json,assets}){
 db.exec('CREATE TABLE IF NOT EXISTS creator_public_links(public_id TEXT PRIMARY KEY,user_id TEXT UNIQUE NOT NULL);');
 function ensure(userId){
  let row=db.prepare('SELECT public_id FROM creator_public_links WHERE user_id=?').get(userId);
  if(!row){db.prepare('INSERT INTO creator_public_links(public_id,user_id) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING').run(randomUUID(),userId);row=db.prepare('SELECT public_id FROM creator_public_links WHERE user_id=?').get(userId);}
  return row.public_id;
 }
 function find(id){
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id||''))return null;
  return db.prepare("SELECT p.user_id,p.display_name,p.bio,p.country,p.language,v.updated AS avatar_version FROM creator_public_links l JOIN creator_profiles p ON p.user_id=l.user_id JOIN users u ON u.id=p.user_id LEFT JOIN member_restrictions r ON r.user_id=p.user_id LEFT JOIN creator_avatars v ON v.user_id=p.user_id WHERE l.public_id=? AND COALESCE(r.state,'ACTIVE') NOT IN ('SUSPENDED','WITHDRAWN')").get(id)||null;
 }
 async function handle(req,res,name){
  if(!['/api/catalog/creator','/api/catalog/creator/avatar','/api/catalog/creators'].includes(name))return false;
  if(req.method!=='GET'){json(res,405,{error:'지원하지 않는 요청이에요.'});return true;}
  if(name==='/api/catalog/creators'){
   const raw=new URL(req.url,'http://localhost').searchParams.get('offset')||'0';if(!/^\d{1,7}$/.test(raw)||Number(raw)>1000000){json(res,400,{error:'INVALID_OFFSET'});return true;}const offset=Number(raw);
   const rows=db.prepare("SELECT p.user_id,p.display_name,v.updated AS avatar_version,SUM(CASE WHEN a.status='ACTIVE' THEN 1 ELSE 0 END) AS active_count,SUM(CASE WHEN a.status='SOLD' THEN 1 ELSE 0 END) AS sold_count FROM creator_profiles p JOIN users u ON u.id=p.user_id JOIN creator_assets a ON a.user_id=p.user_id JOIN catalog_links l ON l.asset_id=a.id LEFT JOIN asset_publication_policy s ON s.asset_id=a.id LEFT JOIN member_restrictions r ON r.user_id=p.user_id LEFT JOIN creator_avatars v ON v.user_id=p.user_id WHERE a.status IN ('ACTIVE','SOLD') AND COALESCE(s.visibility,'PUBLIC')='PUBLIC' AND COALESCE(r.state,'ACTIVE') NOT IN ('SUSPENDED','WITHDRAWN') GROUP BY p.user_id,p.display_name,v.updated ORDER BY p.display_name,p.user_id LIMIT 51 OFFSET ?").all(offset);
   json(res,200,{creators:rows.slice(0,50).map(p=>{const id=ensure(p.user_id);return {publicId:id,displayName:p.display_name,activeCount:Number(p.active_count),soldCount:Number(p.sold_count),avatarUrl:p.avatar_version?'/api/catalog/creator/avatar?id='+id+'&v='+p.avatar_version:null};}),nextOffset:rows.length>50?offset+50:null});return true;
  }
  const id=new URL(req.url,'http://localhost').searchParams.get('id'),profile=find(id);
  if(!profile){json(res,404,{error:'공개 프로필을 찾을 수 없습니다.'});return true;}
  if(name.endsWith('/avatar')){
   const photo=db.prepare('SELECT data,mime FROM creator_avatars WHERE user_id=?').get(profile.user_id);
   if(!photo||!['image/png','image/jpeg','image/webp'].includes(photo.mime)){json(res,404,{error:'공개 프로필을 찾을 수 없습니다.'});return true;}
   res.writeHead(200,{'Content-Type':photo.mime,'Content-Length':photo.data.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(Buffer.from(photo.data));return true;
  }
  const items=assets(profile.user_id).map(a=>a.sold?{id:a.id,title:a.title,creator:a.creator,creatorPublicId:a.creatorPublicId,cat:a.cat,subcategory:a.subcategory,sold:true,imgUrl:a.imgUrl,clip:a.clip,clipUrl:a.clipUrl,previewDuration:a.previewDuration}:a);
  json(res,200,{profile:{publicId:id,displayName:profile.display_name,bio:profile.bio,country:profile.country,language:profile.language,avatarUrl:profile.avatar_version?'/api/catalog/creator/avatar?id='+encodeURIComponent(id)+'&v='+profile.avatar_version:null},assets:items});return true;
 }
 function link(userId){const p=db.prepare("SELECT p.display_name FROM creator_profiles p JOIN users u ON u.id=p.user_id LEFT JOIN member_restrictions r ON r.user_id=p.user_id WHERE p.user_id=? AND COALESCE(r.state,'ACTIVE') NOT IN ('SUSPENDED','WITHDRAWN')").get(userId);return p?{publicId:ensure(userId),displayName:p.display_name}:null;}
 return {ensure,find,handle,link};
};
