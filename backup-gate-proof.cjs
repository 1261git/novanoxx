const fs = require('node:fs'), os = require('node:os'), crypto = require('node:crypto');
const observer = require('./operating-freeze-proof.cjs');
const SERVICE = 'srv-db5aqunlk1mc739bi0m0', KIND = 'OBSERVED_COOPERATIVE_GATE_AND_LOCAL_IDLE_DATABASE_CLIENTS';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function validateSummary(value) {
  return value?.version === 1 && value.kind === KIND && value.service === SERVICE && typeof value.instance === 'string' && value.instance.length > 0 &&
    /^[a-f0-9]{64}$/.test(value.bootSha256 || '') && /^[a-f0-9-]{36}$/.test(value.gate?.epoch || '') &&
    /^[a-f0-9-]{36}$/.test(value.gate?.leaseId || '') && value.gate.state === 'PAUSED' && value.gate.active === 0 &&
    value.gate.remainingMs > 0 && Number.isSafeInteger(value.gate.pid) && value.gate.pid > 0 &&
    Array.isArray(value.writers) && value.writers.length === 1 && value.writers[0].pid === value.gate.pid &&
    value.writers[0].mainServer === true && /^\d+$/.test(value.writers[0].startTime || '') &&
    /^[a-f0-9]{64}$/.test(value.writers[0].commandSha256 || '') && Number.isSafeInteger(value.idleClients) && value.idleClients >= 0;
}
async function production({ env = process.env, config }) {
  if (process.platform !== 'linux' || env.RENDER_SERVICE_ID !== SERVICE || !env.RENDER_INSTANCE_ID ||
      env.NNX_BACKUP_EXPECTED_INSTANCE !== env.RENDER_INSTANCE_ID || config?.host !== 'dpg-db5ps6navr4c739lilj0-a' || config.database !== 'novanoxx_jk4i') throw Error('FREEZE_SOURCE_BINDING_REQUIRED');
  const lease = await require('./backup-gate-client.cjs').acquire({ socketPath: env.NNX_BACKUP_GATE_SOCKET,
    durationMs: 120000, drainMs: 30000 });
  try {
    const boot = sha(fs.readFileSync('/proc/sys/kernel/random/boot_id')), initial = lease.initial;
    if (initial.service !== SERVICE || initial.instance !== env.RENDER_INSTANCE_ID || initial.bootSha256 !== boot) throw Error('GATE_SOURCE_BINDING_REQUIRED');
    const writers = observer.inspectWriters();
    // Only the single, request-driven production server is supported. Any separate
    // Node worker or converter causes refusal until it has its own drain contract.
    if (writers.length !== 1 || writers[0].pid !== initial.pid || !writers[0].mainServer) throw Error('UNCONTROLLED_WRITER_PRESENT');
    const addresses = new Set(['127.0.0.1', '::1']);
    for (const entries of Object.values(os.networkInterfaces())) for (const row of entries || []) addresses.add(row.address.replace(/^::ffff:/, ''));
    const summary = { version: 1, kind: KIND, service: SERVICE, instance: env.RENDER_INSTANCE_ID,
      bootSha256: boot, observedAt: new Date().toISOString(), writers, gate: initial, idleClients: 0 };
    async function assert() {
      if (lease.signal.aborted || sha(fs.readFileSync('/proc/sys/kernel/random/boot_id')) !== boot || env.RENDER_INSTANCE_ID !== initial.instance) throw Error('GATE_LEASE_LOST');
      const status = await lease.assert(), current = observer.inspectWriters();
      if (current.length !== 1 || current[0].pid !== writers[0].pid || current[0].startTime !== writers[0].startTime || current[0].commandSha256 !== writers[0].commandSha256) throw Error('WRITER_GENERATION_CHANGED');
      const { Client } = require('pg'), client = new Client({ ...config, application_name: 'nnx_capture_cooperative_guard', connectionTimeoutMillis: 5000, statement_timeout: 5000 });
      await client.connect();
      try {
        await client.query('BEGIN READ ONLY');
        const rows = (await client.query("SELECT state,xact_start IS NOT NULL AS in_transaction,client_addr::text AS address,usename AS user_name FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid() ORDER BY pid")).rows;
        summary.idleClients = observer.verifyClients(rows, addresses, config.user); await client.query('COMMIT');
      } finally { await client.end(); }
      summary.gate = await lease.assert(); summary.lastAssertAt = new Date().toISOString();
      if (summary.gate.pid !== status.pid || summary.gate.service !== SERVICE || summary.gate.instance !== initial.instance || !validateSummary(summary)) throw Error('GATE_PROOF_INVALID');
    }
    await assert(); return { assert, summary, close: lease.close, signal: lease.signal };
  } catch (error) { await lease.close(); throw error; }
}
module.exports = { production, validateSummary };
