const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const transport = require('./backup-offsite-package.cjs'), recovery = require('./backup-recovery-key.cjs');
const root = fs.mkdtempSync(path.resolve(__dirname, '.sandbox-commerce/nnx-offsite-package-test-'));
const source = path.join(root, 'source'); fs.mkdirSync(source);
const key = crypto.randomBytes(32), scope = 'SYNTHETIC_OFFSITE_FIXTURE_ONLY';
const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const empty = name => { const value = path.join(root, name); fs.mkdirSync(value); return value; };
function artifact(name, bytes) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  fs.writeFileSync(path.join(source, name), Buffer.concat([cipher.update(bytes), cipher.final()]), { flag: 'wx' });
  return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex') };
}
const files = [
  { name: 'accounts/reservation-policy.json', bytes: Buffer.from('{"fixture":"SECRET_SYNTHETIC_POLICY","reserved":12}') },
  { name: 'quarantine/partial-video.bin', bytes: crypto.randomBytes(8192) }
];
const manifest = { version: 1, scope, database: artifact('database.enc', Buffer.from('synthetic archive, never a real database')),
  files: files.map((file, i) => ({ name: file.name, artifact: 'file-' + i + '.enc', bytes: file.bytes.length, sha: sha(file.bytes), ...artifact('file-' + i + '.enc', file.bytes) })),
  catalog: { roles: [{ name: 'SECRET_SYNTHETIC_ROLE' }] }, fingerprint: { syntheticOnly: true } };
const originalManifest = Buffer.from(JSON.stringify(manifest, null, 2)); fs.writeFileSync(path.join(source, 'manifest.json'), originalManifest, { flag: 'wx' });
const captureAnchor = sha(originalManifest); let packaged;
test('all backup metadata and capture key stay encrypted; exact original candidate is reconstructed', async () => {
  const destination = empty('package');
  packaged = await transport.createPackage({ captureRoot: source, captureAnchor, key, recipientPublicKey: publicKey, destination, scope });
  for (const name of fs.readdirSync(destination)) {
    const bytes = fs.readFileSync(path.join(destination, name));
    for (const secret of ['SECRET_SYNTHETIC_ROLE', 'SECRET_SYNTHETIC_POLICY', 'accounts/reservation-policy.json', key.toString('base64')]) assert(!bytes.includes(Buffer.from(secret)));
  }
  const target = empty('restored');
  const restored = await transport.restorePackage({ packageRoot: destination, indexAnchor: packaged.indexAnchor, privateKey: pair.privateKey, destination: target });
  assert.equal(restored.anchor, captureAnchor); assert(restored.key.equals(key));
  assert(fs.readFileSync(path.join(target, 'manifest.json')).equals(originalManifest));
  for (const name of fs.readdirSync(source)) assert(fs.readFileSync(path.join(source, name)).equals(fs.readFileSync(path.join(target, name))));
  restored.key.fill(0);
  console.log(JSON.stringify({ scope, root, files: 3, transportAndReconstruction: 'PASS', existingSourcePreserved: true, productionData: false }));
});
test('independent anchor and correct recipient are required before any restored files are written', async () => {
  const wrongAnchorTarget = empty('wrong-anchor'), wrongRecipientTarget = empty('wrong-recipient');
  await assert.rejects(transport.restorePackage({ packageRoot: packaged.root, indexAnchor: '0'.repeat(64), privateKey: pair.privateKey, destination: wrongAnchorTarget }), /INDEX_ANCHOR_REQUIRED/);
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
  await assert.rejects(transport.restorePackage({ packageRoot: packaged.root, indexAnchor: packaged.indexAnchor, privateKey: other.privateKey, destination: wrongRecipientTarget }), /INDEX_INVALID/);
  assert.deepEqual(fs.readdirSync(wrongAnchorTarget), []); assert.deepEqual(fs.readdirSync(wrongRecipientTarget), []);
});
test('wrong capture key, occupied targets and source overlap refuse packaging while old records survive', async () => {
  const wrong = empty('wrong-capture-key');
  await assert.rejects(transport.createPackage({ captureRoot: source, captureAnchor, key: crypto.randomBytes(32), recipientPublicKey: publicKey, destination: wrong, scope }));
  assert.deepEqual(fs.readdirSync(wrong), []);
  const occupied = empty('occupied'); fs.writeFileSync(path.join(occupied, 'KEEP'), 'old-test-record', { flag: 'wx' });
  await assert.rejects(transport.createPackage({ captureRoot: source, captureAnchor, key, recipientPublicKey: publicKey, destination: occupied, scope }), /TARGET_NOT_EMPTY/);
  await assert.rejects(transport.createPackage({ captureRoot: source, captureAnchor, key, recipientPublicKey: publicKey, destination: source, scope }), /OVERLAP/);
  assert.equal(fs.readFileSync(path.join(occupied, 'KEEP'), 'utf8'), 'old-test-record');
});
test('corrupted transport payload and relabeled synthetic package are rejected before reconstruction', async () => {
  const corrupt = empty('corrupt-copy'); for (const name of fs.readdirSync(packaged.root)) fs.copyFileSync(path.join(packaged.root, name), path.join(corrupt, name), fs.constants.COPYFILE_EXCL);
  const bytes = fs.readFileSync(path.join(corrupt, 'payload-0.enc')); bytes[0] ^= 1; fs.writeFileSync(path.join(corrupt, 'payload-0.enc'), bytes);
  const corruptTarget = empty('corrupt-target');
  await assert.rejects(transport.restorePackage({ packageRoot: corrupt, indexAnchor: packaged.indexAnchor, privateKey: pair.privateKey, destination: corruptTarget }), /CIPHERTEXT_MISMATCH/);
  assert.deepEqual(fs.readdirSync(corruptTarget), []);
  const relabel = empty('relabel-copy'); for (const name of fs.readdirSync(packaged.root)) fs.copyFileSync(path.join(packaged.root, name), path.join(relabel, name), fs.constants.COPYFILE_EXCL);
  const index = JSON.parse(fs.readFileSync(path.join(relabel, 'index.json'), 'utf8')); index.scope = 'OPERATING_READONLY_CANDIDATE_RESTORE_NOT_VERIFIED';
  const changed = Buffer.from(JSON.stringify(index)); fs.writeFileSync(path.join(relabel, 'index.json'), changed);
  const relabelTarget = empty('relabel-target');
  await assert.rejects(transport.restorePackage({ packageRoot: relabel, indexAnchor: sha(changed), privateKey: pair.privateKey, destination: relabelTarget }), /SCOPE_REQUIRED/);
  assert.deepEqual(fs.readdirSync(relabelTarget), []);
});
test('legacy operator confirmation cannot become a proven operating capture', async () => {
  const operating = empty('unfrozen-operating-shape');
  const value = { ...manifest, scope: 'OPERATING_READONLY_CANDIDATE_RESTORE_NOT_VERIFIED', freeze: 'OPERATOR_CONFIRMED_ALL_WRITERS_STOPPED',
    source: { service: 'srv-db5aqunlk1mc739bi0m0', host: 'dpg-db5ps6navr4c739lilj0-a', database: 'novanoxx_jk4i' } };
  const bytes = Buffer.from(JSON.stringify(value)); fs.writeFileSync(path.join(operating, 'manifest.json'), bytes, { flag: 'wx' });
  await assert.rejects(transport.createPackage({ captureRoot: operating, captureAnchor: sha(bytes), key, recipientPublicKey: publicKey, destination: empty('unfrozen-output'), scope: value.scope }), /CAPTURE_PROOF_REQUIRED/);
});

test('cooperative proof roundtrips as a candidate and an expired lease cannot be packaged', async () => {
  // Fabricated schema fixture only; no operating capture, PG dump, or network.
  const candidate = empty('cooperative-schema-fixture'), candidateScope = 'OPERATING_READONLY_CANDIDATE_RESTORE_NOT_VERIFIED';
  const freeze = { version: 1, kind: 'OBSERVED_COOPERATIVE_GATE_AND_LOCAL_IDLE_DATABASE_CLIENTS', service: 'srv-db5aqunlk1mc739bi0m0', instance: 'FABRICATED_UNIT_FIXTURE_ONLY', bootSha256: 'a'.repeat(64), idleClients: 1,
    gate: { epoch: 'c'.repeat(36), leaseId: 'd'.repeat(36), pid: 1, state: 'PAUSED', active: 0, remainingMs: 1000 },
    writers: [{ pid: 1, mainServer: true, state: 'S', startTime: '123', commandSha256: 'b'.repeat(64) }] };
  for (const name of fs.readdirSync(source).filter(name => name !== 'manifest.json')) fs.copyFileSync(path.join(source, name), path.join(candidate, name), fs.constants.COPYFILE_EXCL);
  const candidateManifest = { ...manifest, scope: candidateScope, freeze, source: { service: freeze.service, host: 'dpg-db5ps6navr4c739lilj0-a', database: 'novanoxx_jk4i' } };
  const bytes = Buffer.from(JSON.stringify(candidateManifest)); fs.writeFileSync(path.join(candidate, 'manifest.json'), bytes, { flag: 'wx' });
  const bundle = await transport.createPackage({ captureRoot: candidate, captureAnchor: sha(bytes), key, recipientPublicKey: publicKey, destination: empty('cooperative-package'), scope: candidateScope });
  const destination = empty('cooperative-restored'), restored = await transport.restorePackage({ packageRoot: bundle.root, indexAnchor: bundle.indexAnchor, privateKey: pair.privateKey, destination });
  assert(fs.readFileSync(path.join(destination, 'manifest.json')).equals(bytes)); assert(restored.key.equals(key)); restored.key.fill(0);
  candidateManifest.freeze.gate.remainingMs = 0; const expired = Buffer.from(JSON.stringify(candidateManifest)); fs.writeFileSync(path.join(candidate, 'manifest.json'), expired);
  await assert.rejects(transport.createPackage({ captureRoot: candidate, captureAnchor: sha(expired), key, recipientPublicKey: publicKey, destination: empty('expired-cooperative-output'), scope: candidateScope }), /CAPTURE_PROOF_REQUIRED/);
});
