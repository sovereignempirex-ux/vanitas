// E2E of the server-request order system ("طلب سيرفرات") + the sandbox
// console: public catalog, anonymous submission (validation + honeypot),
// one-time track token, admin lifecycle (approve / deliver / reject),
// role gates, embed static files, and the terminal-equipped preview.
//
//   TEST_BASE=http://127.0.0.1:3111/api/v1 node scripts/server-orders-test.mjs
//
// Runs against a FRESH in-memory store (first register = ADMIN) and never
// seeds anything — every assertion below creates exactly what it needs.

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3111/api/v1';
const ORIGIN = new URL(BASE).origin;

let pass = 0;
let fail = 0;

async function call(method, path, { token, body, headers: extra } = {}) {
  const headers = { 'content-type': 'application/json', ...(extra || {}) };
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
  return { status: res.status, json, headers: res.headers };
}

// Raw fetch (no forced content-type) for static/embed files.
async function raw(path) {
  const res = await fetch(`${ORIGIN}${path}`);
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
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

const stamp = Date.now();

console.log('— fresh install is EMPTY (no seeded plans or requests) —');
let r = await call('GET', '/servers/plans');
check('public catalog → 200', r.status === 200, r);
check('catalog starts empty (nothing fake)', Array.isArray(r.json?.plans) && r.json.plans.length === 0, r.json);

console.log('— first account is ADMIN (fresh store) —');
r = await call('POST', '/auth/register', {
  body: { email: `so_admin_${stamp}@example.com`, password: 'ServerOrder123!', name: 'Orders Admin' },
});
check('register admin → 201', r.status === 201, r);
const adminTok = r.json?.token;
check('session token issued', String(adminTok).startsWith('vnt_sess_'), adminTok);

// A second, non-admin account for the role-gate checks.
r = await call('POST', '/auth/register', {
  body: { email: `so_user_${stamp}@example.com`, password: 'ServerOrder123!', name: 'Plain User' },
});
check('register plain user → 201', r.status === 201, r);
const userTok = r.json?.token;

console.log('— role gates: the queue is admin-only —');
r = await call('GET', '/servers/requests', { token: userTok });
check('plain user reads the queue → 401/403', r.status === 401 || r.status === 403, r.status);
r = await call('GET', '/servers/plans?all=1', { token: userTok });
check('plain user reads all plans → 401/403', r.status === 401 || r.status === 403, r.status);
r = await call('PATCH', '/servers/requests/sreq_fake', { token: userTok, body: { status: 'approved' } });
check('plain user patches a request → 401/403', r.status === 401 || r.status === 403, r.status);
r = await call('GET', '/servers/requests');
check('anonymous queue read → 401/403', r.status === 401 || r.status === 403, r.status);

console.log('— admin plan catalog CRUD —');
r = await call('POST', '/servers/plans', {
  token: adminTok,
  body: { name: 'VPS Starter', specs: '2 vCPU · 4 GB · 80 GB NVMe', price: '$12 / mo', description: 'Entry tier' },
});
check('create plan → 201', r.status === 201, r);
const plan = r.json?.plan;
check('plan carries a real id (spl_…)', String(plan?.id || '').startsWith('spl_'), plan?.id);
check('new plan is active by default', plan?.active === true, plan?.active);

r = await call('POST', '/servers/plans', { token: adminTok, body: { name: 'x' } });
check('plan name < 3 chars → 400', r.status === 400, r.status);

r = await call('POST', '/servers/plans');
check('anonymous plan create → 401/403', r.status === 401 || r.status === 403, r.status);

r = await call('GET', '/servers/plans');
check('public catalog now lists the active plan', r.json?.plans?.length === 1 && r.json.plans[0].id === plan.id, r.json);
r = await call('GET', '/servers/plans?all=1', { token: adminTok });
check('admin all=1 view lists it too', r.json?.plans?.length === 1, r.json);

r = await call('PATCH', `/servers/plans/${plan.id}`, {
  token: adminTok,
  body: { price: '$9 / mo', specs: '2 vCPU · 4 GB · 100 GB NVMe' },
});
check('update plan → 200', r.status === 200 && r.json?.plan?.price === '$9 / mo', r.json);

r = await call('PATCH', `/servers/plans/${plan.id}`, { token: adminTok, body: { active: false } });
check('deactivate plan → 200', r.status === 200 && r.json?.plan?.active === false, r.json);
r = await call('GET', '/servers/plans');
check('inactive plan hidden from the public catalog', r.json?.plans?.length === 0, r.json);

r = await call('PATCH', `/servers/plans/${plan.id}`, { token: adminTok, body: { active: true } });
check('reactivate plan → 200', r.status === 200 && r.json?.plan?.active === true, r.json);

console.log('— anonymous submission: validation + honeypot —');
r = await call('POST', '/servers/requests', { body: { planId: plan.id, name: 'Sara', email: 'nope' } });
check('invalid email → 400', r.status === 400, r);
r = await call('POST', '/servers/requests', { body: { planId: 'spl_missing', name: 'Sara', email: 'sara@example.com' } });
check('unknown plan → 400', r.status === 400, r);
r = await call('POST', '/servers/requests', { body: { planId: plan.id, email: 'sara@example.com' } });
check('missing name → 400', r.status === 400, r);
r = await call('POST', '/servers/requests', {
  body: { planId: plan.id, name: 'Bot', email: 'bot@example.com', website: 'http://spam.example' },
});
check('honeypot filled → 400 (no storage touched)', r.status === 400, r);

console.log('— real submission returns the track token exactly once —');
r = await call('POST', '/servers/requests', {
  body: { planId: plan.id, name: 'Sara', email: 'sara@example.com', note: 'needs IPv6' },
});
check('submit → 201', r.status === 201, r);
const created = r.json;
check('track token minted (vnt_strk_…)', String(created?.trackToken || '').startsWith('vnt_strk_'), created?.trackToken);
check('status is pending', created?.status === 'pending', created?.status);
check('plan name echoed', created?.planName === 'VPS Starter', created?.planName);
check('trackPath points at the tracking page', String(created?.trackPath || '').startsWith('/embed/track.html?token='), created?.trackPath);

console.log('— public CORS on the embed surface —');
r = await call('GET', '/servers/plans', { headers: { origin: 'https://third-party.example' } });
check('GET catalog sends Access-Control-Allow-Origin: *', r.headers.get('access-control-allow-origin') === '*', r.headers.get('access-control-allow-origin'));
r = await call('POST', '/servers/requests', {
  headers: { origin: 'https://third-party.example', 'access-control-request-method': 'POST' },
});
check('preflight/POST carries ACAO: *', r.headers.get('access-control-allow-origin') === '*', r.headers.get('access-control-allow-origin'));

console.log('— track endpoint (bearer token, no account) —');
r = await call('GET', `/servers/requests/track/${created.trackToken}`);
check('track by token → 200', r.status === 200, r);
const tv = r.json?.request;
check('track view: status pending', tv?.status === 'pending', tv);
check('track view: no delivery before hand-off', tv?.delivery === null, tv?.delivery);
check('track view never leaks the requester email', !('requesterEmail' in (tv || {})), tv);
check('track view never leaks the token hash', !('trackTokenHash' in (tv || {})), tv);
r = await call('GET', '/servers/requests/track/vnt_strk_totally-wrong');
check('wrong token → 404', r.status === 404, r.status);

console.log('— admin queue + lifecycle —');
r = await call('GET', '/servers/requests', { token: adminTok });
check('admin list → 200 with the request', r.status === 200 && r.json?.requests?.length === 1, r.json);
const reqRow = r.json?.requests?.[0];
check('admin view includes the email', reqRow?.requesterEmail === 'sara@example.com', reqRow?.requesterEmail);
check('admin view strips the token hash', !('trackTokenHash' in (reqRow || {})), reqRow);
r = await call('GET', '/servers/requests?status=delivered', { token: adminTok });
check('status filter: delivered → 0', r.status === 200 && r.json?.requests?.length === 0, r.json);
r = await call('GET', '/servers/requests?status=pending', { token: adminTok });
check('status filter: pending → 1', r.status === 200 && r.json?.requests?.length === 1, r.json);
r = await call('GET', '/servers/requests?status=weird', { token: adminTok });
check('unknown status filter → 400', r.status === 400, r.status);

r = await call('PATCH', `/servers/requests/${reqRow.id}`, { token: adminTok, body: { status: 'delivered' } });
check('delivery without a host → 400', r.status === 400, r.status);
r = await call('PATCH', `/servers/requests/${reqRow.id}`, { token: adminTok, body: { status: 'bogus' } });
check('invalid status → 400', r.status === 400, r.status);

r = await call('PATCH', `/servers/requests/${reqRow.id}`, { token: adminTok, body: { status: 'approved' } });
check('approve → 200', r.status === 200 && r.json?.request?.status === 'approved', r.json);
r = await call('PATCH', `/servers/requests/${reqRow.id}`, {
  token: adminTok,
  body: { reviewNote: 'Rack slot reserved.', status: 'delivered', host: 'srv-1.example.net', sshUser: 'root', sshPort: 2222, credentialsNote: 'Key sent by email.' },
});
check('deliver with host + details → 200', r.status === 200 && r.json?.request?.status === 'delivered', r.json);

r = await call('GET', `/servers/requests/track/${created.trackToken}`);
const tv2 = r.json?.request;
check('track view: delivery now visible', tv2?.delivery?.host === 'srv-1.example.net' && tv2?.delivery?.sshPort === 2222, tv2?.delivery);
check('track view: review note readable', tv2?.reviewNote === 'Rack slot reserved.', tv2?.reviewNote);
check('track view: delivered keeps no email leak', !('requesterEmail' in (tv2 || {})), tv2);

r = await call('PATCH', `/servers/requests/${reqRow.id}`, {
  token: adminTok,
  body: { status: 'rejected', reviewNote: 'No stock in your region.' },
});
check('reject with reason → 200', r.status === 200 && r.json?.request?.status === 'rejected', r.json);
r = await call('GET', `/servers/requests/track/${created.trackToken}`);
check('track view: rejection reason readable', r.json?.request?.status === 'rejected' && r.json?.request?.reviewNote === 'No stock in your region.', r.json?.request);
check('rejected request never exposes delivery', r.json?.request?.delivery === null, r.json?.request?.delivery);

console.log('— embed static files are served —');
for (const file of ['/embed/server-orders.js', '/embed/sandbox-bridge.js', '/embed/sandbox-console.js', '/embed/track.html', '/embed/track.js']) {
  const f = await raw(file);
  check(`${file} → 200 with content`, f.status === 200 && f.text.length > 200, { status: f.status, len: f.text.length });
}
{
  const widget = await raw('/embed/server-orders.js');
  check('widget exposes VanitasServers API', widget.text.includes('VanitasServers'), null);
  check('widget has the honeypot field', widget.text.includes('website'), null);
  check('widget dispatches the CustomEvent', widget.text.includes('vanitas:server-request'), null);
}

console.log('— sandbox preview carries the console bridge + terminal —');
r = await call('POST', '/publish/snippets', {
  token: adminTok,
  body: { title: 'Sandbox Console Test', language: 'html', content: '<!doctype html><html><head><title>T</title></head><body><script>console.log("hi")</script></body></html>' },
});
check('create HTML snippet → 201', r.status === 201, r);
const snip = r.json?.snippet || r.json;
check('snippet id returned', typeof snip?.id === 'string' && snip.id.length > 0, snip);
{
  const pv = await raw(`/api/v1/publish/snippets/${snip.id}/preview`);
  check('preview → 200', pv.status === 200, pv.status);
  check('preview injects the external bridge', pv.text.includes('/embed/sandbox-bridge.js'), null);
  check('preview hosts the external terminal script', pv.text.includes('/embed/sandbox-console.js'), null);
  check('preview renders the terminal panel', pv.text.includes('SANDBOX TERMINAL'), null);
  check('preview keeps the opaque-origin sandbox (allow-scripts, no allow-same-origin)', /sandbox="allow-scripts"/.test(pv.text) && !pv.text.includes('allow-same-origin'), null);
  check('wrapper stays CSP-safe (no inline <script> in wrapper)', !/<script>(?!src)/i.test(pv.text.replace(/srcdoc="[\s\S]*?"/, '')), null);
  // The wrapper is strict, but the sandboxed document it embeds is the
  // user's, and a srcdoc frame inherits this response's policy. Without a
  // permissive one here, their HTML renders and their JS never runs.
  const csp = pv.headers.get('content-security-policy') || '';
  check("preview serves a permissive policy ('unsafe-inline' + 'unsafe-eval')", /'unsafe-inline'/.test(csp) && /'unsafe-eval'/.test(csp), csp);
  check("preview still cannot be embedded elsewhere (frame-ancestors 'none')", /frame-ancestors 'none'/.test(csp), csp);
}

console.log('— plan deletion leaves history intact —');
r = await call('DELETE', `/servers/plans/${plan.id}`, { token: adminTok });
check('delete plan → 200', r.status === 200, r);
r = await call('GET', '/servers/plans');
check('catalog empty again', r.json?.plans?.length === 0, r.json);
r = await call('GET', '/servers/requests/track/' + created.trackToken);
check('request keeps its plan-name snapshot after deletion', r.json?.request?.planName === 'VPS Starter', r.json?.request?.planName);

console.log('— account cleanup (suite leaves no users behind) —');
r = await call('DELETE', '/auth/account', { token: userTok });
check('plain user deletes own account', r.status === 200 && r.json?.success === true, r);
r = await call('DELETE', '/auth/account', { token: adminTok });
check('admin deletes own account', r.status === 200 && r.json?.success === true, r);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
