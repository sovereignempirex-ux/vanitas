// Production smoke test: verifies the REAL deployment end-to-end and cleans
// up after itself completely — afterwards the database must be empty again
// (so the owner's first registration bootstraps as ADMIN).
// Run: node scripts/prod-smoke.mjs
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
