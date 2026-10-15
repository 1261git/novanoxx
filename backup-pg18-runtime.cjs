const fs = require('node:fs'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const BINARY = '/usr/lib/postgresql/18/bin/pg_dump';
function check() {
  if (process.platform !== 'linux') throw Error('PG18_LINUX_RUNTIME_REQUIRED');
  let bytes; try { const stat = fs.lstatSync(BINARY); if (!stat.isFile() || stat.isSymbolicLink()) throw Error(); bytes = fs.readFileSync(BINARY); } catch { throw Error('PG18_CLIENT_NOT_INSTALLED'); }
  const result = spawnSync(BINARY, ['--version'], { encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin', LANG: 'C' }, windowsHide: true });
  if (result.error || result.status !== 0 || !/^pg_dump \(PostgreSQL\) 18(?:\.|\s)/.test(result.stdout.trim())) throw Error('PG18_CLIENT_VERSION_REQUIRED');
  return { binary: BINARY, version: result.stdout.trim(), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
module.exports = { check };
