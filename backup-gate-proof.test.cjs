const test = require('node:test'), assert = require('node:assert/strict');
const { validateSummary, production } = require('./backup-gate-proof.cjs');
const fixture = { version: 1, kind: 'OBSERVED_COOPERATIVE_GATE_AND_LOCAL_IDLE_DATABASE_CLIENTS', service: 'srv-db5aqunlk1mc739bi0m0', instance: 'synthetic-validator-fixture',
  bootSha256: 'a'.repeat(64), gate: { epoch: 'a'.repeat(36), leaseId: 'b'.repeat(36), state: 'PAUSED', active: 0, remainingMs: 1000, pid: 1 },
  writers: [{ pid: 1, mainServer: true, startTime: '123', commandSha256: 'c'.repeat(64) }], idleClients: 1 };
test('cooperative summary requires paused zero-active bound server and a live lease', () => {
  assert.equal(validateSummary(fixture), true);
  for (const [key, value] of [['state', 'OPEN'], ['active', 1], ['remainingMs', 0], ['pid', 9], ['epoch', '']]) {
    const changed = structuredClone(fixture); changed.gate[key] = value; assert.equal(validateSummary(changed), false);
  }
});
test('extra workers, wrong source, missing boot/generation evidence cannot qualify', () => {
  const extra = structuredClone(fixture); extra.writers.push({ ...extra.writers[0], pid: 22 }); assert.equal(validateSummary(extra), false);
  for (const key of ['service', 'bootSha256']) { const changed = structuredClone(fixture); changed[key] = 'wrong'; assert.equal(validateSummary(changed), false); }
  const changed = structuredClone(fixture); changed.writers[0].startTime = ''; assert.equal(validateSummary(changed), false);
  assert.equal(validateSummary('OPERATOR_CONFIRMED_ALL_WRITERS_STOPPED'), false);
});
test('production gate binding refuses the local/TEST environment before connecting', async () => {
  await assert.rejects(production({ env: { RENDER_SERVICE_ID: 'srv-db6essivcj2c73fu6460' }, config: {} }), /FREEZE_SOURCE_BINDING_REQUIRED/);
});

test('platform evidence requires a separate identity and complete kernel boundary hashes', () => {
  const row = { pid:19, kind:'ISOLATED_PORT_DETECTOR_NO_SOURCE_VOLUME',startTime:'321',sourceVolumeDevice:'8:2',commandSha256:'d'.repeat(64),cgroupSha256:'e'.repeat(64),mountInfoSha256:'f'.repeat(64) };
  assert.equal(validateSummary({...fixture,isolatedPlatformProcesses:[row]}),true);
  for (const change of [{pid:1},{kind:'UNKNOWN'},{cgroupSha256:''},{sourceVolumeDevice:''}]) assert.equal(validateSummary({...fixture,isolatedPlatformProcesses:[{...row,...change}]}),false);
  assert.equal(validateSummary({...fixture,isolatedPlatformProcesses:[row,row]}),false);
});
