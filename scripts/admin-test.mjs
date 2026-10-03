// Admin Control Center — full permission matrix against the LOCAL server.
// Requires a FRESH server (empty memory DB): the first registered account
// bootstraps as ADMIN, the second becomes a plain USER.
//   $env:PORT='3111'; npx tsx server.ts
//   node scripts/admin-test.mjs
const BASE = 'http://127.0.0.1:3111/api/v1';

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} -> ${JSON.stringify(detail)}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-json body */
    }
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, json: null, error: e.message };
  }
}

async function register(name, email) {
  const r = await call('POST', '/auth/register', {
    body: { email, password: 'Adm1n-Test-Pass!42', name },
  });
  return { status: r.status, token: r.json?.token, json: r.json };
}

const ts = Date.now().toString(36);

console.log('— accounts (fresh DB bootstrap) —');
const regA = await register('Admin Suite A', `admin-a-${ts}@example.test`);
check(
  'first account on a fresh server bootstraps as ADMIN',
  (regA.status === 200 || regA.status === 201) && !!regA.token,
  regA.json ?? regA.status,
);
const tokenA = regA.token;
const meA = await call('GET', '/auth/me', { token: tokenA });
const idA = meA.json?.user?.id;
check(
  'A /auth/me -> 200 + role ADMIN',
  meA.status === 200 && meA.json?.user?.role === 'ADMIN' && !!idA,
  { status: meA.status, role: meA.json?.user?.role },
);

const regB = await register('Regular User B', `user-b-${ts}@example.test`);
check('second account registers as USER', (regB.status === 200 || regB.status === 201) && !!regB.token, regB.json ?? regB.status);
const tokenB = regB.token;
const meB = await call('GET', '/auth/me', { token: tokenB });
const idB = meB.json?.user?.id;
check(
  'B /auth/me -> role USER',
  meB.status === 200 && meB.json?.user?.role === 'USER' && !!idB,
  { status: meB.status, role: meB.json?.user?.role },
);

console.log('— anonymous requests are rejected (401) —');
for (const [method, path, label] of [
  ['GET', '/admin/users', 'GET /admin/users'],
  ['GET', '/admin/feature-flags', 'GET /admin/feature-flags'],
  ['GET', '/admin/statistics', 'GET /admin/statistics'],
  ['GET', '/admin/logs', 'GET /admin/logs'],
  ['POST', '/admin/emergency', 'POST /admin/emergency'],
  ['DELETE', '/admin/users/usr_nobody', 'DELETE /admin/users/:id'],
]) {
  const r = await call(method, path, method === 'POST' ? { body: { action: 'TOGGLE_MAINTENANCE' } } : {});
  check(`${label} without session -> 401`, r.status === 401, r.status);
}

console.log('— a plain USER is rejected (403) —');
check('B GET /admin/users -> 403', (await call('GET', '/admin/users', { token: tokenB })).status === 403, 'status');
check('B GET /admin/statistics -> 403', (await call('GET', '/admin/statistics', { token: tokenB })).status === 403, 'status');
check('B GET /admin/feature-flags -> 403', (await call('GET', '/admin/feature-flags', { token: tokenB })).status === 403, 'status');
check(
  'B PATCH A role -> 403',
  (await call('PATCH', `/admin/users/${idA}/role`, { token: tokenB, body: { role: 'USER' } })).status === 403,
  'status',
);
check('B DELETE A -> 403', (await call('DELETE', `/admin/users/${idA}`, { token: tokenB })).status === 403, 'status');
check(
  'B POST emergency -> 403',
  (await call('POST', '/admin/emergency', { token: tokenB, body: { action: 'TOGGLE_MAINTENANCE' } })).status === 403,
  'status',
);

console.log('— ADMIN gets full access —');
const list = await call('GET', '/admin/users', { token: tokenA });
check(
  'A GET /admin/users -> 200 with both accounts',
  list.status === 200 && Array.isArray(list.json?.users) && list.json.users.length >= 2 && list.json.users.some((u) => u.id === idB),
  { status: list.status, count: list.json?.users?.length },
);

const stats = await call('GET', '/admin/statistics', { token: tokenA });
check(
  'A GET /admin/statistics -> 200 + real totals',
  stats.status === 200 && !!stats.json?.stats && stats.json.stats.totalUsers >= 2,
  { status: stats.status, total: stats.json?.stats?.totalUsers },
);

const logs0 = await call('GET', '/admin/logs?limit=50', { token: tokenA });
check('A GET /admin/logs -> 200', logs0.status === 200 && typeof logs0.json?.total === 'number', { status: logs0.status });

const flags = await call('GET', '/admin/feature-flags', { token: tokenA });
const flagList = flags.json?.featureFlags;
check(
  'A GET /admin/feature-flags -> 200 + flags listed',
  flags.status === 200 && Array.isArray(flagList) && flagList.length > 0,
  { status: flags.status, count: flagList?.length },
);

if (Array.isArray(flagList) && flagList.length) {
  const f = flagList.find((x) => x.key === 'SYSTEM_MAINTENANCE_MODE') || flagList[0];
  const original = f.enabled;
  const on = await call('PATCH', `/admin/feature-flags/${f.id}`, { token: tokenA, body: { enabled: !original } });
  const back = await call('PATCH', `/admin/feature-flags/${f.id}`, { token: tokenA, body: { enabled: original } });
  check(
    'A PATCH feature flag flips and restores',
    on.status === 200 && back.status === 200 && back.json?.flag?.enabled === original,
    { flipped: on.json?.flag?.enabled, restored: back.json?.flag?.enabled, original },
  );
}

console.log('— role changes are immediate server truth —');
const promote = await call('PATCH', `/admin/users/${idB}/role`, { token: tokenA, body: { role: 'ADMIN' } });
const meB2 = await call('GET', '/auth/me', { token: tokenB });
check(
  'promote B -> ADMIN visible on B session instantly',
  promote.status === 200 && meB2.json?.user?.role === 'ADMIN',
  { promote: promote.status, role: meB2.json?.user?.role },
);

const demote = await call('PATCH', `/admin/users/${idB}/role`, { token: tokenA, body: { role: 'USER' } });
const meB3 = await call('GET', '/auth/me', { token: tokenB });
check(
  'demote B -> USER visible on B session instantly',
  demote.status === 200 && meB3.json?.user?.role === 'USER',
  { demote: demote.status, role: meB3.json?.user?.role },
);

console.log('— emergency controls —');
const em = await call('POST', '/admin/emergency', { token: tokenA, body: { action: 'TOGGLE_MAINTENANCE' } });
const emBack = await call('POST', '/admin/emergency', { token: tokenA, body: { action: 'TOGGLE_MAINTENANCE' } });
check(
  'TOGGLE_MAINTENANCE on -> off (state restored)',
  em.status === 200 && em.json?.maintenanceMode === true && emBack.status === 200 && emBack.json?.maintenanceMode === false,
  { on: em.json, off: emBack.json },
);

const badAction = await call('POST', '/admin/emergency', { token: tokenA, body: { action: 'NOT_AN_ACTION' } });
check('unknown emergency action -> 400', badAction.status === 400, badAction.status);

console.log('— guard rails —');
const selfDel = await call('DELETE', `/admin/users/${idA}`, { token: tokenA });
check('A cannot delete own account -> 400', selfDel.status === 400, { status: selfDel.status, error: selfDel.json?.error });
const selfDemote = await call('PATCH', `/admin/users/${idA}/role`, { token: tokenA, body: { role: 'USER' } });
check('last admin cannot demote self -> 400', selfDemote.status === 400, { status: selfDemote.status, error: selfDemote.json?.error });
const badId = await call('DELETE', '/admin/users/evil-id', { token: tokenA });
check('malformed user id -> 400', badId.status === 400, badId.status);
const missing = await call('DELETE', '/admin/users/usr_does_not_exist', { token: tokenA });
check('unknown user id -> 404', missing.status === 404, missing.status);

console.log('— B writes content, admin deletes the account fully —');
const c = await call('POST', '/comments/getting-started', { token: tokenB, body: { body: 'Temporary comment from the admin suite.' } });
check('B posts a comment -> 201', c.status === 201, c.status);

const del = await call('DELETE', `/admin/users/${idB}`, { token: tokenA });
check('A deletes B -> 200', del.status === 200 && del.json?.success === true, { status: del.status, body: del.json });

const list2 = await call('GET', '/admin/users', { token: tokenA });
check(
  'B is gone from the user list',
  list2.status === 200 && !list2.json.users.some((u) => u.id === idB),
  { count: list2.json?.users?.length },
);

const meB4 = await call('GET', '/auth/me', { token: tokenB });
check("B's session dies with the account -> 401", meB4.status === 401, meB4.status);

const comments = await call('GET', '/comments/getting-started');
const leaked = (comments.json?.comments || []).filter((cm) => String(cm.body || '').includes('admin suite'));
check("B's comments are removed too", comments.status === 200 && leaked.length === 0, { leaked: leaked.length });

const logs = await call('GET', '/admin/logs?limit=100', { token: tokenA });
const actions = (logs.json?.logs || []).map((l) => l.action);
check('audit log records USER_ROLE_CHANGED', actions.includes('USER_ROLE_CHANGED'), actions.slice(0, 8));
check('audit log records USER_DELETED', actions.includes('USER_DELETED'), actions.slice(0, 8));

console.log('— cleanup (production stays empty) —');
const bye = await call('DELETE', '/auth/account', { token: tokenA });
check('A deletes own account -> 200', bye.status === 200 && bye.json?.success === true, { status: bye.status, body: bye.json });

const regFresh = await register('Fresh Bootstrap', `fresh-${ts}@example.test`);
const meFresh = await call('GET', '/auth/me', { token: regFresh.token });
check(
  'next account on an empty DB bootstraps ADMIN again',
  !!regFresh.token && meFresh.json?.user?.role === 'ADMIN',
  { role: meFresh.json?.user?.role },
);
const bye2 = await call('DELETE', '/auth/account', { token: regFresh.token });
check('final account removed -> DB empty', bye2.status === 200, bye2.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
