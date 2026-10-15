// Read-only evidence for an explicitly paused production writer set. Sends no signals.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), os = require('node:os');
const SERVICE = 'srv-db5aqunlk1mc739bi0m0';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function refuse(code) { throw Error(code); }
function mountRows(value) {
  return String(value).trim().split('\n').map(line => {
    const [left, right] = line.split(' - '), fields = left?.split(' ');
    if (!right || fields.length < 6 || !/^\d+:\d+$/.test(fields[2])) refuse('PROCESS_MOUNT_EVIDENCE_REQUIRED');
    return { device: fields[2], root: fields[3], point: fields[4] };
  });
}
// Render exposes a port detector from a sibling container in /proc. Do not
// suppress EACCES generally: require its kernel cgroup and mount evidence,
// exact identity, and absence of ANY mount of the source data device.
function isolatedPortDetector({ selfCgroup, selfMountInfo, cgroup, mountInfo, comm, status, cmdline, stat, pid }) {
  if (selfCgroup !== '0::/\n' || !/^0::\/\.\.\/cri-containerd-[a-f0-9]{64}\.scope\n$/.test(cgroup) ||
      comm !== 'portdetectorv2\n' || cmdline !== '/portdetectorv2\0' ||
      !/^Uid:\s+1000\s+1000\s+1000\s+1000$/m.test(status) || !/^PPid:\s+0$/m.test(status)) refuse('UNPROVEN_INACCESSIBLE_PROCESS');
  const own = mountRows(selfMountInfo), foreign = mountRows(mountInfo), data = own.filter(row => row.point === '/data');
  if (data.length !== 1 || foreign.some(row => row.device === data[0].device)) refuse('FOREIGN_PROCESS_MAY_ACCESS_SOURCE_VOLUME');
  const end = stat.lastIndexOf(')'), fields = stat.slice(end + 2).trim().split(/\s+/);
  if (end < 0 || !/^\d+$/.test(fields[19] || '')) refuse('WRITER_STAT_INVALID');
  return { pid, kind: 'ISOLATED_PORT_DETECTOR_NO_SOURCE_VOLUME', startTime: fields[19],
    commandSha256: hash(cmdline), cgroupSha256: hash(cgroup), mountInfoSha256: hash(mountInfo), sourceVolumeDevice: data[0].device };
}
function pids(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*(?:,[1-9]\d*)*$/.test(value)) refuse('WRITER_PID_SET_REQUIRED');
  const result = value.split(',').map(Number).sort((a, b) => a - b);
  if (result.length > 64 || new Set(result).size !== result.length || result.some(v => !Number.isSafeInteger(v))) refuse('WRITER_PID_SET_REQUIRED');
  return result;
}
// Only the unit fixture accepts another procRoot. The production controller fixes /proc.
function inspectProcesses({ procRoot = '/proc', skipPid = process.pid } = {}) {
  const result = [], isolated = [];
  for (const name of fs.readdirSync(procRoot).filter(n => /^\d+$/.test(n))) {
    const pid = Number(name); if (pid === skipPid) continue;
    const dir = path.join(procRoot, name);
    try {
      let executable;
      try { executable = fs.readlinkSync(path.join(dir, 'exe')); }
      catch (error) {
        if (error.code !== 'EACCES') throw error;
        isolated.push(isolatedPortDetector({ pid,
          selfCgroup: fs.readFileSync(path.join(procRoot, 'self/cgroup'), 'utf8'),
          selfMountInfo: fs.readFileSync(path.join(procRoot, 'self/mountinfo'), 'utf8'),
          cgroup: fs.readFileSync(path.join(dir, 'cgroup'), 'utf8'), mountInfo: fs.readFileSync(path.join(dir, 'mountinfo'), 'utf8'),
          comm: fs.readFileSync(path.join(dir, 'comm'), 'utf8'), status: fs.readFileSync(path.join(dir, 'status'), 'utf8'),
          cmdline: fs.readFileSync(path.join(dir, 'cmdline'), 'utf8'), stat: fs.readFileSync(path.join(dir, 'stat'), 'utf8') }));
        continue;
      }
      const kind = path.basename(executable);
      if (!/^(node|nodejs|ffmpeg|ffprobe)$/.test(kind)) continue;
      const raw = fs.readFileSync(path.join(dir, 'stat'), 'utf8'), end = raw.lastIndexOf(')');
      if (end < 0) refuse('WRITER_STAT_INVALID');
      const fields = raw.slice(end + 2).trim().split(/\s+/), command = fs.readFileSync(path.join(dir, 'cmdline'));
      if (!/^\d+$/.test(fields[19] || '')) refuse('WRITER_STAT_INVALID');
      const args = command.toString().split('\0'), cwd = fs.readlinkSync(path.join(dir, 'cwd'));
      result.push({ pid, kind, state: fields[0], startTime: fields[19], commandSha256: hash(command),
        mainServer: args.includes('/app/server.cjs') || args.includes('server.cjs') && cwd === '/app' });
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
    }
  }
  return { writers: result.sort((a, b) => a.pid - b.pid), isolated: isolated.sort((a, b) => a.pid - b.pid) };
}
function inspectWriters(options) { return inspectProcesses(options).writers; }
function verifyWriters(observed, expectedPids, previous) {
  if (!Array.isArray(observed) || !Array.isArray(expectedPids) || !observed.length ||
      new Set(observed.map(v => v.pid)).size !== observed.length ||
      JSON.stringify(observed.map(v => v.pid).sort((a, b) => a - b)) !== JSON.stringify([...expectedPids].sort((a, b) => a - b))) refuse('WRITER_SET_CHANGED_OR_UNLISTED');
  if (!observed.some(v => v.mainServer)) refuse('MAIN_SERVER_WRITER_REQUIRED');
  // S is ordinary sleep; tracing stop (t) also fails. Only observed stopped state T passes.
  if (observed.some(v => v.state !== 'T')) refuse('WRITER_NOT_STOPPED');
  if (previous && JSON.stringify(observed) !== JSON.stringify(previous)) refuse('WRITER_GENERATION_CHANGED');
  return observed;
}
function verifyClients(rows, allowedAddresses, user) {
  for (const row of rows) {
    if (row.state !== 'idle' || row.in_transaction !== false) refuse('DATABASE_CLIENT_NOT_QUIESCENT');
    const address = String(row.address || '').replace(/^::ffff:/, '');
    if (row.user_name !== user || !allowedAddresses.has(address)) refuse('UNPROVEN_DATABASE_CLIENT');
  }
  return rows.length;
}
async function production({ env = process.env, config }) {
  if (process.platform !== 'linux' || env.RENDER_SERVICE_ID !== SERVICE ||
      !env.RENDER_INSTANCE_ID || env.NNX_BACKUP_EXPECTED_INSTANCE !== env.RENDER_INSTANCE_ID ||
      config?.host !== 'dpg-db5ps6navr4c739lilj0-a' || config.database !== 'novanoxx_jk4i') refuse('FREEZE_SOURCE_BINDING_REQUIRED');
  const expectedInstance = env.RENDER_INSTANCE_ID, expected = pids(env.NNX_BACKUP_WRITER_PIDS);
  if (expected.includes(process.pid)) refuse('CAPTURE_PROCESS_IS_NOT_A_WRITER');
  const boot = hash(fs.readFileSync('/proc/sys/kernel/random/boot_id'));
  const initial = verifyWriters(inspectWriters(), expected);
  const addresses = new Set(['127.0.0.1', '::1']);
  for (const entries of Object.values(os.networkInterfaces())) for (const entry of entries || []) addresses.add(entry.address.replace(/^::ffff:/, ''));
  const { Client } = require('pg');
  async function assert() {
    if (env.RENDER_INSTANCE_ID !== expectedInstance || env.NNX_BACKUP_EXPECTED_INSTANCE !== expectedInstance || hash(fs.readFileSync('/proc/sys/kernel/random/boot_id')) !== boot) refuse('FREEZE_INSTANCE_CHANGED');
    verifyWriters(inspectWriters(), expected, initial);
    const client = new Client({ ...config, application_name: 'nnx_capture_freeze_guard', connectionTimeoutMillis: 10000, statement_timeout: 10000 });
    await client.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const rows = (await client.query("SELECT state,xact_start IS NOT NULL AS in_transaction,client_addr::text AS address,usename AS user_name FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid() ORDER BY pid")).rows;
      const count = verifyClients(rows, addresses, config.user);
      await client.query('COMMIT');
      verifyWriters(inspectWriters(), expected, initial);
      return count;
    } finally { await client.end(); }
  }
  const idleClients = await assert();
  return { assert, summary: { version: 1, kind: 'OBSERVED_LINUX_STOPPED_WRITERS_AND_LOCAL_IDLE_DATABASE_CLIENTS',
    service: SERVICE, instance: env.RENDER_INSTANCE_ID, bootSha256: boot, observedAt: new Date().toISOString(),
    writers: initial, idleClients, maintenanceModeAndOffsitePolicy: 'SEPARATE_OPERATOR_REQUIREMENTS' } };
}
module.exports = { pids, inspectWriters, inspectProcesses, isolatedPortDetector, verifyWriters, verifyClients, production };
