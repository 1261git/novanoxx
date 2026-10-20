'use strict';
module.exports=function({db,series,start,end,hourly=false}){
 const exists=t=>!!db.prepare("SELECT name FROM sqlite_master WHERE name='"+t+"'").get(),by=new Map(series.map(r=>[r.date,r])),loginsReady=exists('login_events');
 for(const r of series){r.logins=loginsReady?0:null;r.subscriptionGrossKrw=null;r.subscriptionRefundedKrw=null;}
 if(loginsReady){
  const format=hourly?'HH24:00':'YYYY-MM-DD',bucket=db.backend==='postgres'?"to_char(to_timestamp(occurred/1000.0) AT TIME ZONE 'Asia/Seoul','"+format+"')":"strftime('"+(hourly?'%H:00':'%Y-%m-%d')+"',occurred/1000.0,'unixepoch','+9 hours')";
  for(const r of db.prepare('SELECT '+bucket+' bucket,COUNT(*) n FROM login_events WHERE occurred>=? AND occurred<=? GROUP BY 1').all(start,end)){if(by.has(r.bucket))by.get(r.bucket).logins=Number(r.n);}
 }
 if(db.backend!=='postgres'||!db.prepare("SELECT to_regclass('nnx_operating_v1.billing_payment_sync') relation").get().relation)return;
 for(const r of series){r.subscriptionGrossKrw=0;r.subscriptionRefundedKrw=0;}
 const bucket="to_char(c.period_start AT TIME ZONE 'Asia/Seoul','"+(hourly?'HH24:00':'YYYY-MM-DD')+"')";
 for(const r of db.prepare('SELECT '+bucket+" bucket,SUM(c.amount_krw) gross,SUM(COALESCE(b.refunded_krw,0)) refunded FROM nnx_operating_v1.subscription_cycles c LEFT JOIN nnx_operating_v1.billing_payment_sync b ON b.payment_key=c.provider_payment_key WHERE c.state='APPROVED' AND c.period_start>=? AND c.period_start<=? GROUP BY 1").all(new Date(start).toISOString(),new Date(end).toISOString())){const row=by.get(r.bucket);if(row){row.subscriptionGrossKrw=Number(r.gross);row.subscriptionRefundedKrw=Number(r.refunded);}}
};
