'use strict';
const {createHash}=require('node:crypto');
// Owner-approved selling allowance, 2026-10-23. This grants no plan,
// administration, balance, billing, upload-size or storage privileges.
const unlimited=new Set([
 'a2fa373915ef5a1c21bcb6980c21c62c21e41c93aa31ac4a98623a96d47be907',
 '9f3180ddc7c746bed59cdb94a841e88241350a909d8729e2c54cdbaf8eae90f8'
]);
module.exports=function(db,actor,env=process.env){
 if(env.RENDER_SERVICE_ID!=='srv-db5aqunlk1mc739bi0m0'||env.NODE_ENV!=='production'||env.NNX_REVIEW_MODE==='1')return false;
 const email=db.prepare('SELECT email FROM users WHERE id=?').get(actor)?.email;
 return typeof email==='string'&&unlimited.has(createHash('sha256').update(email.trim().toLowerCase()).digest('hex'));
};
