'use strict';
const parse=value=>typeof value==='string'?JSON.parse(value):value||{};
module.exports=function({db,clock=Date.now}){
 return function details(params){
  const kind=params.get('kind'),days=Number(params.get('days')||30),offset=Number(params.get('offset')||0),q=(params.get('q')||'').trim();
  if(!['members','signups','visits','sales','refunds','subscriptions','subscriptionRefunds'].includes(kind)||!Number.isSafeInteger(offset)||offset<0||offset>100000||q.length>150)throw Error('INVALID_INPUT');
  const period=require('./admin-dashboard.cjs').range(days,clock()),from=new Date(period.start).toISOString(),until=new Date(period.end).toISOString();
  const args=[],filters=[],exists=t=>!!db.prepare("SELECT name FROM sqlite_master WHERE name='"+t+"'").get();
  const search=(columns)=>{if(q){filters.push('('+columns.map(c=>"LOWER("+c+") LIKE ? ESCAPE '!'").join(' OR ')+')');const pattern='%'+q.toLowerCase().replace(/[!%_]/g,m=>'!'+m)+'%';args.push(...columns.map(()=>pattern));}};
  const result=(select,join,sort,map=x=>x)=>{const where=filters.length?' WHERE '+filters.join(' AND '):'',total=Number(db.prepare('SELECT COUNT(*) n '+join+where).get(...args).n),rows=db.prepare(select+' '+join+where+' ORDER BY '+sort+' LIMIT 50 OFFSET ?').all(...args,offset).map(map);return {kind,days,period,offset,limit:50,total,hasMore:offset+rows.length<total,rows};};
  if(['members','signups','visits'].includes(kind)){
   const records=exists('account_creation_records'),restricted=exists('member_restrictions'),profiles=exists('creator_profiles'),logins=exists('login_events');
   let join='FROM users u'+(records?' LEFT JOIN account_creation_records c ON c.user_id=u.id':'')+(restricted?' LEFT JOIN member_restrictions r ON r.user_id=u.id':'')+(profiles?' LEFT JOIN creator_profiles p ON p.user_id=u.id':'');
   if(logins){join+=' LEFT JOIN (SELECT user_id,COUNT(*) login_count,MAX(occurred) last_login FROM login_events WHERE occurred>=? AND occurred<=? GROUP BY user_id) l ON l.user_id=u.id';args.push(period.start,period.end);}
   if(kind!=='signups'&&restricted)filters.push("COALESCE(r.state,'ACTIVE')<>'WITHDRAWN'");
   if(kind==='signups'){if(!records)return {kind,days,period,offset,limit:50,total:0,hasMore:false,rows:[]};filters.push('c.created>=? AND c.created<=?');args.push(period.start,period.end);}
   if(kind==='visits')filters.push(logins?'COALESCE(l.login_count,0)>0':'1=0');
   search(['u.id','u.email','u.name']);
   return result('SELECT u.id,u.email,u.name,'+(records?'c.created,c.source':'NULL created,NULL source')+','+(profiles?'p.country':'NULL country')+','+(restricted?"COALESCE(r.state,'ACTIVE')":"'ACTIVE'")+' member_state,'+(logins?'COALESCE(l.login_count,0) login_count,l.last_login':'0 login_count,NULL last_login'),join,kind==='visits'?'login_count DESC,u.id':'u.id',row=>({...row,login_count:Number(row.login_count),providers:exists('identities')?db.prepare('SELECT provider FROM identities WHERE user_id=? ORDER BY provider').all(row.id).map(r=>r.provider):[]}));
  }
  if(db.backend!=='postgres')return {kind,days,period,offset,limit:50,total:0,hasMore:false,rows:[],unavailable:true};
  if(['sales','refunds'].includes(kind)){
   filters.push("p.environment='LIVE' AND p.state IN ('APPROVED','REFUNDED') AND p.approved_at>=? AND p.approved_at<=?");args.push(from,until);if(kind==='refunds')filters.push('COALESCE(s.refunded_krw,0)>0');
   search(['o.id','u.id','u.email','u.name','v.id','v.email','v.name']);
   return result('SELECT o.id,o.buyer_id,u.email buyer_email,u.name buyer_name,o.seller_id,v.email seller_email,v.name seller_name,o.source_kind,o.amount_krw,o.state,o.terms_snapshot,p.approved_at,COALESCE(s.refunded_krw,0) refunded_krw', 'FROM nnx_operating_v1.orders o JOIN nnx_operating_v1.payments p ON p.order_id=o.id JOIN users u ON u.id=o.buyer_id JOIN users v ON v.id=o.seller_id LEFT JOIN nnx_operating_v1.payment_sync s ON s.order_id=o.id','p.approved_at DESC,o.id',row=>{const snapshot=parse(row.terms_snapshot);delete row.terms_snapshot;return {...row,title:String(snapshot.title||''),saleMode:snapshot.saleMode||snapshot.contract?.mode||null,amount_krw:Number(row.amount_krw),refunded_krw:Number(row.refunded_krw),refunds:kind==='refunds'?db.prepare('SELECT id,amount_krw,state,updated FROM nnx_operating_v1.refunds WHERE order_id=? ORDER BY created,id').all(row.id).map(r=>({...r,amount_krw:Number(r.amount_krw)})):[]};});
  }
  filters.push("c.state='APPROVED' AND c.period_start>=? AND c.period_start<=?");args.push(from,until);if(kind==='subscriptionRefunds')filters.push('COALESCE(b.refunded_krw,0)>0');
  search(['s.id','u.id','u.email','u.name']);
  return result('SELECT s.id,s.user_id,u.email,u.name,s.plan,s.state,c.period_start,c.amount_krw,COALESCE(b.refunded_krw,0) refunded_krw,c.provider_payment_key', 'FROM nnx_operating_v1.subscription_cycles c JOIN nnx_operating_v1.subscriptions s ON s.id=c.subscription_id JOIN users u ON u.id=s.user_id LEFT JOIN nnx_operating_v1.billing_payment_sync b ON b.payment_key=c.provider_payment_key','c.period_start DESC,s.id',row=>{const key=row.provider_payment_key;delete row.provider_payment_key;return {...row,amount_krw:Number(row.amount_krw),refunded_krw:Number(row.refunded_krw),refunds:kind==='subscriptionRefunds'?db.prepare('SELECT id,amount_krw,state,updated FROM nnx_operating_v1.subscription_refunds WHERE payment_key=? ORDER BY created,id').all(key).map(r=>({...r,amount_krw:Number(r.amount_krw)})):[]};});
 };
};
