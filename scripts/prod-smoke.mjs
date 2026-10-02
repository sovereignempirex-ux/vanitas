// Production smoke test: verifies the REAL deployment end-to-end and cleans
// up after itself completely — afterwards the database must be empty again
// (so the owner's first registration bootstraps as ADMIN).
// Run: node scripts/prod-smoke.mjs
import crypto from 'crypto';

const BASE = process.env.TEST_BASE || 'https://vanitas-bot.vercel.app/api/v1';
const SITE = BASE.replace(/\/api\/v1$/, '');

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

async function head(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.status;
  } catch {
    return 0;
  }
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

console.log('— platform —');
let r = await call('GET', '/ready');
check(
  'ready → 200 + connected + free AI model',
  r.status === 200 && r.json?.database === 'connected' && r.json?.ai === 'pollinations_free',
  r.json,
);

r = await call('GET', '/auth/me');
check('/auth/me without session → 401 (no fake persona)', r.status === 401, r);

console.log('— bundled real images —');
for (const img of ['auth-bg.jpg', 'overview-hero.jpg', 'docs-banner.jpg', 'logo.svg', 'avatar-default.svg']) {
  const s = await head(`${SITE}/images/${img}`);
  check(`image /images/${img} → 200`, s === 200, { status: s });
}

console.log('— zero comments on every real docs page —');
for (const doc of ['getting-started', 'authentication', 'scopes', 'endpoints', 'bots', 'errors']) {
  r = await call('GET', `/comments/${doc}`);
  check(`/comments/${doc} → 0 comments`, r.status === 200 && r.json?.total === 0, r.json);
}

console.log('— real account lifecycle —');
const stamp = Date.now();
const email = `smoke_${stamp}@example.com`;
const password = 'SmokeTest123!';
r = await call('POST', '/auth/register', { body: { email, password, name: 'Smoke Tester' } });
check('register → 201 + session', r.status === 201 && String(r.json?.token).startsWith('vnt_sess_'), r);
check(
  'production DB was empty → bootstrap ADMIN',
  r.json?.user?.role === 'ADMIN',
  r.json?.user,
);
let token = r.json?.token;

r = await call('PATCH', '/auth/profile', {
  token,
  body: { name: 'Smoke Tester Renamed', avatarUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' },
});
check('PATCH profile → 200 (server-side save)', r.status === 200 && r.json?.user?.name === 'Smoke Tester Renamed', r.json);
r = await call('GET', '/auth/me', { token });
check('profile persists on /auth/me', r.json?.user?.name === 'Smoke Tester Renamed' && String(r.json?.user?.avatarUrl || '').startsWith('data:image/png'), r.json?.user);

console.log('— real comments CRUD —');
const doc = `smoke-${stamp}`;
r = await call('POST', `/comments/${doc}`, { token, body: { body: 'Smoke test comment on a throwaway doc.' } });
check('post → 201', r.status === 201, r);
const cmtId = r.json?.comment?.id;
r = await call('GET', `/comments/${doc}`);
check('list → 1', r.json?.total === 1, r.json);
r = await call('POST', '/comments/getting-started', { token, body: { body: 'Temporary comment — removed immediately.' } });
check('comment on real docs page → 201', r.status === 201, r);
const realCmtId = r.json?.comment?.id;
r = await call('DELETE', `/comments/${realCmtId}`, { token });
check('remove it right away → success', r.status === 200, r);
r = await call('DELETE', `/comments/${cmtId}`, { token });
check('delete throwaway comment → success', r.status === 200, r);
r = await call('GET', `/comments/${doc}`);
check('throwaway doc empty', r.json?.total === 0, r.json);

console.log('— free AI model answers —');
r = await call('POST', '/ai/chat', {
  token,
  body: { prompt: 'In exactly one short sentence: what is Vanitas?' },
});
const aiText = r.json?.text || '';
check('POST /ai/chat → 200 with a real reply', r.status === 200 && typeof aiText === 'string' && aiText.length >= 30, { status: r.status, text: aiText.slice(0, 220) });

console.log('— real 2FA (TOTP) —');
r = await call('POST', '/auth/2fa/setup', { token });
check(
  '2FA setup → real secret + otpauth URL',
  r.status === 200 && typeof r.json?.secret === 'string' && String(r.json?.otpauthUrl || '').startsWith('otpauth://totp/'),
  r,
);
const secret2fa = r.json?.secret;
const live2fa = secret2fa ? totp(secret2fa) : '000000';
const wrong2fa = live2fa === '000000' ? '123456' : '000000';
r = await call('POST', '/auth/2fa/enable', { token, body: { code: wrong2fa } });
check('enable with wrong code → 400', r.status === 400, r);
r = await call('POST', '/auth/2fa/enable', { token, body: { code: totp(secret2fa) } });
check('enable with live code → success (lazy PG column added)', r.status === 200 && r.json?.success === true, r);
r = await call('POST', '/auth/login', { body: { email, password } });
check('login without code → 401 + twoFactorRequired', r.status === 401 && r.json?.twoFactorRequired === true, r);
r = await call('POST', '/auth/login', { body: { email, password, code: totp(secret2fa) } });
check('login with live code → 200 + session', r.status === 200 && String(r.json?.token).startsWith('vnt_sess_'), r);
const token2fa = r.json?.token;
r = await call('POST', '/auth/2fa/disable', { token: token2fa, body: { code: totp(secret2fa) } });
check('disable with live code → success', r.status === 200 && r.json?.success === true, r);
r = await call('POST', '/auth/login', { body: { email, password } });
check('plain password login works after disable', r.status === 200, r);

console.log('— account cleanup —');
r = await call('DELETE', '/auth/account', { token });
check('delete own account → success', r.status === 200 && r.json?.success === true, r);
r = await call('GET', '/auth/me', { token });
check('session died with account → 401', r.status === 401, r);
r = await call('POST', '/auth/register', { body: { email, password, name: 'Smoke Tester' } });
check('DB empty again → bootstrap ADMIN reopens', r.status === 201 && r.json?.user?.role === 'ADMIN', r.json?.user);
r = await call('DELETE', '/auth/account', { token: r.json?.token });
check('final account removed', r.status === 200, r);

console.log('— docs pages still clean —');
for (const docId of ['getting-started', 'authentication', 'scopes', 'endpoints', 'bots', 'errors']) {
  r = await call('GET', `/comments/${docId}`);
  check(`/comments/${docId} → 0 comments`, r.status === 200 && r.json?.total === 0, r.json);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
