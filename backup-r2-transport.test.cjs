const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createTransport } = require('./backup-r2-transport.cjs');
fs.mkdirSync(path.resolve('.sandbox-commerce'),{recursive:true});
const root = fs.mkdtempSync(path.resolve(__dirname, '.sandbox-commerce/nnx-r2-transport-guards-'));
let calls = 0;
const sdk = { S3Client: class { async send() { calls++; throw Error('NETWORK_MUST_NOT_START'); } destroy() {} } };
const transport = createTransport({ sdk, credentials: { bucket: 'novanoxx-private-backups',
  endpoint: 'https://26fa9902e2359e7c8504081c66e34021.r2.cloudflarestorage.com', accessKeyId: 'SYNTHETIC', secretAccessKey: 'SYNTHETIC' } });
function candidate(name, changes) {
  const folder = path.join(root, name); fs.mkdirSync(folder);
  const value = { version: 1, scope: 'SYNTHETIC_OFFSITE_FIXTURE_ONLY', id: crypto.randomUUID(), keyFingerprint: 'a'.repeat(64),
    files: [{ artifact: 'payload-0.enc', bytes: 1, sha256: 'b'.repeat(64) }],
    metadata: { artifact: 'recovery-metadata.enc.json', bytes: 1, sha256: 'c'.repeat(64) }, ...changes };
  const bytes = Buffer.from(JSON.stringify(value)); fs.writeFileSync(path.join(folder, 'index.json'), bytes, { flag: 'wx' });
  return { packageRoot: folder, indexAnchor: crypto.createHash('sha256').update(bytes).digest('hex'), value };
}
test('operating publication and download require explicit approval before any network operation', async () => {
  const value = candidate('operating', { scope: 'OPERATING_READONLY_CANDIDATE_RESTORE_NOT_VERIFIED' });
  await assert.rejects(transport.publishPackage(value), /EXPLICIT_APPROVAL_REQUIRED/);
  await assert.rejects(transport.downloadPackage({ receipt: { bucket: 'novanoxx-private-backups', scope: value.value.scope, id: value.value.id },
    trustedIndexAnchor: value.indexAnchor, destination: root }), /EXPLICIT_APPROVAL_REQUIRED/);
  assert.equal(calls, 0);
});
test('path escape and oversized synthetic transport fail without reading unrelated data or making requests', async () => {
  const bad = candidate('path-escape', { files: [{ artifact: '../private.enc', bytes: 1, sha256: 'b'.repeat(64) }] });
  const large = candidate('large', { files: [{ artifact: 'payload-0.enc', bytes: 1048576, sha256: 'b'.repeat(64) }] });
  await assert.rejects(transport.publishPackage(bad), /PACKAGE_RECORD_INVALID/);
  await assert.rejects(transport.publishPackage(large), /SYNTHETIC_TRANSFER_LIMIT/);
  assert.equal(calls, 0);
});
test('occupied download target retains its existing record and refuses network access', async () => {
  const folder = path.join(root, 'occupied'); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'KEEP'), 'existing-test', { flag: 'wx' });
  await assert.rejects(transport.downloadPackage({ receipt: { bucket: 'novanoxx-private-backups', scope: 'SYNTHETIC_OFFSITE_FIXTURE_ONLY', id: crypto.randomUUID() },
    trustedIndexAnchor: '0'.repeat(64), destination: folder }), /TARGET_NOT_EMPTY/);
  assert.equal(fs.readFileSync(path.join(folder, 'KEEP'), 'utf8'), 'existing-test'); assert.equal(calls, 0);
});

test('operating package beyond the proposed 100MiB limit refuses before payload reads or network', async () => {
  const permitted = createTransport({ sdk, allowOperating: true, credentials: { bucket: 'novanoxx-private-backups',
    endpoint: 'https://26fa9902e2359e7c8504081c66e34021.r2.cloudflarestorage.com', accessKeyId: 'SYNTHETIC', secretAccessKey: 'SYNTHETIC' } });
  const tooLarge = candidate('operating-too-large', { scope: 'OPERATING_READONLY_CANDIDATE_RESTORE_NOT_VERIFIED',
    files: [{ artifact: 'payload-0.enc', bytes: 100 * 1024 * 1024, sha256: 'b'.repeat(64) }] });
  await assert.rejects(permitted.publishPackage(tooLarge), /OPERATING_TRANSFER_SIZE_APPROVAL_LIMIT/);
  assert.equal(calls, 0); permitted.close();
});

test('only explicit automated namespaces and bounded reviewed limits can be selected',()=>{
  const credentials={bucket:'novanoxx-private-backups',endpoint:'https://26fa9902e2359e7c8504081c66e34021.r2.cloudflarestorage.com',accessKeyId:'SYNTHETIC',secretAccessKey:'SYNTHETIC'};
  for(const namespace of ['..','operating-candidate','automated-v1/unknown'])assert.throws(()=>createTransport({sdk,credentials,namespace}),/POLICY_REQUIRED/);
  assert.throws(()=>createTransport({sdk,credentials,maximumOperatingBytes:513*1048576}),/POLICY_REQUIRED/);
});
