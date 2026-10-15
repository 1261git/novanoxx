// Cooperative admission control. No database writes, signals, or public control route.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), net = require('node:net');
const { performance } = require('node:perf_hooks');
function createGate({ binding = {}, maxLeaseMs = 300000 } = {}) {
  if (!Number.isSafeInteger(maxLeaseMs) || maxLeaseMs < 100 || maxLeaseMs > 300000) throw Error('LEASE_LIMIT_INVALID');
  const epoch = crypto.randomUUID(); let active = 0, lease = null, closed = false;
  const listeners = new Set();
  const snapshot = () => ({ version: 1, kind: 'COOPERATIVE_REQUEST_DRAIN_V1', epoch, ...binding,
    state: lease ? (active ? 'DRAINING' : 'PAUSED') : 'OPEN', active,
    leaseId: lease?.id || null, remainingMs: lease ? Math.max(0, Math.floor(lease.deadline - performance.now())) : 0 });
  function release(id, reason = 'RELEASED') {
    if (!lease || lease.id !== id) return false;
    const old = lease; lease = null; clearTimeout(old.timer);
    old.controller.abort(Error(reason)); for (const fn of listeners) fn(); return true;
  }
  function enter() {
    if (closed || lease) return null;
    active++; let finished = false;
    return () => { if (finished) return; finished = true; active--; for (const fn of listeners) fn(); };
  }
  async function acquire({ durationMs = 120000, drainMs = 30000 } = {}) {
    if (closed || lease) throw Error('LEASE_BUSY');
    if (!Number.isSafeInteger(durationMs) || durationMs < 100 || durationMs > maxLeaseMs ||
        !Number.isSafeInteger(drainMs) || drainMs < 1 || drainMs >= durationMs) throw Error('LEASE_LIMIT_INVALID');
    const current = { id: crypto.randomUUID(), deadline: performance.now() + durationMs, controller: new AbortController() };
    lease = current;
    current.timer = setTimeout(() => release(current.id, 'LEASE_DEADLINE_EXPIRED'), durationMs);
    try {
      if (active) await new Promise((resolve, reject) => {
        let timer;
        const cleanup = () => { clearTimeout(timer); listeners.delete(changed); current.controller.signal.removeEventListener('abort', aborted); };
        const changed = () => { if (!active) { cleanup(); resolve(); } };
        const aborted = () => { cleanup(); reject(Error('LEASE_LOST')); };
        timer = setTimeout(() => { cleanup(); reject(Error('DRAIN_TIMEOUT')); }, drainMs);
        listeners.add(changed); current.controller.signal.addEventListener('abort', aborted, { once: true }); changed();
      });
      if (lease !== current || current.controller.signal.aborted) throw Error('LEASE_LOST');
      return { ...snapshot(), signal: current.controller.signal };
    } catch (error) { release(current.id, 'DRAIN_FAILED'); throw error; }
  }
  function wrap(handler) {
    return (req, res) => {
      let requestPath; try { requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
      // This route's existing handler only SELECTs; no auth/session/profile code executes.
      const health = req.method === 'GET' && requestPath === '/api/health';
      const done = health ? () => {} : enter();
      if (!done) { res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '5' }); res.end(JSON.stringify({ error: '백업 점검 중입니다. 잠시 후 다시 시도해 주세요.' })); return; }
      let handlerDone = false, responseDone = false;
      const finish = () => { if (handlerDone && responseDone) done(); };
      const responseFinished = () => { responseDone = true; finish(); };
      res.once('finish', responseFinished); res.once('close', responseFinished);
      Promise.resolve().then(() => handler(req, res)).catch(() => {
        if (!res.headersSent) res.writeHead(500).end(); else res.destroy();
      }).finally(() => { handlerDone = true; finish(); });
    };
  }
  async function runTask(task) {
    const done = enter(); if (!done) throw Error('BACKUP_ADMISSION_CLOSED');
    try { return await task(); } finally { done(); }
  }
  function assert(id) {
    const value = snapshot();
    if (value.leaseId !== id || value.state !== 'PAUSED' || value.remainingMs <= 0) throw Error('LEASE_NOT_PAUSED');
    return value;
  }
  return { snapshot, acquire, release, assert, wrap, runTask, close() { closed = true; if (lease) release(lease.id, 'GATE_CLOSED'); } };
}
function listenControl(gate, socketPath) {
  // The caller must provide a fresh socket in its private, owner-only directory.
  if (process.platform !== 'linux' || !path.isAbsolute(socketPath) || !socketPath.startsWith('/tmp/nnx-backup-gate-')) throw Error('PRIVATE_LINUX_SOCKET_REQUIRED');
  const parent = path.dirname(socketPath), stat = fs.lstatSync(parent);
  if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(parent) !== parent || stat.uid !== process.getuid() || (stat.mode & 0o077) || fs.existsSync(socketPath)) throw Error('PRIVATE_SOCKET_DIRECTORY_REQUIRED');
  const connections = new Set();
  const server = net.createServer(socket => {
    connections.add(socket); let buffer = '', ownedId = null, pending = false;
    socket.on('error', () => {});
    socket.once('close', () => { connections.delete(socket); if (ownedId) gate.release(ownedId, 'OWNER_DISCONNECTED'); });
    socket.on('data', async chunk => {
      buffer += chunk.toString('utf8');
      if (pending || buffer.length > 2048 || buffer.indexOf('\n') !== buffer.lastIndexOf('\n')) { socket.destroy(); return; }
      if (!buffer.endsWith('\n')) return;
      const line = buffer; buffer = ''; pending = true;
      const reply = value => { if (!socket.destroyed) socket.write(JSON.stringify(value) + '\n'); };
      try {
        const request = JSON.parse(line);
        if (request.op === 'acquire' && !ownedId) {
          if (gate.snapshot().leaseId) throw Error('LEASE_BUSY');
          // Capture the id synchronously before the drain await so disconnect cancels it too.
          const acquiring = gate.acquire({ durationMs: request.durationMs, drainMs: request.drainMs });
          ownedId = gate.snapshot().leaseId;
          const { signal, ...status } = await acquiring;
          if (socket.destroyed) { gate.release(ownedId, 'OWNER_DISCONNECTED'); return; }
          reply({ ok: true, status });
        } else if (request.op === 'assert' && ownedId && request.leaseId === ownedId) reply({ ok: true, status: gate.assert(ownedId) });
        else if (request.op === 'release' && ownedId && request.leaseId === ownedId) reply({ ok: gate.release(ownedId), status: gate.snapshot() });
        else reply({ ok: false, error: 'CONTROL_REQUEST_REFUSED' });
      } catch (error) { reply({ ok: false, error: ['LEASE_BUSY', 'DRAIN_TIMEOUT', 'LEASE_LIMIT_INVALID', 'LEASE_LOST', 'LEASE_NOT_PAUSED'].includes(error.message) ? error.message : 'CONTROL_REQUEST_REFUSED' }); }
      finally { pending = false; }
    });
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, () => {
    fs.chmodSync(socketPath, 0o600);
    resolve({ path: socketPath, close: () => new Promise(resolveClose => { for (const socket of connections) socket.destroy(); server.close(resolveClose); }) });
  }); });
}
function configured() {
  if (process.env.NNX_BACKUP_GATE !== '1') return { wrap: handler => handler, ready: Promise.resolve(null) };
  if (process.platform !== 'linux' || !process.env.RENDER_SERVICE_ID || !process.env.RENDER_INSTANCE_ID) throw Error('BACKUP_GATE_RUNTIME_BINDING_REQUIRED');
  const root = fs.mkdtempSync('/tmp/nnx-backup-gate-'); fs.chmodSync(root, 0o700);
  const binding = { service: process.env.RENDER_SERVICE_ID, instance: process.env.RENDER_INSTANCE_ID, pid: process.pid,
    bootSha256: crypto.createHash('sha256').update(fs.readFileSync('/proc/sys/kernel/random/boot_id')).digest('hex') };
  const gate = createGate({ binding });
  const ready = listenControl(gate, path.join(root, 'control.sock')).then(control => {
    console.log('NNX_BACKUP_GATE_READY ' + JSON.stringify({ socket: control.path, ...binding })); return control;
  });
  return { ...gate, ready };
}
module.exports = { createGate, listenControl, configured };
