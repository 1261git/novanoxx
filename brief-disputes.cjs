'use strict';
const crypto=require('node:crypto');
module.exports=function({db,member,request,order,event,clock,isAdmin,busy,dir,store,usage,tx,paymentAuthority=null}){
 db.exec(`CREATE TABLE IF NOT EXISTS engine_briefs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,state TEXT NOT NULL,body TEXT NOT NULL,version INTEGER NOT NULL,selected_offer TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS engine_brief_offers(id TEXT PRIMARY KEY,brief_id TEXT NOT NULL,seller TEXT NOT NULL,state TEXT NOT NULL,body TEXT NOT NULL,version INTEGER NOT NULL,created INTEGER NOT NULL,UNIQUE(brief_id,seller));
 CREATE TABLE IF NOT EXISTS engine_disputes(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,opened_by TEXT NOT NULL,state TEXT NOT NULL,previous_status TEXT NOT NULL,remaining_review INTEGER,version INTEGER NOT NULL,assignee TEXT,summary TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS engine_dispute_open_order ON engine_disputes(order_id) WHERE state<>'RESOLVED';
 CREATE TABLE IF NOT EXISTS engine_review_events(id TEXT PRIMARY KEY,target_id TEXT NOT NULL,actor TEXT NOT NULL,kind TEXT NOT NULL,detail TEXT NOT NULL,created INTEGER NOT NULL);`);
 const fail=code=>{throw Error(code);},id=()=>crypto.randomUUID();
 const audit=(target,actor,kind,detail)=>db.prepare('INSERT INTO engine_review_events VALUES(?,?,?,?,?,?)').run(id(),target,actor,kind,JSON.stringify(detail),clock());
 const checkout=require('./brief-checkout.cjs')({db,member,request,clock,audit,event,paymentAuthority});
 const correspondence=require('./brief-correspondence.cjs')({db,dir,store,usage,member,request,tx,clock,audit});
 const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
 const history=target=>db.prepare('SELECT actor,kind,detail,created FROM engine_review_events WHERE target_id=? ORDER BY created,id').all(target).map(e=>({...e,detail:JSON.parse(e.detail)}));
 function version(row,input){if(!row||row.version!==input.version)fail('REVIEW_VERSION_CONFLICT');}
 function body(value){
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!['title','category','type','budget','deadline','description','reference','deliverables'].includes(k))||!text(value.title,150)||!text(value.type,150)||!text(value.description,5000)||!text(value.deliverables,1000)||!['VIDEO','2D','3D','AUDIO','DOCUMENTS','AI_TOOLS'].includes(value.category)||!Number.isSafeInteger(value.budget)||value.budget<1||value.budget>1000000000||!/^\d{4}-\d{2}-\d{2}$/.test(value.deadline)||!Number.isFinite(Date.parse(value.deadline))||new Date(value.deadline).toISOString().slice(0,10)!==value.deadline)fail('BRIEF_INVALID');
  if(value.reference){let link;try{link=new URL(value.reference);}catch{fail('BRIEF_INVALID');}if(!['https:','http:'].includes(link.protocol)||link.username||link.password||value.reference.length>2000)fail('BRIEF_INVALID');}
  return value;
 }
 function recommendations(b){const body=JSON.parse(b.body);return db.prepare("SELECT a.id,a.metadata,l.public_id FROM creator_assets a JOIN catalog_links l ON l.asset_id=a.id WHERE a.status='ACTIVE' AND a.user_id<>?").all(b.owner).map(a=>{let m;try{m=JSON.parse(a.metadata);}catch{return null;}if(m.category!==body.category||!Number.isSafeInteger(m.price)||m.price<1||m.price*100>body.budget)return null;return {publicId:Number(a.public_id)+1000,title:String(m.title||'').slice(0,150),price:m.price};}).filter(Boolean).sort((a,b)=>a.price-b.price||a.publicId-b.publicId).slice(0,5);}
 function briefState(actor){member(actor);const rows=db.prepare('SELECT * FROM engine_briefs ORDER BY created DESC,id').all();return {environment:'SANDBOX',financialEffects:false,briefs:rows.filter(b=>b.owner===actor||b.state==='OPEN'||db.prepare('SELECT id FROM engine_brief_offers WHERE brief_id=? AND seller=?').get(b.id,actor)).map(b=>{
   const offers=db.prepare('SELECT * FROM engine_brief_offers WHERE brief_id=? ORDER BY created,id').all(b.id).filter(o=>b.owner===actor||o.seller===actor).map(o=>({...o,body:JSON.parse(o.body)}));
   return {...b,recommendations:recommendations(b),checkout:checkout.state(actor,b),body:JSON.parse(b.body),offers,messages:b.owner===actor||offers.some(o=>o.seller===actor)?correspondence.state(actor,b.id):[],history:b.owner===actor?history(b.id).filter(h=>!['PRIVATE_MESSAGE','ATTACHMENT_STAGED'].includes(h.kind)):[]};
  })};}
 function briefAct(actor,i){if(['briefTerms','briefCheckout'].includes(i.action))return checkout.act(actor,i);if(i.action==='briefMessage')return correspondence.act(actor,i);return request(actor,i,()=>{
  let b,result;
  if(i.action==='briefCreate'){const content=body(i.body);b={id:id(),owner:actor,state:'DRAFT',body:JSON.stringify(content),version:1,selected_offer:null,created:clock(),updated:clock()};db.prepare('INSERT INTO engine_briefs VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(b));audit(b.id,actor,'CREATED',{body:content});result={id:b.id,state:b.state,version:1};}
  else{
   b=db.prepare('SELECT * FROM engine_briefs WHERE id=?').get(i.briefId);version(b,i);
   if(['briefEdit','briefPublish','briefCancel','briefSelect','briefClose'].includes(i.action)&&b.owner!==actor)fail('ACCESS_DENIED');
   if(i.action==='briefEdit'){if(b.state!=='DRAFT')fail('INVALID_STATE');const content=body(i.body);db.prepare('UPDATE engine_briefs SET body=?,version=version+1,updated=? WHERE id=?').run(JSON.stringify(content),clock(),b.id);audit(b.id,actor,'EDITED',{body:content});}
   else if(i.action==='briefPublish'){if(b.state!=='DRAFT'||JSON.parse(b.body).deadline<new Date(clock()).toISOString().slice(0,10))fail('INVALID_STATE');db.prepare("UPDATE engine_briefs SET state='OPEN',version=version+1,updated=? WHERE id=?").run(clock(),b.id);audit(b.id,actor,'PUBLISHED',{scope:'AUTHENTICATED_TEST_MEMBERS'});}
   else if(i.action==='briefOffer'){
    if(b.owner===actor||b.state!=='OPEN'||JSON.parse(b.body).deadline<new Date(clock()).toISOString().slice(0,10)||!text(i.proposal,3000)||!Number.isSafeInteger(i.quoteKrw)||i.quoteKrw<1||i.quoteKrw>1000000000||!Number.isSafeInteger(i.days)||i.days<1||i.days>365)fail('BRIEF_INVALID');
    if(db.prepare('SELECT id FROM engine_brief_offers WHERE brief_id=? AND seller=?').get(b.id,actor))fail('BRIEF_OFFER_EXISTS');const offer=id();db.prepare('INSERT INTO engine_brief_offers VALUES(?,?,?,?,?,?,?)').run(offer,b.id,actor,'PROPOSED',JSON.stringify({proposal:i.proposal,quoteKrw:i.quoteKrw,days:i.days}),1,clock());audit(offer,actor,'PROPOSED',{briefId:b.id});return {id:offer,state:'PROPOSED'};
   }else if(i.action==='briefWithdraw'){
    const offer=db.prepare('SELECT * FROM engine_brief_offers WHERE id=? AND brief_id=? AND seller=?').get(i.offerId,b.id,actor);if(!offer||offer.state!=='PROPOSED'||b.state!=='OPEN')fail('INVALID_STATE');db.prepare("UPDATE engine_brief_offers SET state='WITHDRAWN',version=version+1 WHERE id=?").run(offer.id);audit(offer.id,actor,'WITHDRAWN',{});return {id:offer.id,state:'WITHDRAWN'};
   }else if(i.action==='briefSelect'){
    if(b.state!=='OPEN'||i.confirmed!==true)fail('INVALID_STATE');const offer=db.prepare("SELECT * FROM engine_brief_offers WHERE id=? AND brief_id=? AND state='PROPOSED'").get(i.offerId,b.id);if(!offer||offer.version!==i.offerVersion)fail('REVIEW_VERSION_CONFLICT');member(offer.seller);
    db.prepare("UPDATE engine_briefs SET state='AGREED',selected_offer=?,version=version+1,updated=? WHERE id=?").run(offer.id,clock(),b.id);db.prepare("UPDATE engine_brief_offers SET state='SELECTED',version=version+1 WHERE id=?").run(offer.id);audit(b.id,actor,'CONDITIONS_SELECTED',{brief:JSON.parse(b.body),offer:{seller:offer.seller,...JSON.parse(offer.body)},charge:'NONE',contract:'NOT_EXECUTED',order:'NOT_CREATED'});
   }else if(i.action==='briefCancel'||i.action==='briefClose'){
    if(i.action==='briefCancel'&&!['DRAFT','OPEN'].includes(b.state)||i.action==='briefClose'&&b.state!=='AGREED'||!text(i.reason,1000))fail('INVALID_STATE');db.prepare('UPDATE engine_briefs SET state=?,version=version+1,updated=? WHERE id=?').run(i.action==='briefCancel'?'CANCELLED':'CLOSED',clock(),b.id);audit(b.id,actor,i.action==='briefCancel'?'CANCELLED':'CLOSED',{reason:i.reason,financialEffects:false});
   }else fail('INVALID_ACTION');result=db.prepare('SELECT id,state,version FROM engine_briefs WHERE id=?').get(b.id);
  }return {...result,financialEffects:false};
 });}
 const admin=actor=>{if(!isAdmin(member(actor)))fail('PLAN_ADMIN_REQUIRED');};
 function disputeState(actor,asAdmin=false){member(actor);if(asAdmin)admin(actor);return {environment:'SANDBOX',financialEffects:false,cases:db.prepare('SELECT * FROM engine_disputes ORDER BY created DESC,id').all().filter(c=>asAdmin||db.prepare('SELECT id FROM engine_orders WHERE id=? AND (buyer=? OR seller=?)').get(c.order_id,actor,actor)).map(c=>({...c,history:history(c.id)}))};}
 function disputeAct(actor,i,asAdmin=false){member(actor);if(asAdmin)admin(actor);return request(actor,i,()=>{
  let c;
  if(i.action==='disputeOpen'){
   if(asAdmin)fail('INVALID_ACTION');const o=order(actor,i.orderId);if(busy.has(o.id))fail('DELIVERY_BUSY');if(!['PAID','IN_PROGRESS','PREVIEW_READY','REVIEW_PAUSED','COMPLETED'].includes(o.status)||!text(i.reason,2000))fail('INVALID_STATE');if(o.status==='PREVIEW_READY'&&clock()>=o.review_until)fail('REVIEW_EXPIRED');if(db.prepare("SELECT id FROM engine_disputes WHERE order_id=? AND state<>'RESOLVED'").get(o.id))fail('DISPUTE_EXISTS');
   c={id:id(),order_id:o.id,opened_by:actor,state:'OPEN',previous_status:o.status,remaining_review:o.review_until?Math.max(0,o.review_until-clock()):null,version:1,assignee:null,summary:i.reason,created:clock(),updated:clock()};db.prepare('INSERT INTO engine_disputes VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(c));if(o.status!=='COMPLETED')db.prepare("UPDATE engine_orders SET status='DISPUTED',review_until=NULL WHERE id=?").run(o.id);audit(c.id,actor,'OPENED',{reason:i.reason,previousStatus:o.status,delivery:o.delivery,financialEffects:false});event(o.id,actor,'DISPUTE_OPENED',{caseId:c.id});
  }else{
   c=db.prepare('SELECT * FROM engine_disputes WHERE id=?').get(i.caseId);if(!c)fail('ACCESS_DENIED');if(!asAdmin)order(actor,c.order_id);version(c,i);if(c.state==='RESOLVED')fail('INVALID_STATE');
   if(i.action==='disputeComment'){
    if(!text(i.reason,2000)||!Array.isArray(i.fileIds)||i.fileIds.length>10||new Set(i.fileIds).size!==i.fileIds.length)fail('INVALID_INPUT');const o=db.prepare('SELECT * FROM engine_orders WHERE id=?').get(c.order_id);for(const fileId of i.fileIds){const f=db.prepare('SELECT * FROM engine_files WHERE id=? AND order_id=? AND version=?').get(fileId,o.id,o.delivery);if(!f||!['REVIEW','FINAL'].includes(f.kind)||f.kind==='FINAL'&&actor!==o.seller&&o.status!=='COMPLETED')fail('ACCESS_DENIED');}audit(c.id,actor,'COMMENT',{reason:i.reason,fileIds:i.fileIds});
   }else if(i.action==='disputeReview'){
    if(!asAdmin||!text(i.reason,2000)||!['IN_REVIEW','WAITING_CONTRACT','RESOLVED'].includes(i.state)||![null,actor].includes(i.assignee))fail('INVALID_INPUT');if(i.state==='RESOLVED'){
     const o=db.prepare('SELECT * FROM engine_orders WHERE id=?').get(c.order_id);if(c.state!=='IN_REVIEW'||c.previous_status==='COMPLETED'&&i.resolution!=='REVIEW_ONLY'||c.previous_status!=='COMPLETED'&&i.resolution!=='RESUME')fail('INVALID_STATE');if(c.previous_status!=='COMPLETED'){if(o.status!=='DISPUTED')fail('INVALID_STATE');db.prepare('UPDATE engine_orders SET status=?,review_until=? WHERE id=?').run(c.previous_status,c.previous_status==='PREVIEW_READY'?clock()+c.remaining_review:null,o.id);}audit(c.id,actor,'RESOLVED',{reason:i.reason,resolution:i.resolution,financialEffects:false});event(o.id,actor,'DISPUTE_RESOLVED',{caseId:c.id,resolution:i.resolution});
    }else audit(c.id,actor,i.state,{reason:i.reason,financialEffects:false});c.state=i.state;c.assignee=i.assignee;
   }else fail('INVALID_ACTION');db.prepare('UPDATE engine_disputes SET state=?,assignee=?,version=version+1,updated=? WHERE id=? AND version=?').run(c.state,c.assignee,clock(),c.id,c.version);c=db.prepare('SELECT * FROM engine_disputes WHERE id=?').get(c.id);
  }return {id:c.id,state:c.state,version:c.version,financialEffects:false};
 });}
 return {briefs:{state:briefState,act:briefAct,upload:correspondence.upload,download:correspondence.download},disputes:{state:disputeState,act:disputeAct}};
};
