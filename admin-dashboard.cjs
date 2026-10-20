'use strict';
const DAY=86400000,KST=9*3600000;
const dateKey=t=>new Date(t+KST).toISOString().slice(0,10);
function range(days,now){if(![7,30,120].includes(days))throw Error('INVALID_INPUT');const today=Math.floor((now+KST)/DAY)*DAY-KST;return {start:today-(days-1)*DAY,end:now,timezone:'Asia/Seoul'};}
module.exports=function({db,clock=Date.now}){
 const exists=t=>!!db.prepare("SELECT name FROM sqlite_master WHERE name='"+t+"'").get();
 return function dashboard(days){
  const period=range(days,clock()),series=Array.from({length:days},(_,i)=>({date:dateKey(period.start+i*DAY),signups:0,searches:0,arrivals:0,salesKrw:0,currentRefundsKrw:0})),byDate=new Map(series.map(r=>[r.date,r]));
  const restriction=exists('member_restrictions'),records=exists('account_creation_records');
  const where=restriction?"COALESCE(r.state,'ACTIVE')<>'WITHDRAWN'":'1=1',join=restriction?' LEFT JOIN member_restrictions r ON r.user_id=u.id':'';
  const total=Number(db.prepare('SELECT COUNT(*) n FROM users u'+join+' WHERE '+where).get().n);
  const withdrawn=restriction?Number(db.prepare("SELECT COUNT(*) n FROM users u JOIN member_restrictions r ON r.user_id=u.id WHERE r.state='WITHDRAWN'").get().n):0;
  const unknown=records?Number(db.prepare('SELECT COUNT(*) n FROM users u'+join+' LEFT JOIN account_creation_records c ON c.user_id=u.id WHERE '+where+' AND c.user_id IS NULL').get().n):total;
  const dayExpr=column=>db.backend==='postgres'?"to_char(to_timestamp("+column+"/1000.0) AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD')":"strftime('%Y-%m-%d',"+column+"/1000.0,'unixepoch','+9 hours')";
  if(records){for(const r of db.prepare('SELECT '+dayExpr('c.created')+' bucket_date,COUNT(*) n FROM account_creation_records c JOIN users u ON u.id=c.user_id WHERE c.created>=? AND c.created<=? GROUP BY 1 ORDER BY 1').all(period.start,period.end)){const row=byDate.get(r.bucket_date);if(row)row.signups=Number(r.n);}}
  for(const r of db.prepare('SELECT '+dayExpr('created')+' bucket_date,kind,COUNT(*) n FROM engine_discovery_events WHERE created>=? AND created<=? GROUP BY 1,kind ORDER BY 1').all(period.start,period.end)){const row=byDate.get(r.bucket_date);if(row&&r.kind==='SEARCH')row.searches=Number(r.n);if(row&&r.kind==='ARRIVAL')row.arrivals=Number(r.n);}
  if(db.backend==='postgres'){
   for(const r of db.prepare("SELECT to_char(p.approved_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') bucket_date,SUM(o.amount_krw) gross,SUM(COALESCE(s.refunded_krw,0)) refunded FROM nnx_operating_v1.orders o JOIN nnx_operating_v1.payments p ON p.order_id=o.id LEFT JOIN nnx_operating_v1.payment_sync s ON s.order_id=o.id WHERE p.environment='LIVE' AND p.state IN ('APPROVED','REFUNDED') AND p.approved_at>=? AND p.approved_at<=? GROUP BY 1 ORDER BY 1").all(new Date(period.start).toISOString(),new Date(period.end).toISOString())){const row=byDate.get(r.bucket_date);if(row){row.salesKrw=Number(r.gross);row.currentRefundsKrw=Number(r.refunded);}}
  }
  return {period,members:{total,withdrawn,unknownCreation:unknown,signups:series.reduce((n,r)=>n+r.signups,0),basis:'OPERATING_DB_ACCOUNTS_INCLUDING_ADMIN_AND_LEGACY_TEST;WITHDRAWN_EXCLUDED_FROM_TOTAL;RECORDED_SIGNUPS_INCLUDE_LATER_WITHDRAWALS'},series,financialSeriesReady:db.backend==='postgres',visitors:{enabled:false,uniqueBrowsers:null,sessions:null},financialSeriesBasis:'LIVE_PAYMENT_APPROVAL_DAY_CURRENT_CUMULATIVE_REFUND_NOT_REFUND_EXECUTION_DAY',signupBasis:'RECORDED_ACCOUNT_CREATION_ONLY_NO_LEGACY_DATE_INFERENCE'};
 };
};
module.exports.range=range;


