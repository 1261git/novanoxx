const crypto=require('node:crypto');
const adminHashes=new Set(['a2fa373915ef5a1c21bcb6980c21c62c21e41c93aa31ac4a98623a96d47be907','9f3180ddc7c746bed59cdb94a841e88241350a909d8729e2c54cdbaf8eae90f8']);
module.exports=user=>Boolean(user?.email&&adminHashes.has(crypto.createHash('sha256').update(user.email.trim().toLowerCase()).digest('hex')));
