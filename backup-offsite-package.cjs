// Encrypted transport for captured bundles. No network, DB restore, or source writes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Readable, Writable } = require('node:stream'), { pipeline } = require('node:stream/promises');
const CONTEXT = 'NovaNoxX.OffsiteMetadata.v1', LIMIT = 16 * 1024 * 1024;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const scopes = new Set(['SYNTHETIC_OFFSITE_FIXTURE_ONLY', 'OPERATING_READONLY_CANDIDATE_RESTORE_NOT_VERIFIED']);
function regular(root, name) {
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(name)) throw Error('TRANSPORT_PATH_DENIED');
  const file = path.join(root, name), stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw Error('TRANSPORT_FILE_REQUIRED');
  return { file, bytes: stat.size };
}
function readJSON(root, name, limit = LIMIT) {
  const entry = regular(root, name); if (entry.bytes > limit) throw Error('TRANSPORT_METADATA_LIMIT');
  const bytes = fs.readFileSync(entry.file); if (bytes.length > limit) throw Error('TRANSPORT_METADATA_LIMIT');
  return { value: JSON.parse(bytes), bytes };
}
function emptyDestination(source, value) {
  const destination = fs.realpathSync(value);
  if (destination === source || destination.startsWith(source + path.sep) || source.startsWith(destination + path.sep)) throw Error('TRANSPORT_SOURCE_TARGET_OVERLAP');
  if (fs.readdirSync(destination).length) throw Error('TRANSPORT_TARGET_NOT_EMPTY');
  return destination;
}
function manifestCheck(value, scope) {
  if (!scopes.has(scope) || value.version !== 1 || value.scope !== scope || !Array.isArray(value.files) || value.files.length > 10000) throw Error('TRANSPORT_SCOPE_REQUIRED');
  if (scope.startsWith('OPERATING_')) {
    const freeze = value.freeze;
    const stopped = freeze?.kind === 'OBSERVED_LINUX_STOPPED_WRITERS_AND_LOCAL_IDLE_DATABASE_CLIENTS' &&
      Array.isArray(freeze.writers) && freeze.writers.length > 0 && freeze.writers.some(w => w.mainServer) && freeze.writers.every(w => w.state === 'T');
    const cooperative = require('./backup-gate-proof.cjs').validateSummary(freeze);
    if (value.source?.service !== 'srv-db5aqunlk1mc739bi0m0' || value.source?.host !== 'dpg-db5ps6navr4c739lilj0-a' || value.source?.database !== 'novanoxx_jk4i' ||
        (!stopped && !cooperative) || freeze.service !== value.source.service ||
        !freeze.instance || !/^[a-f0-9]{64}$/.test(freeze.bootSha256 || '') || !Array.isArray(freeze.writers) || !freeze.writers.length ||
        !freeze.writers.some(w => w.mainServer) || !cooperative && freeze.writers.some(w => w.state !== 'T')) throw Error('OPERATING_CAPTURE_PROOF_REQUIRED');
  }
  const artifacts = ['database.enc'], names = new Set();
  for (const entry of value.files) {
    if (typeof entry.name !== 'string' || entry.name.includes('\\') || entry.name.includes(':') || entry.name.split('/').some(p => !p || p === '.' || p === '..') ||
        !/^file-\d+(?:-final)?\.enc$/.test(entry.artifact || '') || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha || '')) throw Error('TRANSPORT_FILE_MANIFEST_INVALID');
    const name = process.platform === 'win32' ? entry.name.toLowerCase() : entry.name;
    if (names.has(name)) throw Error('TRANSPORT_DUPLICATE_FILE'); names.add(name); artifacts.push(entry.artifact);
  }
  if (new Set(artifacts).size !== artifacts.length) throw Error('TRANSPORT_DUPLICATE_ARTIFACT');
  for (const record of [value.database, ...value.files]) if (!/^[a-f0-9]{24}$/.test(record?.iv || '') || !/^[a-f0-9]{32}$/.test(record?.tag || '')) throw Error('TRANSPORT_ENCRYPTION_RECORD_INVALID');
  return artifacts;
}
async function hashFile(file) {
  const hash = crypto.createHash('sha256'); let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest('hex'), bytes };
}
async function authenticate(file, record, key) {
  const encryptedHash = crypto.createHash('sha256'), plaintextHash = crypto.createHash('sha256'); let bytes = 0, encryptedBytes = 0;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'hex')); decipher.setAuthTag(Buffer.from(record.tag, 'hex'));
  async function* source() { for await (const chunk of fs.createReadStream(file)) { encryptedHash.update(chunk); encryptedBytes += chunk.length; yield chunk; } }
  await pipeline(Readable.from(source()), decipher, new Writable({ write(chunk, _encoding, next) { plaintextHash.update(chunk); bytes += chunk.length; next(); } }));
  const plaintextSha256 = plaintextHash.digest('hex');
  if (record.bytes !== undefined && record.bytes !== bytes || record.sha && record.sha !== plaintextSha256) throw Error('TRANSPORT_PLAINTEXT_MISMATCH');
  return { bytes: encryptedBytes, sha256: encryptedHash.digest('hex'), plaintextBytes: bytes, plaintextSha256 };
}
function publicIdentity(key) {
  const publicKey = key.type === 'public' ? key : crypto.createPublicKey(key);
  if (publicKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyDetails.modulusLength < 3072) throw Error('RSA_3072_RECIPIENT_REQUIRED');
  return { publicKey, fingerprint: sha(publicKey.export({ type: 'spki', format: 'pem' })) };
}
async function createPackage({ captureRoot, captureAnchor, key, recipientPublicKey, destination, scope }) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw Error('CAPTURE_KEY_REQUIRED');
  const source = fs.realpathSync(captureRoot), target = emptyDestination(source, destination);
  if (fs.existsSync(path.join(source, 'FAILED.json'))) throw Error('FAILED_CAPTURE_REFUSED');
  const manifest = readJSON(source, 'manifest.json');
  if (!/^[a-f0-9]{64}$/.test(captureAnchor || '') || sha(manifest.bytes) !== captureAnchor) throw Error('CAPTURE_ANCHOR_REQUIRED');
  const artifacts = manifestCheck(manifest.value, scope), identity = publicIdentity(recipientPublicKey?.type === 'public' ? recipientPublicKey : crypto.createPublicKey(recipientPublicKey));
  const id = crypto.randomUUID(), records = [], sourceRecords = [manifest.value.database, ...manifest.value.files];
  for (const [index, artifact] of artifacts.entries()) {
    const entry = regular(source, artifact), integrity = await authenticate(entry.file, sourceRecords[index], key);
    records.push({ artifact: 'payload-' + index + '.enc', sourceArtifact: artifact, ...integrity });
  }
  for (const record of records) {
    fs.copyFileSync(regular(source, record.sourceArtifact).file, path.join(target, record.artifact), fs.constants.COPYFILE_EXCL);
    const copy = await hashFile(path.join(target, record.artifact));
    if (copy.bytes !== record.bytes || copy.sha256 !== record.sha256) throw Error('CAPTURE_CHANGED_DURING_PACKAGING');
  }
  if (sha(readJSON(source, 'manifest.json').bytes) !== captureAnchor) throw Error('CAPTURE_CHANGED_DURING_PACKAGING');
  const header = { version: 1, context: CONTEXT, id, keyFingerprint: identity.fingerprint }, aad = Buffer.from(JSON.stringify(header));
  const metadataKey = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const plaintext = Buffer.from(JSON.stringify({ manifestBase64: manifest.bytes.toString('base64'), captureAnchor, captureKey: key.toString('base64'), records }));
  try {
    if (plaintext.length > LIMIT) throw Error('TRANSPORT_METADATA_LIMIT');
    const cipher = crypto.createCipheriv('aes-256-gcm', metadataKey, iv); cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const wrappedKey = crypto.publicEncrypt({ key: identity.publicKey, oaepHash: 'sha256', oaepLabel: aad }, metadataKey);
    const envelope = { header, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), wrappedKey: wrappedKey.toString('base64'), ciphertext: ciphertext.toString('base64') };
    fs.writeFileSync(path.join(target, 'recovery-metadata.enc.json'), JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
  } finally { metadataKey.fill(0); plaintext.fill(0); }
  const index = { version: 1, scope, id, keyFingerprint: identity.fingerprint,
    metadata: { artifact: 'recovery-metadata.enc.json', ...await hashFile(path.join(target, 'recovery-metadata.enc.json')) },
    files: records.map(({ artifact, bytes, sha256 }) => ({ artifact, bytes, sha256 })) };
  const bytes = Buffer.from(JSON.stringify(index)); fs.writeFileSync(path.join(target, 'index.json'), bytes, { flag: 'wx', mode: 0o600 });
  return { root: target, indexAnchor: sha(bytes), id, scope, files: records.length, keyFingerprint: identity.fingerprint };
}
async function restorePackage({ packageRoot, indexAnchor, privateKey, destination }) {
  const source = fs.realpathSync(packageRoot), target = emptyDestination(source, destination), index = readJSON(source, 'index.json');
  if (!/^[a-f0-9]{64}$/.test(indexAnchor || '') || sha(index.bytes) !== indexAnchor) throw Error('INDEPENDENT_INDEX_ANCHOR_REQUIRED');
  const value = index.value, identity = publicIdentity(privateKey);
  if (value.version !== 1 || !scopes.has(value.scope) || !/^[a-f0-9-]{36}$/.test(value.id || '') || value.keyFingerprint !== identity.fingerprint ||
      !Array.isArray(value.files) || value.files.length > 10001 || value.metadata?.artifact !== 'recovery-metadata.enc.json') throw Error('TRANSPORT_INDEX_INVALID');
  const indexRecords = [value.metadata, ...value.files], seen = new Set();
  for (const record of indexRecords) {
    if (seen.has(record.artifact) || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || !/^[a-f0-9]{64}$/.test(record.sha256 || '')) throw Error('TRANSPORT_INDEX_INVALID');
    seen.add(record.artifact); const entry = regular(source, record.artifact), actual = await hashFile(entry.file);
    if (actual.bytes !== record.bytes || actual.sha256 !== record.sha256) throw Error('TRANSPORT_CIPHERTEXT_MISMATCH');
  }
  const envelope = readJSON(source, value.metadata.artifact, LIMIT * 2).value;
  const header = { version: 1, context: CONTEXT, id: value.id, keyFingerprint: identity.fingerprint }, aad = Buffer.from(JSON.stringify(header));
  if (JSON.stringify(envelope.header) !== JSON.stringify(header) || !/^[a-f0-9]{24}$/.test(envelope.iv || '') || !/^[a-f0-9]{32}$/.test(envelope.tag || '')) throw Error('TRANSPORT_METADATA_INVALID');
  let metadataKey, metadataBytes, captureKey;
  try {
    metadataKey = crypto.privateDecrypt({ key: privateKey, oaepHash: 'sha256', oaepLabel: aad }, Buffer.from(envelope.wrappedKey, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', metadataKey, Buffer.from(envelope.iv, 'hex')); decipher.setAAD(aad); decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    metadataBytes = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
    if (metadataBytes.length > LIMIT) throw Error('TRANSPORT_METADATA_LIMIT');
    const metadata = JSON.parse(metadataBytes.toString()), manifestBytes = Buffer.from(metadata.manifestBase64 || '', 'base64');
    if (sha(manifestBytes) !== metadata.captureAnchor) throw Error('CAPTURE_ANCHOR_MISMATCH');
    metadata.manifest = JSON.parse(manifestBytes.toString());
    const artifacts = manifestCheck(metadata.manifest, value.scope); captureKey = Buffer.from(metadata.captureKey || '', 'base64');
    if (captureKey.length !== 32 || !Array.isArray(metadata.records) || metadata.records.length !== artifacts.length || metadata.records.length !== value.files.length) throw Error('TRANSPORT_RECORDS_INVALID');
    const sourceRecords = [metadata.manifest.database, ...metadata.manifest.files];
    for (const [position, record] of metadata.records.entries()) {
      const expected = value.files[position];
      if (record.sourceArtifact !== artifacts[position] || record.artifact !== expected.artifact || record.sha256 !== expected.sha256 || record.bytes !== expected.bytes) throw Error('TRANSPORT_RECORDS_INVALID');
      const actual = await authenticate(regular(source, record.artifact).file, sourceRecords[position], captureKey);
      if (actual.plaintextSha256 !== record.plaintextSha256 || actual.plaintextBytes !== record.plaintextBytes) throw Error('TRANSPORT_PLAINTEXT_MISMATCH');
    }
    for (const record of metadata.records) {
      const file = path.join(target, record.sourceArtifact);
      fs.copyFileSync(regular(source, record.artifact).file, file, fs.constants.COPYFILE_EXCL);
      const actual = await hashFile(file);
      if (actual.bytes !== record.bytes || actual.sha256 !== record.sha256) throw Error('TRANSPORT_CHANGED_DURING_RESTORE');
    }
    fs.writeFileSync(path.join(target, 'manifest.json'), manifestBytes, { flag: 'wx', mode: 0o600 });
    const result = { root: target, anchor: metadata.captureAnchor, key: captureKey, scope: value.scope };
    captureKey = null; return result; // Caller passes key to existing restore helper and zeroes it afterwards.
  } finally { metadataKey?.fill(0); metadataBytes?.fill(0); captureKey?.fill(0); }
}
module.exports = { createPackage, restorePackage };
