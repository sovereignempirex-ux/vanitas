// Local end-to-end test of the real auth flow (in-memory storage mode).
import crypto from 'crypto';

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3111/api/v1';

let pass = 0;
let fail = 0;

async function call(method, path, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, json };
}

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} → ${JSON.stringify(detail)}`);
  }
}

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

const email = `user_${Date.now()}@example.com`;
const password = 'SuperSecret123!';

// Wait for server
let up = false;
for (let i = 0; i < 20; i++) {
  try {
    const r = await call('GET', '/health');
    if (r.status === 200) {
      up = true;
      break;
    }
  } catch {
    /* not yet */
  }
  await new Promise((r) => setTimeout(r, 500));
}
if (!up) {
  console.error('server not reachable');
  process.exit(1);
}

console.log('— register —');
let r = await call('POST', '/auth/register', { body: { email, password, name: 'Test User' } });
check('register → 201', r.status === 201, r);
check('register returns token', typeof r.json?.token === 'string' && r.json.token.startsWith('vnt_sess_'), r.json);
check('fresh DB → first register bootstraps as ADMIN', r.json?.user?.role === 'ADMIN', r.json?.user);
check('register never leaks password_hash', !JSON.stringify(r.json).includes('scrypt$'), r.json);
const regToken = r.json?.token;
const userId = r.json?.user?.id;

r = await call('POST', '/auth/register', { body: { email, password, name: 'Dup' } });
check('duplicate email → 409', r.status === 409, r);

r = await call('POST', '/auth/register', { body: { email: 'bad-email', password, name: 'X' } });
check('invalid email → 400', r.status === 400, r);

r = await call('POST', '/auth/register', { body: { email: 'ok@example.com', password: 'short', name: 'X' } });
check('weak password → 400', r.status === 400, r);

console.log('— login —');
r = await call('POST', '/auth/login', { body: { email, password: 'WrongPass999!' } });
check('wrong password → 401', r.status === 401, r);
check('wrong password generic message', r.json?.error === 'Invalid email or password', r.json);

r = await call('POST', '/auth/login', { body: { email: `ghost_${Date.now()}@x.com`, password } });
check('unknown email → 401 generic', r.status === 401 && r.json?.error === 'Invalid email or password', r);

r = await call('POST', '/auth/login', { body: { email, password } });
check('correct login → 200 + token', r.status === 200 && typeof r.json?.token === 'string', r);
const loginToken = r.json?.token;
check('login returns same user id', r.json?.user?.id === userId, r.json?.user);

console.log('— session (/auth/me) —');
r = await call('GET', '/auth/me', { token: regToken });
check('me with register token → own user', r.json?.user?.id === userId, r.json?.user);
r = await call('GET', '/auth/me', { token: loginToken });
check('me with login token → own user', r.json?.user?.id === userId, r.json?.user);
r = await call('GET', '/auth/me');
check('me without token → 401 (never a fake persona)', r.status === 401, r);
r = await call('GET', '/auth/me', { token: 'vnt_sess_totally_invalid_token' });
check('me with forged token → 401', r.status === 401, r);

console.log('— logout —');
r = await call('POST', '/auth/logout', { token: regToken });
check('logout → success', r.status === 200 && r.json?.success === true, r);
r = await call('GET', '/auth/me', { token: regToken });
check('revoked token no longer authenticates → 401', r.status === 401, r);

console.log('— session still valid —');
r = await call('GET', '/auth/me', { token: loginToken });
check('session still valid for login token', r.json?.user?.id === userId, r.json?.user);

console.log('— profile (real server-side save) —');
r = await call('PATCH', '/auth/profile', { token: loginToken, body: { name: 'Renamed Tester', avatarUrl: 'https://example.com/avatar.png' } });
check('PATCH profile → 200 + updated user', r.status === 200 && r.json?.user?.name === 'Renamed Tester', r.json);
r = await call('GET', '/auth/me', { token: loginToken });
check('profile change persists server-side', r.json?.user?.name === 'Renamed Tester', r.json?.user);
r = await call('PATCH', '/auth/profile', { token: loginToken, body: { name: 'X', avatarUrl: '' } });
check('short display name → 400', r.status === 400, r);
r = await call('PATCH', '/auth/profile', { token: loginToken, body: { name: 'Bad Avatar', avatarUrl: 'javascript:alert(1)' } });
check('non-https avatar URL → 400', r.status === 400, r);
r = await call('PATCH', '/auth/profile', { token: loginToken, body: { name: 'Default Avatar', avatarUrl: '/images/avatar-default.svg' } });
check('bundled /images/ default avatar → 200 (save works for default avatar)', r.status === 200, r);
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
r = await call('PATCH', '/auth/profile', { token: loginToken, body: { name: 'Upload Tester', avatarUrl: tinyPng } });
check('uploaded image data-URL avatar → 200', r.status === 200 && String(r.json?.user?.avatarUrl || '').startsWith('data:image/png'), r.json?.user);
r = await call('PATCH', '/auth/profile', { body: { name: 'Anonymous', avatarUrl: '' } });
check('PATCH profile without token → 401', r.status === 401, r);

console.log('— @username + bio (claim, availability, public profile) —');
r = await call('GET', '/auth/username-available?username=freshhandle99', { token: loginToken });
check('availability: free username → available', r.status === 200 && r.json?.available === true, r.json);
r = await call('GET', '/auth/username-available?username=freshhandle99');
check('availability without session → 401', r.status === 401, r);

r = await call('PATCH', '/auth/profile', {
  token: loginToken,
  body: { name: 'Renamed Tester', avatarUrl: '', username: 'renamed_tester', bio: 'Builds bots and API gateways.' },
});
check(
  'claim @username + bio → 200',
  r.status === 200 && r.json?.user?.username === 'renamed_tester' && r.json?.user?.bio === 'Builds bots and API gateways.',
  r.json,
);
r = await call('GET', '/auth/me', { token: loginToken });
check(
  'username + bio persist server-side',
  r.json?.user?.username === 'renamed_tester' && r.json?.user?.bio === 'Builds bots and API gateways.',
  r.json?.user,
);
r = await call('GET', '/auth/username-available?username=renamed_tester', { token: loginToken });
check('own username reports available/current', r.json?.available === true, r.json);

r = await call('PATCH', '/auth/profile', { token: loginToken, body: { name: 'Renamed Tester', avatarUrl: '', username: 'ab' } });
check('too-short username → 400', r.status === 400, r);
r = await call('PATCH', '/auth/profile', { token: loginToken, body: { name: 'Renamed Tester', avatarUrl: '', username: 'admin' } });
check('reserved username → 400', r.status === 400, r);
r = await call('PATCH', '/auth/profile', { token: loginToken, body: { name: 'Renamed Tester', avatarUrl: '', username: 'has space' } });
check('invalid username characters → 400', r.status === 400, r);
r = await call('PATCH', '/auth/profile', { token: loginToken, body: { name: 'Renamed Tester', avatarUrl: '', bio: 'x'.repeat(201) } });
check('bio over 200 chars → 400', r.status === 400, r);
r = await call('PATCH', '/auth/profile', { token: loginToken, body: { name: 'Renamed Tester', avatarUrl: '', username: 'renamed_tester' } });
check('re-saving own username → 200 (no-op)', r.status === 200, r);

const secondToken = (await call('POST', '/auth/register', { body: { email: `second_${Date.now()}@example.com`, password, name: 'Second Account' } })).json?.token;
check('second account registered', typeof secondToken === 'string', secondToken);
const me2 = await call('GET', '/auth/me', { token: secondToken });
check('signup auto-generated a username', typeof me2.json?.user?.username === 'string' && me2.json.user.username.length >= 3, me2.json?.user);
r = await call('PATCH', '/auth/profile', { token: secondToken, body: { name: 'Second Account', avatarUrl: '', username: 'renamed_tester' } });
check('taken username → 409', r.status === 409, r);
r = await call('GET', '/auth/username-available?username=renamed_tester', { token: secondToken });
check('availability reports taken → false', r.status === 200 && r.json?.available === false, r.json);

// Same email local part, different domain → usernames must not collide.
const stamp2 = Date.now();
const dupA = await call('POST', '/auth/register', { body: { email: `sameshot_${stamp2}@example.com`, password, name: 'Same Local A' } });
const dupB = await call('POST', '/auth/register', { body: { email: `sameshot_${stamp2}@other.org`, password, name: 'Same Local B' } });
check(
  'same local part → distinct usernames',
  dupA.status === 201 && dupB.status === 201 && !!dupA.json?.user?.username && dupA.json.user.username !== dupB.json?.user?.username,
  { a: dupA.json?.user?.username, b: dupB.json?.user?.username },
);

// Public, shareable profile by @username — public-safe fields only.
r = await call('GET', '/profiles/renamed_tester');
check(
  'public profile → 200 + bio, no email/id leak',
  r.status === 200 &&
    r.json?.profile?.name === 'Renamed Tester' &&
    r.json?.profile?.bio === 'Builds bots and API gateways.' &&
    !('email' in (r.json?.profile || {})) &&
    !('id' in (r.json?.profile || {})),
  r.json,
);
r = await call('GET', '/profiles/definitely_missing_user');
check('unknown public profile → 404', r.status === 404, r);

// Cleanup: remove the extra accounts so the suite still ends with an empty DB.
const cl1 = await call('DELETE', '/auth/account', { token: secondToken });
const cl2 = await call('DELETE', '/auth/account', { token: dupA.json?.token });
const cl3 = await call('DELETE', '/auth/account', { token: dupB.json?.token });
check(
  'cleanup: extra accounts deleted → 200',
  cl1.status === 200 && cl2.status === 200 && cl3.status === 200,
  [cl1.status, cl2.status, cl3.status],
);

console.log('— social login providers —');
r = await call('GET', '/auth/providers');
const prov = r.json?.providers || {};
check('providers endpoint lists discord/google/github', prov.discord === false && prov.google === false && prov.github === false, r.json);

const startRes = await fetch(`${BASE}/social/discord`, { redirect: 'manual' });
check('oauth start without keys → 3xx redirect', startRes.status >= 300 && startRes.status < 400, { status: startRes.status });
const startLoc = startRes.headers.get('location') || '';
check('redirect reports not_configured', startLoc.includes('vnt_error=not_configured'), startLoc);

const unknownRes = await fetch(`${BASE}/social/nonsense`, { redirect: 'manual' });
const unknownLoc = unknownRes.headers.get('location') || '';
check('unknown provider → unknown_provider', unknownLoc.includes('vnt_error=unknown_provider'), unknownLoc);

console.log('— real 2FA (RFC 6238 TOTP) —');
r = await call('POST', '/auth/2fa/setup');
check('2FA setup without session → 401', r.status === 401, r);

r = await call('POST', '/auth/2fa/setup', { token: loginToken });
check(
  '2FA setup → real secret + otpauth URL',
  r.status === 200 && typeof r.json?.secret === 'string' && r.json.secret.length >= 16 && String(r.json?.otpauthUrl || '').startsWith('otpauth://totp/'),
  r.json,
);
const totpSecret = r.json?.secret;

const liveForWrong = totp(totpSecret);
const wrongCode = liveForWrong === '999999' ? '123456' : '999999';
r = await call('POST', '/auth/2fa/enable', { token: loginToken, body: { code: wrongCode } });
check('enable with wrong code → 400', r.status === 400, r);

r = await call('GET', '/auth/me', { token: loginToken });
check('wrong attempt did NOT enable 2FA', r.json?.user?.twoFactorEnabled === false, r.json?.user);

// A second session "planted" while the account is still unprotected: turning
// 2FA on must flush it out (hardening flush — no pre-planted session survives).
r = await call('POST', '/auth/login', { body: { email, password } });
check('second plain login before enabling 2FA → session', r.status === 200 && typeof r.json?.token === 'string', r);
const plantedToken = r.json?.token;

r = await call('POST', '/auth/2fa/enable', { token: loginToken, body: { code: totp(totpSecret) } });
check('enable with live code → success', r.status === 200 && r.json?.success === true, r);
check('enabling 2FA revoked the other session(s)', (r.json?.sessionsRevoked || 0) >= 1, r.json);
r = await call('GET', '/auth/me', { token: plantedToken });
check('planted session died when 2FA was turned on → 401', r.status === 401, r);

r = await call('GET', '/auth/me', { token: loginToken });
check('/auth/me shows twoFactorEnabled (cache invalidated)', r.json?.user?.twoFactorEnabled === true, r.json?.user);

r = await call('POST', '/auth/2fa/setup', { token: loginToken });
check('setup again while enabled → 409', r.status === 409, r);

r = await call('POST', '/auth/login', { body: { email, password } });
check('login without code → 401 + twoFactorRequired', r.status === 401 && r.json?.twoFactorRequired === true, r);

const liveCode = totp(totpSecret);
const badCode = liveCode === '000000' ? '123456' : '000000';
r = await call('POST', '/auth/login', { body: { email, password, code: badCode } });
check('login with wrong code → 401', r.status === 401, r);

const liveLoginCode = totp(totpSecret);
r = await call('POST', '/auth/login', { body: { email, password, code: liveLoginCode } });
check('login with live code → 200 + session', r.status === 200 && typeof r.json?.token === 'string', r);
const twoFaLoginToken = r.json?.token;

// One code buys exactly one session: replaying it fails even though the
// code still verifies cryptographically (inside the ±1 drift window).
r = await call('POST', '/auth/login', { body: { email, password, code: liveLoginCode } });
check('replaying the same TOTP code → 401 (replay blocked)', r.status === 401 && r.json?.twoFactorRequired === true, r);

r = await call('POST', '/auth/2fa/disable', { token: twoFaLoginToken, body: { code: totp(totpSecret) } });
check('disable with live code → success', r.status === 200 && r.json?.success === true, r);

r = await call('GET', '/auth/me', { token: loginToken });
check('2FA off again after disable', r.json?.user?.twoFactorEnabled === false, r.json?.user);

r = await call('POST', '/auth/login', { body: { email, password } });
check('plain password login works again after disable', r.status === 200 && typeof r.json?.token === 'string', r);

console.log('— session inventory (real auth_sessions rows) —');
r = await call('GET', '/auth/sessions', { token: loginToken });
const sessRows = Array.isArray(r.json?.sessions) ? r.json.sessions : [];
check('GET /auth/sessions → real rows', r.status === 200 && sessRows.length >= 2, r.json);
check('current session is flagged', sessRows.some((s) => s.isCurrent === true), sessRows.map((s) => s.isCurrent));
check(
  'row ids are 64-hex token hashes (irreversible, no raw tokens)',
  sessRows.every((s) => typeof s.id === 'string' && /^[0-9a-f]{64}$/.test(s.id)),
  sessRows[0],
);

const twoFaSessionId = crypto.createHash('sha256').update(twoFaLoginToken).digest('hex');
r = await call('DELETE', `/auth/sessions/${twoFaSessionId}`, { token: loginToken });
check('revoke own other session → 200', r.status === 200 && r.json?.success === true, r);
r = await call('GET', '/auth/me', { token: twoFaLoginToken });
check('revoked session → 401', r.status === 401, r);
r = await call('DELETE', `/auth/sessions/${'0'.repeat(64)}`, { token: loginToken });
check('revoke unknown session → 404', r.status === 404, r);

console.log('— password rotation —');
r = await call('POST', '/auth/password', {
  token: loginToken,
  body: { currentPassword: 'WrongPass999!', newPassword: 'RotatedPass123!' },
});
check('wrong current password → 401', r.status === 401, r);
r = await call('POST', '/auth/password', {
  token: loginToken,
  body: { currentPassword: password, newPassword: 'RotatedPass123!' },
});
check('password change → success (other sessions revoked)', r.status === 200 && r.json?.success === true, r);
r = await call('POST', '/auth/login', { body: { email, password } });
check('old password no longer accepted → 401', r.status === 401, r);
r = await call('POST', '/auth/login', { body: { email, password: 'RotatedPass123!' } });
check('new password accepted → 200 + session', r.status === 200 && typeof r.json?.token === 'string', r);

console.log('— account self-deletion (real lifecycle) —');
r = await call('DELETE', '/auth/account');
check('DELETE account without token → 401', r.status === 401, r);
r = await call('DELETE', '/auth/account', { token: loginToken });
check('delete own account → success', r.status === 200 && r.json?.success === true, r);
r = await call('GET', '/auth/me', { token: loginToken });
check('session dies with the account → 401', r.status === 401, r);
r = await call('POST', '/auth/register', { body: { email, password, name: 'Test User' } });
check('DB empty again → re-register bootstraps as ADMIN', r.status === 201 && r.json?.user?.role === 'ADMIN', r.json?.user);
r = await call('DELETE', '/auth/account', { token: r.json?.token });
check('final cleanup → account deleted', r.status === 200, r);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
