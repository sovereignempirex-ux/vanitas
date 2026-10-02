// Local end-to-end test of the real auth flow (in-memory storage mode).
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
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
r = await call('PATCH', '/auth/profile', { token: loginToken, body: { name: 'Upload Tester', avatarUrl: tinyPng } });
check('uploaded image data-URL avatar → 200', r.status === 200 && String(r.json?.user?.avatarUrl || '').startsWith('data:image/png'), r.json?.user);
r = await call('PATCH', '/auth/profile', { body: { name: 'Anonymous', avatarUrl: '' } });
check('PATCH profile without token → 401', r.status === 401, r);

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
