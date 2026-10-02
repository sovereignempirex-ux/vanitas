// End-to-end test of the external API-key system (dashboard-created keys
// authenticating /api/v1/public/*).
//   local:  node scripts/api-key-test.mjs            (server on :3111)
//   live:   TEST_BASE=https://vanitas-bot.vercel.app/api/v1 node scripts/api-key-test.mjs
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3111/api/v1';

let pass = 0;
let fail = 0;

async function call(method, path, { token, apiKey, body, headers: extra } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (apiKey) headers['x-api-key'] = apiKey;
  Object.assign(headers, extra || {});
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
  return { status: res.status, json, headers: res.headers };
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

// ---- wait for server -------------------------------------------------------
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

// ---- account ---------------------------------------------------------------
console.log('— account —');
// Occupy the first-account bootstrap slot first: the tester below must be an
// ordinary USER (later checks assert USER-level limits, e.g. being refused an
// adminOnly scope). On a non-empty database the primer is a USER too.
const primerEmail = `apikey_primer_${Date.now()}@example.com`;
const primer = await call('POST', '/auth/register', { body: { email: primerEmail, password: 'SuperSecret123!', name: 'API Key Primer' } });
check('primer registers (occupies bootstrap slot)', primer.status === 201, primer);

const email = `apikey_${Date.now()}@example.com`;
let r = await call('POST', '/auth/register', { body: { email, password: 'SuperSecret123!', name: 'API Key Tester' } });
check('register → 201', r.status === 201, r);
const token = r.json?.token;
check('session token issued', typeof token === 'string' && token.startsWith('vnt_sess_'), r.json);

// ---- create the main key ---------------------------------------------------
console.log('— create key —');
r = await call('POST', '/api-keys', {
  token,
  body: { name: 'E2E Main Key', scopes: ['api.read', 'bot.execute'], rateLimitPerMin: 600 },
});
check('create key → 201', r.status === 201, r);
const raw = r.json?.rawSecret;
const mainId = r.json?.key?.id;
check('rawSecret is a live sk_live_vanitas_ secret', typeof raw === 'string' && raw.startsWith('sk_live_vanitas_'), r.json);
check('create response never contains secretHash', !JSON.stringify(r.json).includes('secretHash'), r.json);
check('key object does not echo the raw secret', !JSON.stringify(r.json?.key || {}).includes(raw), r.json);

console.log('— list keys (serialization) —');
r = await call('GET', '/api-keys', { token });
const listJson = JSON.stringify(r.json);
check('list → 200', r.status === 200, r);
check('list never contains secretHash', !listJson.includes('secretHash'), r.json);
check('list never contains the raw secret', !listJson.includes(raw), r.json);

// ---- authentication styles -------------------------------------------------
console.log('— authentication —');
r = await call('GET', '/public/ping', { apiKey: raw });
check('x-api-key header → 200', r.status === 200, r);
check('ping body ok=true', r.json?.ok === true, r.json);
check('ping key id matches', r.json?.key?.id === mainId, r.json);
check('X-RateLimit-Limit header present', r.headers.get('x-ratelimit-limit') === '600', r.headers.get('x-ratelimit-limit'));
check('X-RateLimit-Reset header is a unix timestamp', Number(r.headers.get('x-ratelimit-reset')) > 1_600_000_000, r.headers.get('x-ratelimit-reset'));

r = await call('GET', '/public/ping', { token: raw });
check('Authorization: Bearer sk_... → 200', r.status === 200, r);

r = await call('GET', '/public/ping');
check('missing key → 401', r.status === 401, r);
check('missing key message', r.json?.error === 'API key required', r.json);

r = await call('GET', '/public/ping', { apiKey: 'sk_live_vanitas_wrong_wrong_wrong_000000' });
check('wrong key → 401 invalid', r.status === 401 && r.json?.error === 'Invalid API key', r);

r = await call('GET', '/public/ping', { token });
check('session token as Bearer → 401', r.status === 401, r);

r = await call('GET', '/public/ping', { apiKey: token });
check('session token as x-api-key → 401', r.status === 401, r);

// ---- /public/me ------------------------------------------------------------
console.log('— /public/me —');
r = await call('GET', '/public/me', { apiKey: raw });
check('/public/me → 200', r.status === 200, r);
check('/public/me returns the key', r.json?.key?.id === mainId, r.json);
check('/public/me returns the owner', typeof r.json?.owner?.id === 'string' && r.json.owner.id.length > 0, r.json);
check('/public/me returns limits', r.json?.limits?.monthlyQuota === 300000 && r.json?.limits?.rateLimitPerMin === 600, r.json?.limits);
check('/public/me never returns secretHash', !JSON.stringify(r.json).includes('secretHash'), r.json);

// ---- /public/quota ---------------------------------------------------------
console.log('— /public/quota —');
r = await call('GET', '/public/quota', { apiKey: raw });
check('/public/quota → 200', r.status === 200, r);
check('/public/quota reports real usage', r.json?.quota?.used >= 2 && r.json?.quota?.limit === 300000, r.json?.quota);
check('/public/quota reports the rate window', r.json?.rate?.algorithm === 'sliding_window' && r.json?.rate?.limitPerMin === 600, r.json?.rate);

// ---- scope enforcement -----------------------------------------------------
console.log('— scopes —');
r = await call('POST', '/api-keys', { token, body: { name: 'E2E Scope Key', scopes: ['bot.execute'] } });
check('create scope key → 201', r.status === 201, r);
const scopeRaw = r.json?.rawSecret;
const scopeId = r.json?.key?.id;

r = await call('GET', '/public/status', { apiKey: scopeRaw });
check('/public/status without api.read → 403', r.status === 403, r);
check('403 names the missing scope', r.json?.error === 'Missing required scope: api.read', r.json);
check('403 lists granted scopes', Array.isArray(r.json?.grantedScopes) && r.json.grantedScopes.includes('bot.execute'), r.json);

r = await call('PATCH', `/api-keys/${scopeId}/scopes`, { token, body: { scopes: ['api.read', 'bot.execute'] } });
check('PATCH scopes → 200', r.status === 200, r);

r = await call('GET', '/public/status', { apiKey: scopeRaw });
check('/public/status with api.read → 200', r.status === 200, r);
check('/public/status reports services', r.json?.services?.api === 'operational', r.json?.services);
check('/public/status reports database', ['connected', 'unreachable', 'in-memory-fallback'].includes(r.json?.database), r.json?.database);
check('/public/status reports uptime', Number(r.json?.uptimeSeconds) >= 0, r.json?.uptimeSeconds);

// ---- monthly quota ---------------------------------------------------------
console.log('— monthly quota (limit 3) —');
r = await call('POST', '/api-keys', { token, body: { name: 'E2E Quota Key', scopes: ['api.read'], rateLimitPerMin: 600 } });
const quotaRaw = r.json?.rawSecret;
const quotaId = r.json?.key?.id;
r = await call('PATCH', `/api-keys/${quotaId}/rate-limit`, { token, body: { rateLimitPerMin: 60, monthlyQuota: 3 } });
check('PATCH rate-limit (quota=3) → 200', r.status === 200, r);

const quotaStatuses = [];
for (let i = 0; i < 4; i++) {
  quotaStatuses.push((await call('GET', '/public/ping', { apiKey: quotaRaw })).status);
}
check('quota: first 3 requests served', quotaStatuses.slice(0, 3).every((s) => s === 200), quotaStatuses);
check('quota: 4th request → 429', quotaStatuses[3] === 429, quotaStatuses);

r = await call('GET', '/public/ping', { apiKey: quotaRaw });
check('quota 429 names the quota error', r.status === 429 && r.json?.error === 'Monthly quota exceeded', r);
check('quota 429 carries quota/used/resetsAt', r.json?.quota === 3 && r.json?.used === 3 && typeof r.json?.resetsAt === 'string', r.json);
check('quota 429 sets Retry-After', Number(r.headers.get('retry-after')) >= 1, r.headers.get('retry-after'));
check('quota 429 still carries X-RateLimit-Limit', r.headers.get('x-ratelimit-limit') === '60', r.headers.get('x-ratelimit-limit'));

r = await call('GET', '/public/quota', { apiKey: quotaRaw });
check('/public/quota itself returns 429 when exhausted (no exemption)', r.status === 429 && r.json?.used === 3, r);

// ---- per-key rate limiting (reject_429, default) ---------------------------
console.log('— rate limit (10 req/min, reject_429) —');
r = await call('POST', '/api-keys', { token, body: { name: 'E2E Rate Key', scopes: ['api.read'], rateLimitPerMin: 10 } });
check('create rpm=10 key → 201', r.status === 201, r);
const rateRaw = r.json?.rawSecret;

const rateResults = [];
for (let i = 0; i < 15; i++) {
  rateResults.push(await call('GET', '/public/ping', { apiKey: rateRaw }));
}
const rateStatuses = rateResults.map((x) => x.status);
check('rate limit: first 10 requests served', rateStatuses.slice(0, 10).every((s) => s === 200), rateStatuses);
check('rate limit: requests 11-15 rejected with 429', rateStatuses.slice(10).every((s) => s === 429), rateStatuses);
check('served request reports remaining=9', rateResults[0].headers.get('x-ratelimit-remaining') === '9', rateResults[0].headers.get('x-ratelimit-remaining'));

const rejected = rateResults.find((x) => x.status === 429);
check('429 sets X-RateLimit-Limit=10', rejected?.headers.get('x-ratelimit-limit') === '10', rejected?.headers.get('x-ratelimit-limit'));
check('429 sets X-RateLimit-Remaining=0', rejected?.headers.get('x-ratelimit-remaining') === '0', rejected?.headers.get('x-ratelimit-remaining'));
check('429 sets X-RateLimit-Reset', Number(rejected?.headers.get('x-ratelimit-reset')) > 1_600_000_000, rejected?.headers.get('x-ratelimit-reset'));
check('429 sets Retry-After >= 1', Number(rejected?.headers.get('retry-after')) >= 1, rejected?.headers.get('retry-after'));
check('429 body names the rate limit', rejected?.json?.error === 'Rate limit exceeded', rejected?.json);

// ---- actionOnExceed = throttle_delay --------------------------------------
console.log('— actionOnExceed: throttle_delay —');
r = await call('POST', '/api-keys', { token, body: { name: 'E2E Throttle Key', scopes: ['api.read'], rateLimitPerMin: 10 } });
const throttleRaw = r.json?.rawSecret;
const throttleId = r.json?.key?.id;
r = await call('PATCH', `/api-keys/${throttleId}/rate-limit`, { token, body: { rateLimitPerMin: 10, actionOnExceed: 'throttle_delay' } });
check('PATCH actionOnExceed=throttle_delay → 200', r.status === 200, r);

const throttleStart = Date.now();
const throttleStatuses = [];
for (let i = 0; i < 12; i++) {
  throttleStatuses.push((await call('GET', '/public/ping', { apiKey: throttleRaw })).status);
}
const throttleElapsed = Date.now() - throttleStart;
check('throttle_delay: all 12 requests served (200)', throttleStatuses.every((s) => s === 200), throttleStatuses);
check('throttle_delay actually delayed the over-limit requests', throttleElapsed >= 1500, { throttleElapsed });

// ---- actionOnExceed = alert_only ------------------------------------------
console.log('— actionOnExceed: alert_only —');
r = await call('POST', '/api-keys', { token, body: { name: 'E2E Alert Key', scopes: ['api.read'], rateLimitPerMin: 10 } });
const alertRaw = r.json?.rawSecret;
const alertId = r.json?.key?.id;
r = await call('PATCH', `/api-keys/${alertId}/rate-limit`, { token, body: { rateLimitPerMin: 10, actionOnExceed: 'alert_only' } });
check('PATCH actionOnExceed=alert_only → 200', r.status === 200, r);

const alertStatuses = [];
for (let i = 0; i < 12; i++) {
  alertStatuses.push((await call('GET', '/public/ping', { apiKey: alertRaw })).status);
}
check('alert_only: all 12 requests served (200)', alertStatuses.every((s) => s === 200), alertStatuses);

// ---- revoke ----------------------------------------------------------------
console.log('— revoke —');
r = await call('POST', '/api-keys', { token, body: { name: 'E2E Revoke Key', scopes: ['api.read'] } });
const revokeRaw = r.json?.rawSecret;
const revokeId = r.json?.key?.id;
check('pre-revoke ping → 200', (await call('GET', '/public/ping', { apiKey: revokeRaw })).status === 200, {});
r = await call('DELETE', `/api-keys/${revokeId}`, { token, body: { reason: 'e2e test' } });
check('revoke → 200', r.status === 200, r);
r = await call('GET', '/public/ping', { apiKey: revokeRaw });
check('revoked key → 403', r.status === 403 && r.json?.error === 'API key revoked', r);

// ---- expiry ----------------------------------------------------------------
console.log('— expiry —');
r = await call('POST', '/api-keys', { token, body: { name: 'E2E Expired Key', scopes: ['api.read'], expiresAt: '2020-01-01T00:00:00.000Z' } });
check('create with past expiresAt → 201', r.status === 201, r);
const expiredRaw = r.json?.rawSecret;
r = await call('GET', '/public/ping', { apiKey: expiredRaw });
check('expired key → 403', r.status === 403 && r.json?.error === 'API key expired', r);

// ---- rotation --------------------------------------------------------------
console.log('— rotation —');
r = await call('POST', '/api-keys', { token, body: { name: 'E2E Rotate Key', scopes: ['api.read'] } });
const oldRaw = r.json?.rawSecret;
const rotateId = r.json?.key?.id;
check('pre-rotate ping → 200', (await call('GET', '/public/ping', { apiKey: oldRaw })).status === 200, {});

r = await call('POST', `/api-keys/${rotateId}/rotate`, { token });
check('rotate → 200 + new secret', r.status === 200 && typeof r.json?.rawSecret === 'string' && r.json.rawSecret !== oldRaw, r);
const newRaw = r.json?.rawSecret;

r = await call('GET', '/public/ping', { apiKey: oldRaw });
check('old secret invalidated after rotate → 401', r.status === 401, r);
r = await call('GET', '/public/ping', { apiKey: newRaw });
check('new secret accepted after rotate → 200', r.status === 200, r);

// ---- admin-only scopes cannot be granted by a USER -------------------------
console.log('— admin scopes —');
r = await call('POST', '/api-keys', { token, body: { name: 'E2E Admin Scope', scopes: ['users.write'] } });
check('USER cannot create an adminOnly-scope key → 403', r.status === 403, r);

// ---- CORS preflight --------------------------------------------------------
console.log('— CORS —');
const preflight = await fetch(`${BASE}/public/ping`, {
  method: 'OPTIONS',
  headers: {
    origin: 'https://vanitas-bot.vercel.app',
    'access-control-request-method': 'GET',
    'access-control-request-headers': 'x-api-key',
  },
});
check('CORS preflight → 204', preflight.status === 204, { status: preflight.status });
const allowHeaders = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase();
check('CORS allows the x-api-key header', allowHeaders.includes('x-api-key'), allowHeaders);

// ---- counters really moved -------------------------------------------------
console.log('— usage counters —');
r = await call('GET', '/public/me', { apiKey: raw });
check('usageCount incremented on served requests', r.json?.key?.usageCount >= 3, r.json?.key?.usageCount);
check('currentUsageThisMonth incremented', r.json?.limits?.usedThisMonth >= 3, r.json?.limits?.usedThisMonth);
check('lastUsedAt updated', typeof r.json?.key?.lastUsedAt === 'string' && r.json.key.lastUsedAt !== null, r.json?.key?.lastUsedAt);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
