'use strict';
const DAY=86400000,VERSION='SEVEN_DAY_V1';
const summary=Object.freeze({version:VERSION,totalDays:7,materialsDays:1,maxWorkDays:5,reviewDays:1});
function validate(days,instant=false){if(!Number.isSafeInteger(days)||days<0||!instant&&days>summary.maxWorkDays)throw Object.assign(Error('FULFILLMENT_PERIOD_LIMIT'),{status:409});}
function create(paidAt,days,instant=false){validate(days,instant);if(!Number.isSafeInteger(paidAt)||!Number.isSafeInteger(paidAt+7*DAY))throw Object.assign(Error('FULFILLMENT_PERIOD_LIMIT'),{status:409});return {...summary,paidAt,materialsBy:paidAt+DAY,deliveryBy:paidAt+6*DAY,completeBy:paidAt+7*DAY};}
function policy(order){const value=typeof order.terms==='string'?JSON.parse(order.terms).fulfillmentPeriod:order.terms?.fulfillmentPeriod;if(value?.version!==VERSION)return null;if(!Number.isSafeInteger(value.paidAt)||value.materialsBy!==value.paidAt+DAY||value.deliveryBy!==value.paidAt+6*DAY||value.completeBy!==value.paidAt+7*DAY)throw Error('FULFILLMENT_PERIOD_INVALID');return value;}
function expired(order,now){const p=policy(order);if(!p||order.status==='COMPLETED')return false;return now>p.completeBy||!order.materials&&now>p.materialsBy||['PAID','IN_PROGRESS','REVIEW_PAUSED'].includes(order.status)&&now>p.deliveryBy;}
function assertOpen(order,now,phase){const p=policy(order);if(!p)return;if(expired(order,now)||phase==='deliver'&&now>p.deliveryBy)throw Error('FULFILLMENT_PERIOD_EXPIRED');}
function paymentTime(receipt,createdAt,now){const approved=typeof receipt?.approvedAt==='string'?Date.parse(receipt.approvedAt):NaN;if(Number.isSafeInteger(approved)&&approved>=0&&approved<=now)return approved;const prepared=new Date(createdAt).getTime();return Number.isSafeInteger(prepared)&&prepared>=0?Math.min(prepared,now):now;}
module.exports={paymentTime,DAY,VERSION,summary,validate,create,policy,expired,assertOpen};
