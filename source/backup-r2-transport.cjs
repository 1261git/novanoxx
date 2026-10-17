// R2 transport for encrypted packages only. Never uploads manifest.json or decrypts data.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Transform } = require('node:stream'), { pipeline } = require('node:stream/promises');
const BUCKET = 'novanoxx-private-backups', ENDPOINT = 'https://26fa9902e2359e7c8504081c66e34021.r2.cloudflarestorage.com';
const SYNTHETIC = 'SYNTHETIC_OFFSITE_FIXTURE_ONLY', OPERATING = 'OPERATING_READONLY_CANDIDATE_RESTORE_NOT_VERIFIED';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function indexCheck(bytes, anchor, allowOperating, maximumOperatingBytes = 100 * 1024 * 1024) {
  if (!/^[a-f0-9]{64}$/.test(anchor || '') || sha(bytes) !== anchor) throw Error('TRUSTED_INDEX_ANCHOR_REQUIRED');
  if (bytes.length > 2 * 1024 * 1024) throw Error('INDEX_SIZE_LIMIT');
  const value = JSON.parse(bytes);
  if (value.version !== 1 || ![SYNTHETIC, OPERATING].includes(value.scope) || !/^[a-f0-9-]{36}$/.test(value.id || '') ||
      !/^[a-f0-9]{64}$/.test(value.keyFingerprint || '') || !Array.isArray(value.files) || !value.files.length || value.files.length > 10001 ||
      value.metadata?.artifact !== 'recovery-metadata.enc.json') throw Error('PACKAGE_INDEX_INVALID');
  if (value.scope === OPERATING && allowOperating !== true) throw Error('OPERATING_TRANSFER_EXPLICIT_APPROVAL_REQUIRED');
  const records = [...value.files, value.metadata], names = new Set(); let total = bytes.length;
  for (const record of records) {
    if (!/^(payload-\d+\.enc|recovery-metadata\.enc\.json)$/.test(record.artifact || '') || names.has(record.artifact) ||
        !Number.isSafeInteger(record.bytes) || record.bytes < 0 || record.bytes > 5 * 1024 ** 3 || !/^[a-f0-9]{64}$/.test(record.sha256 || '')) throw Error('PACKAGE_RECORD_INVALID');
    names.add(record.artifact); total += record.bytes;
  }
  if (!Number.isSafeInteger(total) || value.scope === SYNTHETIC && total >= 1048576) throw Error('SYNTHETIC_TRANSFER_LIMIT');
  // The next proposed operating validation is one package, at most 100MiB.
  // Larger transfers require a newly reviewed scope; never upload a partial subset.
  if (value.scope === OPERATING && total > maximumOperatingBytes) throw Error('OPERATING_TRANSFER_SIZE_APPROVAL_LIMIT');
  return { value, records, total };
}
function regular(root, name) {
  const file = path.join(root, name), stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw Error('PACKAGE_REGULAR_FILE_REQUIRED');
  return { file, bytes: stat.size };
}
async function inspect(file) {
  const hash = crypto.createHash('sha256'); let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) { bytes += chunk.length; hash.update(chunk); }
  return { bytes, sha256: hash.digest('hex') };
}
function createTransport({ sdk, credentials, allowOperating = false, progress = () => {}, namespace = 'manual', maximumOperatingBytes = 100 * 1024 * 1024 }) {
  if (!['manual','automated-v1/daily','automated-v1/weekly'].includes(namespace) || !Number.isSafeInteger(maximumOperatingBytes) || maximumOperatingBytes < 1 || maximumOperatingBytes > 512 * 1024 * 1024) throw Error('R2_TRANSPORT_POLICY_REQUIRED');
  if (credentials.bucket !== BUCKET || credentials.endpoint !== ENDPOINT) throw Error('APPROVED_R2_BINDING_REQUIRED');
  const client = new sdk.S3Client({ region: 'auto', endpoint: ENDPOINT, forcePathStyle: true, maxAttempts: 1,
    credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  const send = command => client.send(command, { abortSignal: AbortSignal.timeout(600000) });
  const prefix = value => { if (namespace !== 'manual' && value.scope !== OPERATING || (value.namespace || 'manual') !== namespace) throw Error('R2_NAMESPACE_BINDING_REQUIRED'); return 'bundles/' + (namespace === 'manual' ? (value.scope === SYNTHETIC ? 'synthetic' : 'operating-candidate') : namespace) + '/' + value.id + '/'; };
  async function getBytes(key, maximum) {
    const response = await send(new sdk.GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const chunks = []; let count = 0;
    try { for await (const chunk of response.Body) { count += chunk.length; if (count > maximum) throw Error('REMOTE_OBJECT_SIZE_LIMIT'); chunks.push(chunk); } }
    finally { response.Body.destroy?.(); }
    return Buffer.concat(chunks);
  }
  async function remoteHash(key, expected) {
    const response = await send(new sdk.GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const hash = crypto.createHash('sha256'); let bytes = 0;
    try {
      for await (const chunk of response.Body) { bytes += chunk.length; if (bytes > expected.bytes) throw Error('REMOTE_OBJECT_SIZE_LIMIT'); hash.update(chunk); }
    } finally { response.Body.destroy?.(); }
    if (bytes !== expected.bytes || hash.digest('hex') !== expected.sha256) throw Error('REMOTE_OBJECT_MISMATCH');
  }
  async function publishPackage({ packageRoot, indexAnchor }) {
    const root = fs.realpathSync(packageRoot), indexFile = regular(root, 'index.json');
    if (indexFile.bytes > 2 * 1024 * 1024) throw Error('INDEX_SIZE_LIMIT');
    const bytes = fs.readFileSync(indexFile.file), checked = indexCheck(bytes, indexAnchor, allowOperating, maximumOperatingBytes), base = prefix({ ...checked.value, namespace });
    for (const record of checked.records) {
      const actual = await inspect(regular(root, record.artifact).file);
      if (actual.bytes !== record.bytes || actual.sha256 !== record.sha256) throw Error('LOCAL_PACKAGE_MISMATCH');
    }
    let created = 0, reused = 0;
    // The trusted index is the commit marker and is always uploaded LAST.
    for (const record of [...checked.records, { artifact: 'index.json', bytes: bytes.length, sha256: indexAnchor }]) {
      const body = fs.createReadStream(regular(root, record.artifact).file);
      try {
        try { await send(new sdk.PutObjectCommand({ Bucket: BUCKET, Key: base + record.artifact, Body: body,
          ContentLength: record.bytes, ContentType: 'application/octet-stream', IfNoneMatch: '*' })); created++; }
        catch (error) { if (error.$metadata?.httpStatusCode !== 412) throw error; reused++; }
      } finally { body.destroy(); }
      await remoteHash(base + record.artifact, record);
      progress({ stage: 'verified-remote-ciphertext', artifact: record.artifact, bytes: record.bytes });
    }
    return { bucket: BUCKET, scope: checked.value.scope, id: checked.value.id, indexAnchor, prefix: base,
      objects: checked.records.length + 1, encryptedBytes: checked.total, created, reused, ...(namespace === 'manual' ? {} : { namespace }) };
  }
  async function downloadPackage({ receipt, trustedIndexAnchor, destination }) {
    if (receipt.bucket !== BUCKET || ![SYNTHETIC, OPERATING].includes(receipt.scope) || !/^[a-f0-9-]{36}$/.test(receipt.id || '')) throw Error('PACKAGE_RECEIPT_REQUIRED');
    if (receipt.scope === OPERATING && allowOperating !== true) throw Error('OPERATING_TRANSFER_EXPLICIT_APPROVAL_REQUIRED');
    const target = fs.realpathSync(destination); if (fs.readdirSync(target).length) throw Error('DOWNLOAD_TARGET_NOT_EMPTY');
    const base = prefix(receipt), bytes = await getBytes(base + 'index.json', 2 * 1024 * 1024);
    const checked = indexCheck(bytes, trustedIndexAnchor, allowOperating, maximumOperatingBytes);
    if (checked.value.id !== receipt.id || checked.value.scope !== receipt.scope) throw Error('PACKAGE_RECEIPT_MISMATCH');
    for (const record of checked.records) {
      const response = await send(new sdk.GetObjectCommand({ Bucket: BUCKET, Key: base + record.artifact }));
      const hash = crypto.createHash('sha256'); let count = 0;
      const check = new Transform({ transform(chunk, _encoding, next) {
        count += chunk.length; if (count > record.bytes) return next(Error('REMOTE_OBJECT_SIZE_LIMIT'));
        hash.update(chunk); next(null, chunk);
      } });
      await pipeline(response.Body, check, fs.createWriteStream(path.join(target, record.artifact), { flags: 'wx', mode: 0o600 }));
      if (count !== record.bytes || hash.digest('hex') !== record.sha256) throw Error('REMOTE_OBJECT_MISMATCH');
      progress({ stage: 'verified-downloaded-ciphertext', artifact: record.artifact, bytes: record.bytes });
    }
    fs.writeFileSync(path.join(target, 'index.json'), bytes, { flag: 'wx', mode: 0o600 });
    return { root: target, indexAnchor: trustedIndexAnchor, scope: checked.value.scope, id: checked.value.id };
  }
  return { publishPackage, downloadPackage, close: () => client.destroy() };
}
module.exports = { createTransport };
