const test = require('node:test'), assert = require('node:assert/strict');
const guard = require('./operating-freeze-proof.cjs');
const writer = (overrides = {}) => ({ pid: 1, kind: 'node', state: 'T', startTime: '100', commandSha256: 'same', mainServer: true, ...overrides });
test('an ordinary sleeping server does not count as frozen', () => {
  assert.throws(() => guard.verifyWriters([writer({ state: 'S' })], [1]), /WRITER_NOT_STOPPED/);
  assert.throws(() => guard.verifyWriters([writer({ state: 't' })], [1]), /WRITER_NOT_STOPPED/);
});
test('every listed server and converter must be stopped', () => {
  const rows = [writer(), writer({ pid: 8, kind: 'ffmpeg', mainServer: false })];
  assert.deepEqual(guard.verifyWriters(rows, [8, 1]), rows);
  assert.throws(() => guard.verifyWriters(rows, [1]), /WRITER_SET_CHANGED_OR_UNLISTED/);
  assert.throws(() => guard.verifyWriters([rows[0], { ...rows[1], state: 'R' }], [1, 8]), /WRITER_NOT_STOPPED/);
});
test('missing writers and reused process generations invalidate the capture', () => {
  assert.throws(() => guard.verifyWriters([], [1]), /WRITER_SET_CHANGED_OR_UNLISTED/);
  assert.throws(() => guard.verifyWriters([writer({ startTime: '101' })], [1], [writer()]), /WRITER_GENERATION_CHANGED/);
  assert.throws(() => guard.verifyWriters([writer({ commandSha256: 'replaced' })], [1], [writer()]), /WRITER_GENERATION_CHANGED/);
  assert.throws(() => guard.verifyWriters([writer({ mainServer: false })], [1]), /MAIN_SERVER_WRITER_REQUIRED/);
});
test('PID lists reject ambiguity and zero or duplicate process identifiers', () => {
  assert.deepEqual(guard.pids('8,1'), [1, 8]);
  for (const value of ['', '0', '1,1', '-1', '1, 8', 'NaN']) assert.throws(() => guard.pids(value), /WRITER_PID_SET_REQUIRED/);
});
test('active and idle-in-transaction database clients cannot pass the gate', () => {
  const idle = { state: 'idle', in_transaction: false, address: '127.0.0.1', user_name: 'app' };
  assert.equal(guard.verifyClients([idle], new Set(['127.0.0.1']), 'app'), 1);
  for (const row of [{ ...idle, state: 'active' }, { ...idle, in_transaction: true }, { ...idle, state: null }])
    assert.throws(() => guard.verifyClients([row], new Set(['127.0.0.1']), 'app'), /DATABASE_CLIENT_NOT_QUIESCENT/);
});
test('unproven remote clients and another database role are refused', () => {
  for (const row of [{ state: 'idle', in_transaction: false, address: '10.0.0.5', user_name: 'app' },
    { state: 'idle', in_transaction: false, address: '127.0.0.1', user_name: 'other' }])
    assert.throws(() => guard.verifyClients([row], new Set(['127.0.0.1']), 'app'), /UNPROVEN_DATABASE_CLIENT/);
});
test('a TEST runtime cannot supply a production freeze proof', async () => {
  await assert.rejects(guard.production({ env: { RENDER_SERVICE_ID: 'test-service' }, config: {} }), /FREEZE_SOURCE_BINDING_REQUIRED/);
});

test('PostgreSQL inet host prefixes preserve exact client identity; broader prefixes still fail', () => {
  const row={state:'idle',in_transaction:false,user_name:'app'};
  for(const address of ['127.0.0.1/32','::ffff:127.0.0.1/128'])assert.equal(guard.verifyClients([{...row,address}],new Set(['127.0.0.1']),'app'),1);
  assert.equal(guard.verifyClients([{...row,address:'::1/128'}],new Set(['::1']),'app'),1);
  for(const address of ['127.0.0.1/24','127.0.0.2/32','::1/64'])assert.throws(()=>guard.verifyClients([{...row,address}],new Set(['127.0.0.1','::1']),'app'),/UNPROVEN_DATABASE_CLIENT/);
});
