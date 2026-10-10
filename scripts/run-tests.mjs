// CI test runner: gives every suite the fresh, empty, rate-limit-free server
// it was written against.
//
// Why this exists instead of `node scripts/x.mjs && node scripts/y.mjs`:
//
//   1. Fresh DB per suite. auth-flow-test asserts "fresh DB → first register
//      bootstraps as ADMIN", so suites sharing one process see each other's
//      leftovers and fail on assumptions that were never true for them.
//   2. Fresh rate-limit buckets per suite. /api/v1/auth/ allows 60 req/min and
//      /api/v1/comments/ 30; a second suite on a warm server is throttled with
//      429 and reports the throttle as if it were the bug under test.
//   3. DATABASE_URL is forced empty so the server uses in-memory storage —
//      which is what every suite here expects, and what CI gets for free
//      because no .env is committed.
//
// Usage:  node scripts/run-tests.mjs [--only <suite-substring>] [--keep]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

// name + whether it boots the API itself (sql-check validates DDL directly).
const SUITES = [
  { file: 'sql-check.mjs', server: false, why: 'real-Postgres DDL via PGLite' },
  { file: 'auth-flow-test.mjs', server: true, why: 'register/login/2FA/sessions' },
  { file: 'profile-fields-test.mjs', server: true, why: 'location + techTags round trip' },
  { file: 'api-key-test.mjs', server: true, why: 'key lifecycle + scopes' },
  { file: 'downloads-test.mjs', server: true, why: 'download catalog + counts' },
  { file: 'comments-test.mjs', server: true, why: 'threading + moderation' },
  { file: 'server-orders-test.mjs', server: true, why: 'server-request orders + embed + sandbox console' },
  { file: 'analytics-test.mjs', server: true, why: 'analytics insights + report (native or Python)' },
  { file: 'rate-limit-test.mjs', server: true, why: 'per-IP ceilings (Go service or native fallback)' },
];

const PORT = process.env.TEST_PORT || '3000';
const BASE = `http://127.0.0.1:${PORT}/api/v1`;

if (!process.env.SKIP_BUILD_CHECK && !existsSync('dist/server.cjs')) {
  console.error(
    'dist/server.cjs not found — the suites boot the built API.\n' +
      'Run `npm run build` first (CI does this as a separate step).',
  );
  process.exit(2);
}
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;
const keep = process.argv.includes('--keep');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Boot dist/server.cjs with a clean in-memory store; resolve when healthy. */
async function startServer() {
  const child = spawn(process.execPath, ['dist/server.cjs'], {
    env: {
      ...process.env,
      // Empty (not deleted): dotenv will not override an existing key, and ''
      // is falsy so pg.ts skips the pool. Deleted would let .env re-add it.
      DATABASE_URL: '',
      NODE_ENV: 'development',
      // Test-only local bootstrap; production always requires ADMIN_EMAILS.
      ALLOW_FIRST_USER_ADMIN: 'true',
      PORT,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));

  for (let i = 0; i < 45; i++) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode}):\n${log.join('').slice(-1200)}`);
    }
    try {
      const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return child;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  child.kill('SIGKILL');
  throw new Error(`server never became healthy:\n${log.join('').slice(-1200)}`);
}

function runSuite(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [`scripts/${file}`], {
      env: { ...process.env, TEST_BASE: BASE },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

const stop = (child) =>
  new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.once('close', resolve);
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 4000).unref?.();
  });

/**
 * The gateway process is restarted per suite, so its NATIVE buckets are fresh
 * by construction (see the header). The shared Go store outlives it — that is
 * the whole point of a shared bucket — so when RATELIMIT_SERVICE_URL is set we
 * clear it here too, otherwise earlier suites leave warm buckets behind and the
 * "fresh, empty, rate-limit-free server" contract silently stops holding.
 *
 * No-op when the variable is unset or the service is unreachable: the native
 * limiter is fresh anyway and the suite then exercises the fallback path.
 */
async function resetSharedRateLimit() {
  const base = String(process.env.RATELIMIT_SERVICE_URL || '').trim().replace(/\/+$/, '');
  if (!base) return;
  try {
    const headers = { 'content-type': 'application/json' };
    const token = process.env.RATELIMIT_SERVICE_TOKEN;
    if (token) headers['x-internal-token'] = token;
    const res = await fetch(`${base}/v1/rate/reset`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ all: true }),
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      console.log(`  (shared rate-limit buckets cleared: ${body.cleared ?? '?'} dropped)`);
    }
  } catch {
    /* unreachable — the suite runs against the native fallback */
  }
}

const selected = SUITES.filter((s) => !only || s.file.includes(only));
if (selected.length === 0) {
  console.error(`No suite matches "--only ${only}"`);
  process.exit(2);
}

const results = [];
for (const suite of selected) {
  process.stdout.write(`\n=== ${suite.file}  (${suite.why}) ===\n`);
  let server = null;
  try {
    if (suite.server) {
      server = await startServer();
      await resetSharedRateLimit();
    }
    const { code, out } = await runSuite(suite.file);
    // Keep only the verdict lines; the body is noisy and CI shows it on failure.
    const lines = out.split(/\r?\n/);
    const verdict = lines.filter((l) => /FAIL|failed|PASSED|FAILED/.test(l));
    console.log(verdict.slice(-6).join('\n') || out.trim().split(/\r?\n/).slice(-3).join('\n'));
    results.push({ ...suite, code });
    if (code !== 0) {
      // A red suite must be readable in CI, so dump it in full on failure.
      console.log('\n--- full output ---');
      console.log(out.trim());
    }
  } catch (err) {
    console.error(String(err.message || err));
    results.push({ ...suite, code: 1 });
  } finally {
    if (server && !keep) await stop(server);
  }
}

console.log('\n================ SUMMARY ================');
let failed = 0;
for (const r of results) {
  const mark = r.code === 0 ? 'PASS' : 'FAIL';
  if (r.code !== 0) failed++;
  console.log(`  ${mark}  ${r.file}`);
}
console.log(
  failed
    ? `\n${failed} suite(s) failed`
    : `\nAll ${results.length} suites passed`,
);
process.exit(failed ? 1 : 0);
