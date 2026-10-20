'use strict';
// Read existing daily asset-view aggregates. No new tracking or personal identifiers.
module.exports=function({db,period}){
 const empty={available:false,categories:[],mostViewed:[],leastViewed:[],totalViews:0,basis:'RECORDED_SIGNED_IN_ASSET_VIEWS_NOT_UNIQUE_VISITORS_OR_ALL_CLICKS'};
 if(db.backend!=='postgres'||!db.prepare("SELECT to_regclass('nnx_operating_v1.asset_view_days') relation").get().relation)return empty;
 const day=t=>new Date(t+9*3600000).toISOString().slice(0,10),args=[day(period.start),day(period.end),period.end];
 const join="FROM creator_assets a JOIN catalog_links l ON l.asset_id=a.id LEFT JOIN asset_publication_policy p ON p.asset_id=a.id LEFT JOIN (SELECT asset_id,SUM(views) views FROM nnx_operating_v1.asset_view_days WHERE day>=? AND day<=? GROUP BY asset_id) v ON v.asset_id=a.id WHERE a.status IN ('ACTIVE','SOLD','PAUSED') AND COALESCE(p.visibility,'PUBLIC')='PUBLIC' AND a.created<=?";
 const categories=db.prepare("SELECT COALESCE((a.metadata::jsonb)->>'category','UNKNOWN') category,COALESCE(SUM(v.views),0) views "+join+' GROUP BY 1 ORDER BY 1').all(...args).map(r=>({...r,views:Number(r.views)}));
 const ranked=direction=>db.prepare("SELECT l.public_id,(a.metadata::jsonb)->>'title' title,COALESCE((a.metadata::jsonb)->>'category','UNKNOWN') category,COALESCE(v.views,0) views "+join+' ORDER BY views '+direction+',l.public_id LIMIT 10').all(...args).map(r=>({publicId:Number(r.public_id)+1000,title:r.title||'',category:r.category,views:Number(r.views)}));
 return {...empty,available:true,categories,mostViewed:ranked('DESC'),leastViewed:ranked('ASC'),totalViews:categories.reduce((n,r)=>n+r.views,0)};
};
