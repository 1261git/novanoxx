// Portable password-encrypted recovery key. No Windows account dependency and no network.
const crypto = require('node:crypto');
const CONTEXT = 'NovaNoxX.PortableRecoveryKey.v1';
const PARAMETERS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function password(value) {
  if (typeof value !== 'string' || value.length < 16 || Buffer.byteLength(value) > 1024) throw Error('RECOVERY_PASSPHRASE_REQUIRED');
}
function canonicalHeader(value) {
  if (value?.version !== 1 || value.context !== CONTEXT || value.kdf !== 'scrypt' || value.N !== PARAMETERS.N ||
      value.r !== PARAMETERS.r || value.p !== PARAMETERS.p || !/^[a-f0-9]{64}$/.test(value.publicKeySha256 || '') ||
      !/^[a-f0-9]{32}$/.test(value.salt || '') || !/^[a-f0-9]{24}$/.test(value.iv || '')) throw Error('RECOVERY_ENVELOPE_INVALID');
  return { version: 1, context: CONTEXT, kdf: 'scrypt', N: PARAMETERS.N, r: PARAMETERS.r, p: PARAMETERS.p,
    salt: value.salt, iv: value.iv, publicKeySha256: value.publicKeySha256 };
}
function create(passphrase) {
  password(passphrase);
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateBytes = pair.privateKey.export({ type: 'pkcs8', format: 'der' });
  const header = canonicalHeader({ version: 1, context: CONTEXT, kdf: 'scrypt', ...PARAMETERS,
    salt: crypto.randomBytes(16).toString('hex'), iv: crypto.randomBytes(12).toString('hex'), publicKeySha256: sha(publicKey) });
  const key = crypto.scryptSync(passphrase, Buffer.from(header.salt, 'hex'), 32, PARAMETERS);
  try {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'hex'));
    cipher.setAAD(Buffer.from(JSON.stringify(header)));
    const ciphertext = Buffer.concat([cipher.update(privateBytes), cipher.final()]);
    return { publicKey, publicKeySha256: header.publicKeySha256,
      envelope: { header, ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('hex') } };
  } finally { key.fill(0); privateBytes.fill(0); }
}
function unlock(envelope, passphrase) {
  password(passphrase); const header = canonicalHeader(envelope?.header);
  if (!/^[a-f0-9]{32}$/.test(envelope.tag || '') || typeof envelope.ciphertext !== 'string' ||
      envelope.ciphertext.length > 16384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.ciphertext)) throw Error('RECOVERY_ENVELOPE_INVALID');
  const key = crypto.scryptSync(passphrase, Buffer.from(header.salt, 'hex'), 32, PARAMETERS); let privateBytes;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'hex'));
    decipher.setAAD(Buffer.from(JSON.stringify(header))); decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    privateBytes = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
    const privateKey = crypto.createPrivateKey({ key: privateBytes, format: 'der', type: 'pkcs8' });
    const publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
    if (sha(publicKey) !== header.publicKeySha256) throw Error('RECOVERY_PUBLIC_KEY_MISMATCH');
    return privateKey;
  } catch { throw Error('RECOVERY_UNLOCK_FAILED'); }
  finally { key.fill(0); privateBytes?.fill(0); }
}
module.exports = { create, unlock, sha };
