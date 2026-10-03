// Production ADMIN happy-path checks against the REAL PostgreSQL database.
// These prove the admin endpoints work in PG mode (the in-memory-only paths
// would fail here) and that verification badges round-trip end to end.
//
//   $env:ADMIN_API_TOKEN = '<32+ chars>'; node scripts/prod-admin-smoke.mjs
//
// Uses only TEMPORARY accounts: register -> verify -> delete. Real user
// accounts (including the owner's) are never modified except by read calls.
const BASE = 'https://vanitas-bot.vercel.app/api/v1';
const TOKEN = process.env.ADMIN_API_TOKEN;

if (!TOKEN || TOKEN.length < 32) {
  console.error('ADMIN_API_TOKEN env var (32+ chars) is required');
  process.exit(2);
}

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
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-json */
    }
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, json: null, error: e.message };
  }
}

const admin = { token: TOKEN };

console.log('— PG-backed admin reads —');
const list = await call('GET', '/admin/users', admin);
const users = list.json?.users || [];
check(
  'GET /admin/users -> 200 + real production accounts',
  list.status === 200 && users.length >= 2 && users.every((u) => u.role && typeof u.verification === 'string'),
  { status: list.status, count: users.length },
);
check(
  'at least one ADMIN exists in the list',
  users.some((u) => u.role === 'ADMIN'),
  users.map((u) => u.role),
);

const stats = await call('GET', '/admin/statistics', admin);
check(
  'GET /admin/statistics -> 200 + totals match the PG user list',
  stats.status === 200 && stats.json?.stats?.totalUsers === users.length,
  { status: stats.status, total: stats.json?.stats?.totalUsers, listed: users.length },
);

const logs0 = await call('GET', '/admin/logs?limit=20', admin);
check('GET /admin/logs -> 200 + array', logs0.status === 200 && Array.isArray(logs0.json?.logs), logs0.status);

const flags = await call('GET', '/admin/feature-flags', admin);
check('GET /admin/feature-flags -> 200 + flags', flags.status === 200 && (flags.json?.featureFlags || []).length > 0, flags.status);

const sugs = await call('GET', '/admin/suggestions', admin);
check('GET /admin/suggestions -> 200 + list', sugs.status === 200 && Array.isArray(sugs.json?.suggestions), sugs.status);

const mods = await call('GET', '/admin/comments', admin);
check('GET /admin/comments -> 200 + total', mods.status === 200 && typeof mods.json?.total === 'number', mods.status);

console.log('— verification badge E2E on a temporary account —');
const ts = Date.now().toString(36);
const reg = await call('POST', '/auth/register', {
  body: { email: `admin-probe-${ts}@example.test`, password: 'Prod-Admin-Probe!42', name: 'Admin Probe' },
});
check('temp account registered -> 201', (reg.status === 201 || reg.status === 200) && !!reg.json?.token, reg.status);
const probeToken = reg.json?.token;
const me0 = await call('GET', '/auth/me', { token: probeToken });
const probeId = me0.json?.user?.id;
check('temp account is a plain USER', me0.json?.user?.role === 'USER' && !!probeId, me0.json?.user?.role);

const grant = await call('PATCH', `/admin/users/${probeId}/verification`, {
  ...admin,
  body: { verification: 'DEVELOPER' },
});
const me1 = await call('GET', '/auth/me', { token: probeToken });
check(
  'grant DEVELOPER badge -> visible on their live session instantly',
  grant.status === 200 && me1.json?.user?.verification === 'DEVELOPER',
  { s: grant.status, v: me1.json?.user?.verification },
);

const revoke = await call('PATCH', `/admin/users/${probeId}/verification`, { ...admin, body: { verification: '' } });
const me2 = await call('GET', '/auth/me', { token: probeToken });
check('revoke badge -> instant none', revoke.status === 200 && (me2.json?.user?.verification || '') === '', me2.json?.user?.verification);

const promote = await call('PATCH', `/admin/users/${probeId}/role`, { ...admin, body: { role: 'ADMIN' } });
const me3 = await call('GET', '/auth/me', { token: probeToken });
check('promote temp to ADMIN -> instant', promote.status === 200 && me3.json?.user?.role === 'ADMIN', { s: promote.status, r: me3.json?.user?.role });

const demote = await call('PATCH', `/admin/users/${probeId}/role`, { ...admin, body: { role: 'USER' } });
const me4 = await call('GET', '/auth/me', { token: probeToken });
check('demote temp back to USER -> instant', demote.status === 200 && me4.json?.user?.role === 'USER', { s: demote.status, r: me4.json?.user?.role });

const del = await call('DELETE', `/admin/users/${probeId}`, admin);
check('delete temp account -> 200', del.status === 200 && del.json?.success === true, { s: del.status, b: del.json });
const me5 = await call('GET', '/auth/me', { token: probeToken });
check("temp account's session dies -> 401", me5.status === 401, me5.status);

console.log('— developer invite E2E (create → preview → redeem → consume → revoke) —');
const inv = await call('POST', '/admin/invites', {
  ...admin,
  body: { role: 'ADMIN', verification: 'USER', note: 'prod probe', maxUses: 1 },
});
check('create invite -> 201 + token', inv.status === 201 && !!inv.json?.invite?.token, { s: inv.status });
const invToken = inv.json?.invite?.token;
const pv = await call('GET', `/invites/${invToken}`);
check(
  'public preview -> valid + ADMIN',
  pv.status === 200 && pv.json?.valid === true && pv.json?.role === 'ADMIN',
  pv.json,
);
const regI = await call('POST', '/auth/register', {
  body: {
    email: `invite-probe-${ts}@example.test`,
    password: 'Prod-Admin-Probe!42',
    name: 'Invite Probe',
    invite: invToken,
  },
});
check(
  'signup via invite -> lands ADMIN + USER badge instantly',
  (regI.status === 201 || regI.status === 200) &&
    regI.json?.user?.role === 'ADMIN' &&
    regI.json?.user?.verification === 'USER',
  { s: regI.status, role: regI.json?.user?.role, v: regI.json?.user?.verification },
);
const regI2 = await call('POST', '/auth/register', {
  body: {
    email: `invite-probe2-${ts}@example.test`,
    password: 'Prod-Admin-Probe!42',
    name: 'Invite Probe 2',
    invite: invToken,
  },
});
check('single-use invite consumed -> next signup 400', regI2.status === 400, regI2.status);
const rv = await call('DELETE', `/admin/invites/${inv.json?.invite?.id}`, admin);
check('revoke invite -> 200', rv.status === 200 && rv.json?.success === true, { s: rv.status });
const pv2 = await call('GET', `/invites/${invToken}`);
check('revoked preview -> valid:false revoked', pv2.json?.valid === false && pv2.json?.reason === 'revoked', pv2.json);
const delI = await call('DELETE', `/admin/users/${regI.json?.user?.id}`, admin);
check('cleanup: invitee account deleted -> 200', delI.status === 200, { s: delI.status });

console.log('— durable audit trail (must come from PostgreSQL) —');
const logs = await call('GET', '/admin/logs?limit=200', admin);
const actions = (logs.json?.logs || []).map((l) => l.action);
check('audit contains USER_VERIFICATION_CHANGED', actions.includes('USER_VERIFICATION_CHANGED'), actions.slice(0, 10));
check('audit contains USER_ROLE_CHANGED', actions.includes('USER_ROLE_CHANGED'), actions.slice(0, 10));
check('audit contains USER_DELETED', actions.includes('USER_DELETED'), actions.slice(0, 10));
check(
  'audit contains INVITE_CREATED + INVITE_USED',
  actions.includes('INVITE_CREATED') && actions.includes('INVITE_USED'),
  actions.slice(0, 10),
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
