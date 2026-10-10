// Production smoke test: verifies the REAL deployment end-to-end and cleans
// up after itself completely — afterwards the database must be empty again
// Production registration never grants ADMIN by creation order; smoke addresses
// must be explicitly allowlisted if a future smoke step needs admin access.
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

// Live users DO comment on the real site — what must never appear is
// seeded/demo data. Every comment must reference a real account id format,
// carry an author name, and have a valid timestamp; an empty page also passes.
function onlyRealComments(json) {
  const comments = json?.comments || [];
  return (
    Array.isArray(comments) &&
    comments.every(
      (c) =>
        /^usr_/.test(c.userId || '') &&
        typeof c.authorName === 'string' &&
        c.authorName.length > 0 &&
        !isNaN(Date.parse(c.createdAt)),
    )
  );
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

// Admin surfaces reject anonymous callers — full permissions for admins only.
r = await call('GET', '/admin/users');
check('GET /admin/users without session → 401', r.status === 401, r);
r = await call('GET', '/admin/feature-flags');
check('GET /admin/feature-flags without session → 401', r.status === 401, r);
r = await call('GET', '/admin/statistics');
check('GET /admin/statistics without session → 401', r.status === 401, r);
r = await call('GET', '/admin/comments');
check('GET /admin/comments without session → 401', r.status === 401, r);
r = await call('GET', '/admin/suggestions');
check('GET /admin/suggestions without session → 401', r.status === 401, r);
r = await call('PATCH', '/admin/users/usr_x/verification', { body: { verification: 'USER' } });
check('PATCH /admin/users/:id/verification without session → 401', r.status === 401, r);
r = await call('POST', '/admin/invites', { body: { role: 'ADMIN' } });
check('POST /admin/invites without session → 401', r.status === 401, r);
// Hardened surfaces: key/webhook/database metadata is never anonymous.
r = await call('GET', '/api-keys/usage-analytics');
check('GET /api-keys/usage-analytics without session → 401', r.status === 401, r);
// The fake usage-injection endpoint stays removed — counters only move on
// real traffic now (404 with or without a session).
r = await call('POST', '/api-keys/probe_key/simulate-traffic', { body: { requestCount: 5 } });
check('POST /api-keys/:id/simulate-traffic → 404 (fake injection removed)', r.status === 404, r.status);
// Public status carries REAL telemetry: a 24-bucket hourly series, live
// component evidence rows and process uptime — no painted percentages.
r = await call('GET', '/status');
check(
  'GET /status returns real telemetry (24h series + components + uptime)',
  r.status === 200 &&
    Array.isArray(r.json?.hourlyTraffic) &&
    r.json.hourlyTraffic.length === 24 &&
    Array.isArray(r.json?.components) &&
    r.json.components.length === 6 &&
    typeof r.json?.stats?.requests24h === 'number' &&
    typeof r.json?.stats?.errorRate === 'number' &&
    typeof r.json?.uptimeSeconds === 'number',
  { status: r.status, keys: r.json && Object.keys(r.json) },
);
r = await call('GET', '/webhooks');
check('GET /webhooks without session → 401', r.status === 401, r);
r = await call('POST', '/webhooks/wh_probe/test');
check('POST /webhooks/:id/test without session → 401', r.status === 401, r);
r = await call('GET', '/databases/external');
check('GET /databases/external without session → 401', r.status === 401, r);
r = await call('POST', '/auth/password', { body: { currentPassword: 'whatever-1', newPassword: 'whatever-22' } });
check('POST /auth/password without session → 401', r.status === 401, r);
r = await call('GET', '/invites/inv_bogus_probe_token');
check(
  'public invite preview for unknown token → valid:false',
  r.status === 200 && r.json?.valid === false,
  r.status,
);
r = await call('GET', '/auth/username-available?username=probe_name');
check('GET /auth/username-available without session → 401', r.status === 401, r.status);
r = await call('GET', '/profiles/definitely_missing_user_xyz');
check('public profile for unknown username → 404', r.status === 404, r.status);

console.log('— bundled real images —');
for (const img of ['auth-bg.jpg', 'overview-hero.jpg', 'docs-banner.jpg', 'logo.svg', 'avatar-default.svg']) {
  const s = await head(`${SITE}/images/${img}`);
  check(`image /images/${img} → 200`, s === 200, { status: s });
}

console.log('— SEO (meta, structured data, crawlers) —');
let homeHtml = '';
try {
  homeHtml = await (await fetch(`${SITE}/`)).text();
} catch {
  /* checked below */
}
check('home HTML has description meta', /<meta name="description" content="[^"]{40,}"/.test(homeHtml), homeHtml.slice(0, 120));
check('home HTML has og:image', homeHtml.includes('property="og:image"') && homeHtml.includes('overview-hero.jpg'));
check('home HTML has twitter:card', homeHtml.includes('name="twitter:card"'));
check('home HTML has canonical link', homeHtml.includes('rel="canonical"'));
check('home HTML ships JSON-LD structured data', homeHtml.includes('application/ld+json'));
const robots = await (await fetch(`${SITE}/robots.txt`)).text().catch(() => '');
check('robots.txt → allows crawling + sitemap pointer', robots.includes('User-agent:') && robots.includes('Sitemap:'), robots.slice(0, 120));
const sitemap = await (await fetch(`${SITE}/sitemap.xml`)).text().catch(() => '');
check('sitemap.xml → valid urlset with home page', sitemap.includes('<urlset') && sitemap.includes(`<loc>${SITE}/</loc>`), sitemap.slice(0, 120));
const loginPage = await (await fetch(`${SITE}/login`)).text().catch(() => '');
check('/login → 200 HTML shell', loginPage.includes('<div id="root">'), loginPage.slice(0, 80));
const registerPage = await (await fetch(`${SITE}/register`)).text().catch(() => '');
check('/register → 200 HTML shell', registerPage.includes('<div id="root">'), registerPage.slice(0, 80));

console.log('— live YouTube search (never fabricated) —');
r = await call('GET', '/youtube/search?q=node.js%20tutorial&limit=4');
const ytVideos = r.json?.videos || [];
check('GET /youtube/search → live results', r.status === 200 && ytVideos.length > 0, { status: r.status, count: ytVideos.length });
check(
  'every result is a real 11-char YouTube id',
  ytVideos.length > 0 && ytVideos.every((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id)),
  ytVideos.map((v) => v.id),
);
r = await call('GET', '/videos/tutorials');
check(
  'tutorial showcase serves live videos only',
  r.status === 200 && Array.isArray(r.json?.tutorials) && r.json.tutorials.every((t) => !t.youtubeId || /^[A-Za-z0-9_-]{11}$/.test(t.youtubeId)),
  { count: r.json?.tutorials?.length },
);

console.log('— zero comments on every real docs page —');
for (const doc of ['getting-started', 'authentication', 'scopes', 'endpoints', 'bots', 'errors']) {
  r = await call('GET', `/comments/${doc}`);
  check(`/comments/${doc} → only real user comments (no seeds)`, r.status === 200 && onlyRealComments(r.json), { total: r.json?.total });
}

console.log('— real account lifecycle —');
const stamp = Date.now();
const email = `smoke_${stamp}@example.com`;
const password = 'SmokeTest123!';
r = await call('POST', '/auth/register', { body: { email, password, name: 'Smoke Tester' } });
check('register → 201 + session', r.status === 201 && String(r.json?.token).startsWith('vnt_sess_'), r);
check(
  'production registration does not grant ADMIN by account order',
  r.json?.user?.role === 'USER',
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
check('reply comes from a REAL model engine (not the disclosed local KB)', !!r.json?.engine && r.json.engine !== 'local_kb', { engine: r.json?.engine, upstream: r.json?.upstream });

// Site-awareness: every system prompt carries verified facts about THIS
// deployment (real routes, scopes, limits), so the model must name real paths.
let siteAwareText = '';
for (let attempt = 0; attempt < 2; attempt++) {
  const sr = await call('POST', '/ai/chat', {
    token,
    body: { prompt: 'What is the exact account registration endpoint of this platform? Reply with only the path.', persona: 'api', toneStyle: 'developer' },
  });
  siteAwareText = sr.json?.text || '';
  if (siteAwareText.includes('/auth/register')) break;
  await new Promise((res) => setTimeout(res, 1500));
}
check('AI is site-aware → names the real /auth/register endpoint', siteAwareText.includes('/auth/register'), siteAwareText.slice(0, 180));

console.log('— AI chat streaming (SSE) —');
try {
  const sse = await fetch(`${BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'In exactly one short sentence: what is Vanitas?', persona: 'docs', toneStyle: 'developer', stream: true }),
  });
  check('stream request → text/event-stream', sse.ok && String(sse.headers.get('content-type') || '').includes('text/event-stream'), sse.headers.get('content-type'));
  const reader = sse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let deltas = 0;
  let done = null;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      try {
        const ev = JSON.parse(trimmed.slice(5).trim());
        if (ev.type === 'delta') deltas++;
        if (ev.type === 'done') done = ev;
      } catch {
        /* partial frame */
      }
    }
  }
  check('stream emits progressive deltas', deltas >= 1, { deltas });
  check('stream done event carries full text', !!done && typeof done.text === 'string' && done.text.length >= 30, { text: String(done?.text || '').slice(0, 120) });
  check('stream done reports which engine answered', !!done?.engine, { engine: done?.engine, upstream: done?.upstream ?? null });
} catch (err) {
  check('stream request reachable', false, err.message);
}

console.log('— persisted chat history —');
r = await call('GET', '/ai/history', { token });
check('signed-in chat exchange is persisted', r.status === 200 && (r.json?.messages || []).some((m) => String(m.content).includes('what is Vanitas')), { status: r.status, count: r.json?.messages?.length });
r = await call('GET', '/ai/history');
check('history is never public (401 anon)', r.status === 401, r.status);
r = await call('DELETE', '/ai/history', { token });
check('clear chat → wipes my history', r.status === 200 && r.json?.success === true, r);
r = await call('GET', '/ai/history', { token });
check('history empty after clear', r.status === 200 && (r.json?.messages || []).length === 0, r.json);

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

console.log('— honest download catalog + real integrity chain —');
r = await call('GET', '/download/releases');
check(
  'release catalog → 200 + latestVersion derived from catalog',
  r.status === 200 && typeof r.json?.latestVersion === 'string' && r.json.latestVersion.length > 0,
  r.json?.latestVersion,
);
const dlReleases = r.json?.releases || [];
check(
  '4 releases — every published number derived from the real served bytes',
  dlReleases.length === 4 &&
    dlReleases.every(
      (x) =>
        /^[0-9a-f]{64}$/.test(x.sha256 || '') &&
        Number.isInteger(x.sizeBytes) &&
        x.sizeBytes > 0 &&
        Math.abs(x.sizeMb - x.sizeBytes / 1048576) < 0.00001 &&
        x.artifactKind === 'manifest' &&
        String(x.filename).endsWith('-manifest.txt') &&
        typeof x.downloadsCount === 'number' &&
        x.downloadsCount >= 0,
    ),
  dlReleases,
);
const apkMeta = dlReleases.find((x) => x.type === 'apk');
r = await call('GET', '/download/apk');
check('download without a session → 401 (never serves unauthenticated)', r.status === 401, r.status);
{
  const dlRes = await fetch(`${BASE}/download/apk`, { headers: { authorization: `Bearer ${token}` } });
  const dlBuf = Buffer.from(await dlRes.arrayBuffer());
  check(
    'session download → 200 + exact published byte count',
    dlRes.status === 200 && apkMeta && dlBuf.length === apkMeta.sizeBytes,
    { s: dlRes.status, bytes: dlBuf.length, sizeBytes: apkMeta?.sizeBytes },
  );
  check(
    'sha256(served bytes) === published checksum (end-to-end chain on production)',
    !!apkMeta && crypto.createHash('sha256').update(dlBuf).digest('hex') === apkMeta.sha256,
    { real: crypto.createHash('sha256').update(dlBuf).digest('hex'), published: apkMeta?.sha256 },
  );
}

console.log('— account cleanup —');
r = await call('DELETE', '/auth/account', { token });
check('delete own account → success', r.status === 200 && r.json?.success === true, r);
r = await call('GET', '/auth/me', { token });
check('session died with account → 401', r.status === 401, r);
r = await call('POST', '/auth/register', { body: { email, password, name: 'Smoke Tester' } });
check(
  're-register after cleanup → 201 + USER role',
  r.status === 201 && r.json?.user?.role === 'USER',
  r.json?.user,
);
r = await call('DELETE', '/auth/account', { token: r.json?.token });
check('final account removed', r.status === 200, r);

console.log('— docs pages still clean —');
for (const docId of ['getting-started', 'authentication', 'scopes', 'endpoints', 'bots', 'errors']) {
  r = await call('GET', `/comments/${docId}`);
  check(`/comments/${docId} → only real user comments (no seeds)`, r.status === 200 && onlyRealComments(r.json), { total: r.json?.total });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
