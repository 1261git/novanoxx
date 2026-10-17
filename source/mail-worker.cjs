'use strict';

// Sending is a separate switch from account verification. Missing settings must
// never turn an enabled authentication flow into an unrestricted mail sender.
function sendPaused(env = process.env) {
  const value = env.NNX_MAIL_SEND_PAUSED;
  if (value !== undefined && value !== '0' && value !== '1') {
    throw Error('MAIL_PAUSE_FLAG_REQUIRED');
  }
  return value !== '0';
}

function create({ mail, gate, paused = true, intervalMs = 5000, onError = () => {} }) {
  if (typeof mail?.recover !== 'function' || typeof mail?.dispatch !== 'function' ||
      typeof gate?.runTask !== 'function' || typeof paused !== 'boolean' ||
      !Number.isSafeInteger(intervalMs) || intervalMs < 1 || typeof onError !== 'function') {
    throw Error('MAIL_BACKGROUND_BACKUP_GATE_REQUIRED');
  }
  let timer = null, inFlight = null, stopped = false;

  function tick() {
    if (stopped || paused) return Promise.resolve({ skipped: stopped ? 'STOPPED' : 'PAUSED' });
    if (inFlight) return inFlight;
    inFlight = gate.runTask(async () => {
      mail.recover();
      return mail.dispatch({ limit: 5 });
    }).finally(() => { inFlight = null; });
    return inFlight;
  }

  function start() {
    if (stopped || timer || paused) return;
    timer = setInterval(() => { tick().catch(() => onError()); }, intervalMs);
    timer.unref();
  }

  async function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
    // Do not release backup admission until the provider response and outbox
    // update finish. Stopping does not revoke or erase an uncertain submission.
    await inFlight;
  }

  return { start, tick, stop };
}

module.exports = { create, sendPaused };
