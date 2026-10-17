const net = require('node:net');
async function acquire({ socketPath, durationMs = 120000, drainMs = 30000, requestTimeoutMs = drainMs + 5000 }) {
  if (process.platform !== 'linux' || !/^\/tmp\/nnx-backup-gate-[A-Za-z0-9]+\/control\.sock$/.test(socketPath)) throw Error('PRIVATE_LINUX_SOCKET_REQUIRED');
  const socket = net.createConnection(socketPath), controller = new AbortController();
  let pending, buffer = '', epoch, id, deadline;
  function lost() { controller.abort(Error('BACKUP_LEASE_LOST')); if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.reject(Error('BACKUP_LEASE_LOST')); } }
  socket.on('error', lost); socket.on('close', lost);
  socket.on('data', chunk => {
    buffer += chunk.toString('utf8');
    if (buffer.length > 8192 || !pending) { socket.destroy(); return; }
    if (!buffer.endsWith('\n')) return;
    const value = buffer; buffer = ''; const p = pending; pending = null; clearTimeout(p.timer);
    try { const reply = JSON.parse(value); if (!reply.ok) throw Error(reply.error || 'BACKUP_LEASE_REFUSED'); p.resolve(reply.status); } catch (error) { p.reject(error); }
  });
  function request(value, timeoutMs) {
    if (pending || controller.signal.aborted) return Promise.reject(Error('BACKUP_LEASE_LOST'));
    return new Promise((resolve, reject) => {
      pending = { resolve, reject, timer: setTimeout(() => { socket.destroy(); lost(); }, timeoutMs) };
      socket.write(JSON.stringify(value) + '\n');
    });
  }
  try {
    const initial = await request({ op: 'acquire', durationMs, drainMs }, requestTimeoutMs);
    if (initial.kind !== 'COOPERATIVE_REQUEST_DRAIN_V1' || initial.state !== 'PAUSED' || initial.active !== 0 || !initial.leaseId || !initial.epoch || initial.remainingMs < 1) throw Error('BACKUP_LEASE_INVALID');
    epoch = initial.epoch; id = initial.leaseId;
    // Independent client watchdog invalidates capture even if the server event loop stalls.
    deadline = setTimeout(() => { socket.destroy(); lost(); }, Math.max(1, initial.remainingMs));
    return { initial, signal: controller.signal,
      async assert() {
        const status = await request({ op: 'assert', leaseId: id }, 5000);
        if (status.epoch !== epoch || status.leaseId !== id || status.state !== 'PAUSED' || status.active !== 0 || status.remainingMs < 1) throw Error('BACKUP_LEASE_INVALID');
        return status;
      },
      async close() { clearTimeout(deadline); try { if (!controller.signal.aborted) await request({ op: 'release', leaseId: id }, 1000); } finally { socket.destroy(); } }
    };
  } catch (error) { clearTimeout(deadline); socket.destroy(); throw error; }
}
module.exports = { acquire };
