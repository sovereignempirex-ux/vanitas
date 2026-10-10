// Per-IP / per-path ceilings: enforced by the Go service when
// RATELIMIT_SERVICE_URL is reachable, by the native in-memory limiter
// otherwise — the observable contract must be identical either way.
//
//   local:  node scripts/rate-limit-test.mjs
//   run:    node scripts/run-tests.mjs --only rate-limit
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000/api/v1';
const RATE_BASE = String(process.env.RATELIMIT_SERVICE_URL || '').replace(/\/+$/, '');

let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} → ${JSON.stringify(detail)}`);
  }
}

async function call(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json body */
  }
  return { status: res.status, json, headers: res.headers };
}

// ---- wait for server -------------------------------------------------------
let up = false;
for (let i = 0; i < 20; i++) {
  try {
    const r = await call('/health');
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

// ---- which engine is answering? -------------------------------------------
let goReachable = false;
if (RATE_BASE) {
  try {
    const probe = await fetch(`${RATE_BASE}/health`, { signal: AbortSignal.timeout(1500) });
    goReachable = probe.ok;
  } catch {
    goReachable = false;
  }
}
console.log(`— engine: ${RATE_BASE ? (goReachable ? 'go (shared bucket)' : 'native fallback (go unreachable)') : 'native (RATELIMIT_SERVICE_URL unset)'} —`);

// The Go bucket is shared by design — and unlike the gateway (which the runner
// restarts per suite, so native buckets always start empty) it outlives them.
// Earlier suites in this run have already spent budget in it, so clear it first;
// that also zeroes the counters the /ready assertions below rely on.
if (RATE_BASE && goReachable) {
  try {
    const res = await fetch(`${RATE_BASE}/v1/rate/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ all: true }),
      signal: AbortSignal.timeout(2000),
    });
    const body = await res.json();
    check('shared bucket cleared before the probe', res.ok, { status: res.status, body });
    check('reset reports how many buckets it dropped', typeof body.cleared === 'number', body);
  } catch (err) {
    check('go /v1/rate/reset is reachable', false, String(err));
  }
}

// ---- the contract: 30 allowed, the 31st throttled --------------------------
// /api/v1/comments/ carries a per-IP ceiling of 30/min (perIpOnly), so it
// exercises exactly the bucket shape the Go service shares.
const statuses = [];
for (let i = 1; i <= 30; i++) {
  try {
    statuses.push((await call(`/comments/ratelimit_probe_${i}`)).status);
  } catch (err) {
    statuses.push(`threw:${String(err)}`);
  }
}
check('first 30 requests are never throttled', statuses.every((s) => s !== 429), statuses);
check('requests actually reach a handler', statuses.every((s) => typeof s === 'number' && s < 500), statuses);

const throttled = await call('/comments/ratelimit_probe_31');
check('31st request is throttled', throttled.status === 429, throttled.status);
check('Retry-After advertises the 60s window', throttled.headers.get('retry-after') === '60', throttled.headers.get('retry-after'));
check(
  'throttle body matches the platform message',
  throttled.json?.error === 'Too many requests. Slow down and retry.',
  throttled.json,
);

const stillThrottled = await call('/comments/ratelimit_probe_32');
check('the ceiling holds for the rest of the window', stillThrottled.status === 429, stillThrottled.status);

// ---- other buckets are unaffected -----------------------------------------
const other = await call('/search?q=anything');
check('a different limiter still has budget', other.status !== 429, other.status);

// ---- the Go service's own bookkeeping -------------------------------------
if (RATE_BASE) {
  if (goReachable) {
    try {
      const ready = await (await fetch(`${RATE_BASE}/ready`, { signal: AbortSignal.timeout(2000) })).json();
      check('go counted the allowed hits', typeof ready.allowed === 'number' && ready.allowed >= 30, ready);
      check('go recorded at least one denial', typeof ready.denied === 'number' && ready.denied >= 1, ready);
      check('go reports the sliding-window engine', ready.engine === 'sliding_window', ready.engine);
      check('go bucket map is bounded', typeof ready.keys === 'number' && ready.keys <= ready.maxKeys, ready);
    } catch (err) {
      check('go /ready is readable', false, String(err));
    }
  } else {
    console.log('  NOTE  Go service unreachable — the native limiter enforced every ceiling above.');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
