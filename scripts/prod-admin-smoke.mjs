// Production ADMIN happy-path checks against the REAL PostgreSQL database.
// These prove the admin endpoints work in PG mode (the in-memory-only paths
// would fail here) and that verification badges round-trip end to end.
//
//   $env:ADMIN_API_TOKEN = '<32+ chars>'; node scripts/prod-admin-smoke.mjs
//
// Uses only TEMPORARY accounts: register -> verify -> delete. Real user
// accounts (including the owner's) are never modified except by read calls.
import crypto from 'crypto';
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

// ---- RFC 6238 helper (independent implementation of src/server/totp.ts) ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of s.toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx === -1) break;
    value = (value << 5) | idx;
    bits += 5;
    while (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totp(secret) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(bin % 1000000).padStart(6, '0');
}

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

// Real usage analytics: structural integrity of the live series — the sum of
// the 24 real buckets must equal the reported total exactly (no synthesis).
const an = await call('GET', '/api-keys/usage-analytics?period=24h', { token: probeToken });
const anSum = (an.json?.timeSeries || []).reduce((s, p) => s + p.totalRequests, 0);
check(
  'GET /api-keys/usage-analytics -> 200 with a consistent real series',
  an.status === 200 &&
    Array.isArray(an.json?.timeSeries) &&
    an.json.timeSeries.length === 24 &&
    anSum === an.json?.totalVolume &&
    Array.isArray(an.json?.summaries) &&
    typeof an.json?.overallErrorCount === 'number',
  { s: an.status, sum: anSum, total: an.json?.totalVolume },
);

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

console.log('— @username system on real PostgreSQL —');
const unA = await call('POST', '/auth/register', {
  body: { email: `uname-dupe-${ts}@example.test`, password: 'Prod-Admin-Probe!42', name: 'Username Probe A' },
});
const unB = await call('POST', '/auth/register', {
  body: { email: `uname-dupe-${ts}@other.test`, password: 'Prod-Admin-Probe!42', name: 'Username Probe B' },
});
check(
  'same local-part emails registered',
  (unA.status === 201 || unA.status === 200) && (unB.status === 201 || unB.status === 200),
  { a: unA.status, b: unB.status },
);
check(
  '-> distinct usernames (PG uniqueness fix)',
  !!unA.json?.user?.username && !!unB.json?.user?.username && unA.json.user.username !== unB.json.user.username,
  { a: unA.json?.user?.username, b: unB.json?.user?.username },
);
const availSelf = await call('GET', `/auth/username-available?username=${encodeURIComponent(unA.json?.user?.username || '')}`, {
  token: unA.json?.token,
});
check('availability: own username -> available', availSelf.json?.available === true, availSelf.json);
const claimed = `prod_u_${ts}`;
const claimR = await call('PATCH', '/auth/profile', {
  token: unA.json?.token,
  body: { name: 'Username Probe A', avatarUrl: '', username: claimed, bio: 'prod username smoke' },
});
check(
  'claim @username + bio -> 200',
  claimR.status === 200 && claimR.json?.user?.username === claimed && claimR.json?.user?.bio === 'prod username smoke',
  { s: claimR.status, u: claimR.json?.user?.username },
);
const dupR = await call('PATCH', '/auth/profile', {
  token: unB.json?.token,
  body: { name: 'Username Probe B', avatarUrl: '', username: claimed },
});
check('second claim of same name -> 409', dupR.status === 409, dupR.status);
const pubU = await call('GET', `/profiles/${claimed}`);
check(
  'public profile -> 200 + bio, no email',
  pubU.status === 200 &&
    pubU.json?.profile?.bio === 'prod username smoke' &&
    !('email' in (pubU.json?.profile || {})),
  { s: pubU.status, p: pubU.json?.profile },
);
// Markdown bios round-trip on PostgreSQL — newlines (code blocks, lists)
// must survive the save/load cycle byte for byte.
const mdBio = '### Prod md bio\n\n```ts\nconst ok = true;\n```\n- [Vanitas](https://vanitas-bot.vercel.app)';
const mdR = await call('PATCH', '/auth/profile', {
  token: unA.json?.token,
  body: { name: 'Username Probe A', avatarUrl: '', username: claimed, bio: mdBio },
});
check(
  'markdown bio persists on PG (verbatim, newlines intact)',
  mdR.status === 200 && mdR.json?.user?.bio === mdBio,
  { s: mdR.status, bio: mdR.json?.user?.bio },
);
const mdPub = await call('GET', `/profiles/${claimed}`);
check(
  'public profile serves markdown bio',
  mdPub.status === 200 && mdPub.json?.profile?.bio === mdBio,
  { s: mdPub.status, bio: mdPub.json?.profile?.bio },
);
// Accent colour round-trips on PG too, and the public profile carries the
// real comment aggregates (honest zero on a fresh account) beside identity.
const accR = await call('PATCH', '/auth/profile', {
  token: unA.json?.token,
  body: { name: 'Username Probe A', avatarUrl: '', username: claimed, accentColor: '#22c55e' },
});
check(
  'accent colour accepted on PG',
  accR.status === 200 && accR.json?.user?.accentColor === '#22c55e',
  { s: accR.status, c: accR.json?.user?.accentColor },
);
const pubAct = await call('GET', `/profiles/${claimed}`);
check(
  'public profile exposes accent + real commentCount',
  pubAct.status === 200 &&
    pubAct.json?.profile?.accentColor === '#22c55e' &&
    pubAct.json?.profile?.commentCount === 0 &&
    Array.isArray(pubAct.json?.profile?.recentComments) &&
    pubAct.json.profile.recentComments.length === 0,
  { s: pubAct.status, accent: pubAct.json?.profile?.accentColor, count: pubAct.json?.profile?.commentCount },
);
const delU1 = await call('DELETE', `/admin/users/${unA.json?.user?.id}`, admin);
const delU2 = await call('DELETE', `/admin/users/${unB.json?.user?.id}`, admin);
check(
  'cleanup: both username probes deleted -> 200',
  delU1.status === 200 && delU2.status === 200,
  { a: delU1.status, b: delU2.status },
);

console.log('— hardened auth on PG: sessions, 2FA replay, password rotation —');
const hEmail = `hard-probe-${ts}@example.test`;
const hPass = 'Prod-Hard-Probe!42';
const regH = await call('POST', '/auth/register', {
  body: { email: hEmail, password: hPass, name: 'Hardening Probe' },
});
check('hardening probe registered -> 201', (regH.status === 201 || regH.status === 200) && !!regH.json?.token, regH.status);
const hTok = regH.json?.token;

// Real auth_sessions rows (PG): irreversible 64-hex token-hash ids only.
const sessR = await call('GET', '/auth/sessions', { token: hTok });
const sessRows = sessR.json?.sessions || [];
check(
  'GET /auth/sessions -> PG rows with token-hash ids',
  sessR.status === 200 && sessRows.length >= 1 && sessRows.every((s) => /^[0-9a-f]{64}$/.test(s.id)),
  { s: sessR.status, n: sessRows.length },
);
check('current session flagged', sessRows.some((s) => s.isCurrent === true), sessRows.map((s) => s.isCurrent));

// Planted session must die the moment 2FA is turned on.
const plant = await call('POST', '/auth/login', { body: { email: hEmail, password: hPass } });
check('planted second session -> 200', plant.status === 200 && !!plant.json?.token, plant.status);
const plantedTok = plant.json?.token;

const setupH = await call('POST', '/auth/2fa/setup', { token: hTok });
check(
  '2FA setup -> real secret + otpauth URL',
  setupH.status === 200 && !!setupH.json?.secret && String(setupH.json?.otpauthUrl || '').startsWith('otpauth://totp/'),
  setupH.status,
);
const hSecret = setupH.json?.secret;
const enH = await call('POST', '/auth/2fa/enable', { token: hTok, body: { code: totp(hSecret) } });
check(
  '2FA enable -> success + other sessions revoked',
  enH.status === 200 && enH.json?.success === true && (enH.json?.sessionsRevoked || 0) >= 1,
  enH.json ?? enH.status,
);
const plantMe = await call('GET', '/auth/me', { token: plantedTok });
check('planted session died on 2FA enable -> 401', plantMe.status === 401, plantMe.status);

const liveH = totp(hSecret);
const lgH = await call('POST', '/auth/login', { body: { email: hEmail, password: hPass, code: liveH } });
check('login with live TOTP -> 200 + session', lgH.status === 200 && !!lgH.json?.token, lgH.json ?? lgH.status);
const rpH = await call('POST', '/auth/login', { body: { email: hEmail, password: hPass, code: liveH } });
check(
  'same TOTP code replayed -> 401 (PG totp_last_step watermark)',
  rpH.status === 401 && rpH.json?.twoFactorRequired === true,
  rpH.json ?? rpH.status,
);

const disH = await call('POST', '/auth/2fa/disable', { token: hTok, body: { code: totp(hSecret) } });
check('2FA disable -> 200', disH.status === 200 && disH.json?.success === true, disH.json ?? disH.status);

// Password rotation on PG: old credential dies, LOGIN_FAILURE is audited.
const pcH = await call('POST', '/auth/password', {
  token: hTok,
  body: { currentPassword: hPass, newPassword: 'Prod-Hard-Rotated!77' },
});
check('password change -> 200 + other sessions revoked', pcH.status === 200 && pcH.json?.success === true, pcH.json ?? pcH.status);
const oldLH = await call('POST', '/auth/login', { body: { email: hEmail, password: hPass } });
check('old password rejected -> 401', oldLH.status === 401, oldLH.status);
const newLH = await call('POST', '/auth/login', { body: { email: hEmail, password: 'Prod-Hard-Rotated!77' } });
check('new password accepted -> 200', newLH.status === 200 && !!newLH.json?.token, newLH.json ?? newLH.status);

const authLogs = await call('GET', '/admin/logs?limit=200&category=AUTH', admin);
const authActions = (authLogs.json?.logs || []).map((l) => l.action);
check('audit contains LOGIN_FAILURE', authActions.includes('LOGIN_FAILURE'), authActions.slice(0, 12));
check('audit contains PASSWORD_CHANGED', authActions.includes('PASSWORD_CHANGED'), authActions.slice(0, 12));

const delH = await call('DELETE', '/auth/account', { token: hTok });
check('cleanup hardening probe -> 200', delH.status === 200, { s: delH.status, b: delH.json });

console.log('— webhooks: owner scoping + honest delivery in production —');
const whA = await call('POST', '/webhooks', {
  ...admin,
  body: { name: 'Prod probe', url: 'https://nonexistent-vanitas-test.invalid/hook', events: ['suite.noop'] },
});
check(
  'admin creates webhook -> 201 + secret returned once',
  whA.status === 201 && typeof whA.json?.webhook?.secret === 'string',
  whA.json ?? whA.status,
);
const whList = await call('GET', '/webhooks', admin);
const whRow = (whList.json?.webhooks || []).find((w) => w.id === whA.json?.webhook?.id);
check('GET /webhooks -> 200 + row present without secret', whList.status === 200 && !!whRow && whRow.secret === undefined, {
  s: whList.status,
  found: !!whRow,
});
const whT = await call('POST', `/webhooks/${whA.json?.webhook?.id}/test`, { ...admin });
check(
  'test to unreachable host -> honest FAILED delivery (real network attempt)',
  whT.status === 200 && whT.json?.success === false && whT.json?.log?.status === 'failed',
  whT.json ?? whT.status,
);

console.log('— signed download artifacts: integrity chain on production —');
{
  const SITE = BASE.replace(/\/api\/v1$/, '');
  const cat = await call('GET', '/download/releases');
  const apkRel = (cat.json?.releases || []).find((x) => x.type === 'apk');
  check(
    'catalog publishes manifest metadata (real sha/size/kind)',
    cat.status === 200 && !!apkRel && apkRel.artifactKind === 'manifest' && /^[0-9a-f]{64}$/.test(apkRel.sha256) && Number.isInteger(apkRel.sizeBytes) && apkRel.sizeBytes > 0,
    apkRel ?? cat.status,
  );
  // Session download authenticated by the admin token (a real actor path).
  const dlRes = await fetch(`${BASE}/download/apk`, {
    headers: { authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(30000),
  });
  const dlBuf = Buffer.from(await dlRes.arrayBuffer());
  const dlSha = crypto.createHash('sha256').update(dlBuf).digest('hex');
  check(
    'download → 200 + exact published bytes + matching sha256',
    dlRes.status === 200 && !!apkRel && dlBuf.length === apkRel.sizeBytes && dlSha === apkRel.sha256,
    { s: dlRes.status, bytes: dlBuf.length, sizeBytes: apkRel?.sizeBytes, sha: dlSha, published: apkRel?.sha256 },
  );
  // Cross-device signed link (the QR flow).
  const mint = await call('POST', '/download/apk/token', { token: TOKEN });
  check('signed link minted with a 10-minute TTL', mint.status === 200 && mint.json?.expiresInSec === 600, mint.json ?? mint.status);
  const signed = await fetch(SITE + mint.json.url, { signal: AbortSignal.timeout(30000) });
  const signedBuf = Buffer.from(await signed.arrayBuffer());
  check(
    'signed link download → 200 + same checksum (verifies across serverless instances)',
    signed.status === 200 && crypto.createHash('sha256').update(signedBuf).digest('hex') === apkRel?.sha256,
    { s: signed.status, bytes: signedBuf.length },
  );
  const tampered = await fetch(SITE + String(mint.json.url).replace(/sig=[^&]+/, 'sig=tampered'), { signal: AbortSignal.timeout(30000) });
  check('tampered signed link → 401', tampered.status === 401, tampered.status);
}

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
check('audit contains USERNAME_CHANGED', actions.includes('USERNAME_CHANGED'), actions.slice(0, 15));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
