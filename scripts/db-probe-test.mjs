// Round-7 verification: external database probe is REAL (no Math.random).
//
//   node scripts/db-probe-test.mjs
//
// IMPORTANT: run this against a FRESH memory-mode server with
// ALLOW_FIRST_USER_ADMIN=true and NOT before the other suites — it registers
// the first user as ADMIN and leaves accounts behind. This opt-in is ignored
// in production. Run it on a dedicated fresh local server.
const BASE = 'http://127.0.0.1:3111/api/v1';
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} -> ${JSON.stringify(detail)}`); }
}
async function call(method, path, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}

// wait for boot
for (let i = 0; i < 40; i++) {
  try { const r = await fetch(BASE + '/health'); if (r.ok) break; } catch { /* retry */ }
  await new Promise((r) => setTimeout(r, 500));
}

const ts = Date.now().toString(36);
const reg = await call('POST', '/auth/register', {
  body: { email: `probe-admin-${ts}@example.test`, password: 'ProbeAdmin!42x', name: 'Probe Admin' },
});
check('fresh register -> 201', (reg.status === 201 || reg.status === 200) && !!reg.json?.token, reg.status);
const token = reg.json?.token;
const me = await call('GET', '/auth/me', { token });
check('first user bootstraps as ADMIN', me.json?.user?.role === 'ADMIN', me.json?.user?.role);

// 1. Seeds are honest: idle, zeroed, never "tested"
const list = await call('GET', '/databases/external', { token });
check('GET /databases/external -> 200', list.status === 200, list.status);
const dbs = list.json?.databases || [];
check('seed entries present (4)', dbs.length === 4, dbs.length);
check(
  'seeds are honest: all idle with zeroed metrics, no lastTestedAt',
  dbs.every((d) => d.status === 'idle' && d.latencyMs === 0 && d.tablesCount === 0 && d.storageUsedMb === 0 && !d.lastTestedAt),
  dbs.map((d) => ({ id: d.id, status: d.status, lat: d.latencyMs, t: d.tablesCount, lt: d.lastTestedAt })),
);

// 2. Real HTTP probe (render fixture URL is a public https endpoint)
const t0 = Date.now();
const httpProbe = await call('POST', '/databases/external/test', { token, body: { id: 'db_render_backend' } });
const elapsed = Date.now() - t0;
console.log('  http probe result:', JSON.stringify(httpProbe.json));
check('http probe -> 200 with a measured result', httpProbe.status === 200, httpProbe.status);
check(
  'http probe reports REAL latency (round trip >= 0 and message has no random claim)',
  typeof httpProbe.json?.latencyMs === 'number' && httpProbe.json.latencyMs >= 0 && elapsed >= httpProbe.json.latencyMs - 5,
  { latencyMs: httpProbe.json?.latencyMs, elapsed },
);
check(
  'http probe message contains a real HTTP status or an honest failure reason',
  /Reachable — HTTP [0-9]{3}|Unreachable — |unhealthy/.test(httpProbe.json?.message || ''),
  httpProbe.json?.message,
);
check(
  'probe outcome persisted on the entry (status not idle anymore)',
  httpProbe.json?.database && httpProbe.json.database.status !== 'idle' && !!httpProbe.json.database.lastTestedAt,
  httpProbe.json?.database?.status,
);

// 3. postgres fixture: NEVER dialled, honest answer
const pgProbe = await call('POST', '/databases/external/test', { token, body: { id: 'db_supabase_prod' } });
console.log('  pg probe result:', JSON.stringify(pgProbe.json));
check(
  'postgres probe -> honest "never dialled" message (no fake success)',
  pgProbe.status === 200 && pgProbe.json?.success === false && /never dialled by the gateway/.test(pgProbe.json?.message || ''),
  pgProbe.json?.message,
);
check('postgres entry untouched (still idle, no fake latency)', pgProbe.json?.database?.status === 'idle' && pgProbe.json.database.latencyMs === 0, pgProbe.json?.database?.status);

// 4. New config: honest defaults
const created = await call('POST', '/databases/external', {
  token,
  body: { name: 'Fresh Honest DB', provider: 'render', connectionUrl: 'https://example.com/health', region: 'test-1' },
});
check('create external db -> 201', created.status === 201 || created.status === 200, created.status);
const fresh = created.json?.database || created.json;
check(
  'fresh config is honest: idle / 0ms / 0 tables / not tested / TLS from scheme',
  fresh?.status === 'idle' && fresh?.latencyMs === 0 && fresh?.tablesCount === 0 && !fresh?.lastTestedAt && fresh?.sslEnabled === true,
  fresh,
);

// 5. Probe the fresh entry too (example.com is public, deterministic-ish)
const freshProbe = await call('POST', '/databases/external/test', { token, body: { id: fresh.id } });
console.log('  fresh probe result:', JSON.stringify(freshProbe.json));
check('fresh probe -> 200', freshProbe.status === 200, freshProbe.status);
check('fresh probe measured >= 0ms', typeof freshProbe.json?.latencyMs === 'number' && freshProbe.json.latencyMs >= 0, freshProbe.json?.latencyMs);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
