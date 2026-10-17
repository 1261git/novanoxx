const crypto=require('node:crypto');
const adminHashes=new Set(['98e810f82ad5b4116a6f9088170f6ff88622cefa51e688001ed94d8d07232de4','a2fa373915ef5a1c21bcb6980c21c62c21e41c93aa31ac4a98623a96d47be907','9f3180ddc7c746bed59cdb94a841e88241350a909d8729e2c54cdbaf8eae90f8']);
module.exports=user=>Boolean(user?.email&&adminHashes.has(crypto.createHash('sha256').update(user.email.trim().toLowerCase()).digest('hex')));
