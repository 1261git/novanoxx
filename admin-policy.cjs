const crypto=require('node:crypto');
const ownerHash='a2fa373915ef5a1c21bcb6980c21c62c21e41c93aa31ac4a98623a96d47be907';
module.exports=user=>Boolean(user?.email&&crypto.createHash('sha256').update(user.email.toLowerCase()).digest('hex')===ownerHash);
