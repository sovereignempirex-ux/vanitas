// End-to-end OAuth 2.0 test against a MOCK provider — no real keys needed.
// Verifies: authorize redirect → signed state → callback → code exchange →
// profile fetch → account upsert/link → session token → SPA redirect,
// plus tampered-state rejection and verified-email-only account linking.
//
// Run AFTER `npm run build` (spawns dist/server.cjs with DISCORD_* URL overrides).

import http from 'http';
import { spawn } from 'child_process';

const APP_PORT = 3113;
const appBase = `http://127.0.0.1:${APP_PORT}`;

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

// ---- mock OAuth provider ----------------------------------------------------
let currentProfile = {
  id: 'disc_123',
  username: 'mockuser',
  global_name: 'Mock User',
  email: 'mock@example.com',
  verified: true,
  avatar: null,
  discriminator: '0',
};
let codeCounter = 0;

const mock = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    codeCounter++;
    res.writeHead(302, { location: `${redirectUri}?code=mockcode_${codeCounter}&state=${encodeURIComponent(state || '')}` });
    return res.end();
  }
  if (req.method === 'POST' && url.pathname === '/token') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ access_token: `mock_tok_${codeCounter}`, token_type: 'Bearer' }));
  }
  if (req.method === 'GET' && url.pathname === '/me') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(currentProfile));
  }
  if (req.method === 'POST' && url.pathname === '/__set_profile') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      currentProfile = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

/** Walk the redirect chain until it reaches the SPA (#vnt_oauth / #vnt_error). */
async function walk(url) {
  let current = url;
  const hops = [];
  for (let i = 0; i < 8; i++) {
    const res = await fetch(current, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      hops.push(loc);
      if (loc.includes('vnt_oauth=') || loc.includes('vnt_error=')) break;
      current = new URL(loc, current).toString();
      continue;
    }
    hops.push(`STOP:${res.status}`);
    break;
  }
  return hops;
}

function tokenFrom(hops) {
  const hit = hops.find((h) => h.includes('vnt_oauth='));
  return hit ? hit.split('vnt_oauth=')[1] : null;
}

function oauthErrorFrom(hops) {
  const hit = hops.find((h) => h.includes('vnt_error='));
  return hit ? hit.split('vnt_error=')[1] : null;
}

async function me(token) {
  const res = await fetch(`${appBase}/api/v1/auth/me`, { headers: { authorization: `Bearer ${token}` } });
  return res.json();
}

async function setMockProfile(profile) {
  await fetch('http://127.0.0.1:' + mock.address().port + '/__set_profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(profile),
  });
}

// ---- run --------------------------------------------------------------------
async function main() {
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const mockBase = `http://127.0.0.1:${mock.address().port}`;

  let stderr = '';
  const app = spawn(process.execPath, ['dist/server.cjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(APP_PORT),
      FRONTEND_URL: appBase,
      DATABASE_URL: '',
      DISCORD_CLIENT_ID: 'mock_client_id',
      DISCORD_CLIENT_SECRET: 'mock_client_secret',
      DISCORD_AUTHORIZE_URL: `${mockBase}/authorize`,
      DISCORD_TOKEN_URL: `${mockBase}/token`,
      DISCORD_PROFILE_URL: `${mockBase}/me`,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  app.stderr.on('data', (d) => (stderr += d.toString()));

  let appUp = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${appBase}/api/v1/health`);
      if (r.status === 200) {
        appUp = true;
        break;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!appUp) {
    console.error('app server did not start:\n' + stderr);
    app.kill();
    mock.close();
    process.exit(1);
  }

  // This server boots with an empty in-memory DB, whose FIRST account
  // legitimately bootstraps as ADMIN (same rule as a fresh PostgreSQL
  // install). Register a primer so the OAuth sign-ups below are ordinary
  // second-account registrations and must come out as USER.
  const primEmail = `primer_${Date.now()}@example.com`;
  const primRes = await fetch(`${appBase}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: primEmail, password: 'PrimerPass123!', name: 'Suite Primer' }),
  });
  const primJson = await primRes.json().catch(() => null);
  check('primer owns the bootstrap slot (first account → ADMIN)', primRes.status === 201 && primJson?.user?.role === 'ADMIN', primJson);

  try {
    console.log('— providers detection —');
    const provRes = await fetch(`${appBase}/api/v1/auth/providers`);
    const provJson = await provRes.json();
    check('discord detected as configured', provJson?.providers?.discord === true, provJson);
    check('google/github remain unconfigured', provJson?.providers?.google === false && provJson?.providers?.github === false, provJson);

    console.log('— full authorization-code flow —');
    let hops = await walk(`${appBase}/api/v1/social/discord`);
    check('hop 1 → provider authorize URL with state', hops[0]?.includes('/authorize?') && hops[0]?.includes('state='), hops);
    check('hop 2 → app callback with code', hops[1]?.includes('/api/v1/social/discord/callback') && hops[1]?.includes('code=mockcode_'), hops);
    const tokenA = tokenFrom(hops);
    check('hop 3 → SPA with session token', !!tokenA && hops[2]?.includes('/login#vnt_oauth='), hops);
    check('no oauth error emitted', oauthErrorFrom(hops) === null, hops);

    const userA = await me(tokenA);
    check('session resolves mock profile user', userA?.user?.email === 'mock@example.com', userA?.user);
    check('role is USER (never self-admin)', userA?.user?.role === 'USER', userA?.user);
    check('discord marked as connected', userA?.user?.connectedAccounts?.discord === true, userA?.user);

    console.log('— repeat login is idempotent —');
    hops = await walk(`${appBase}/api/v1/social/discord`);
    const tokenB = tokenFrom(hops);
    const userB = await me(tokenB);
    check('same identity → same account (no duplicates)', userB?.user?.id === userA?.user?.id, { a: userA?.user?.id, b: userB?.user?.id });

    console.log('— verified email links to an existing password account —');
    const email = `linked_${Date.now()}@example.com`;
    const regRes = await fetch(`${appBase}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'SuperSecret123!', name: 'Link Target' }),
    });
    const regJson = await regRes.json();
    check('password account created', regRes.status === 201 && !!regJson?.user?.id, regJson);
    await setMockProfile({ ...currentProfile, id: 'disc_999', email, verified: true });
    hops = await walk(`${appBase}/api/v1/social/discord`);
    const tokenC = tokenFrom(hops);
    const userC = await me(tokenC);
    check('OAuth links to SAME account by verified email', userC?.user?.id === regJson?.user?.id, { oauth: userC?.user?.id, pw: regJson?.user?.id });

    console.log('— tampered state rejected —');
    hops = await walk(`${appBase}/api/v1/social/discord`);
    const tampered = hops[0].replace(/state=([^&]+)/, (m, s) => `state=${s.slice(0, -2)}xx`);
    const hops2 = await walk(tampered);
    check('tampered state → invalid_state', oauthErrorFrom(hops2) === 'invalid_state', hops2);
    check('tampered state issued NO token', tokenFrom(hops2) === null, hops2);

    console.log('— unverified email never takes over an account —');
    await setMockProfile({ ...currentProfile, id: 'disc_777', email: 'unverified_target@example.com', verified: false });
    hops = await walk(`${appBase}/api/v1/social/discord`);
    const tokenD = tokenFrom(hops);
    const userD = await me(tokenD);
    check('unverified email ignored → fallback address', userD?.user?.email === 'discord_disc_777@oauth.vanitas.local', userD?.user);
    check('still USER role', userD?.user?.role === 'USER', userD?.user);
  } catch (err) {
    fail++;
    console.log(`  FAIL  unexpected error -> ${err?.message || err}\n${stderr}`);
  } finally {
    app.kill();
    mock.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
