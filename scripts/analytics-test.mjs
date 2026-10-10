// Data-analysis endpoints: /api/v1/analytics/insights + /analytics/report.
//
//   local:  node scripts/analytics-test.mjs           (server on :3000)
//   run:    node scripts/run-tests.mjs --only analytics
//
// By default the gateway serves these from the native TypeScript analysis, so
// this suite stays offline. Export ANALYTICS_SERVICE_URL first (with the
// Python service running) to additionally assert the delegated path reports
// `python_remote:<url>` instead.
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000/api/v1';

let pass = 0;
let fail = 0;

async function call(method, path, { token, body, headers: extra } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
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
const email = `analytics_${Date.now()}@example.com`;
const r = await call('POST', '/auth/register', {
  body: { email, password: 'SuperSecret123!', name: 'Analytics Tester' },
});
check('register → 201', r.status === 201, r);
const token = r.json?.token;
check('session token issued', typeof token === 'string' && token.startsWith('vnt_sess_'), r.json);

// ---- auth gate -------------------------------------------------------------
console.log('— auth gate —');
const anon = await call('GET', '/analytics/insights?period=24h');
check('anonymous → 401', anon.status === 401, anon);

// ---- insights (native analysis on a fresh, empty store) --------------------
console.log('— insights —');
let res = await call('GET', '/analytics/insights?period=24h', { token });
check('insights → 200', res.status === 200, res);
const insight = res.json || {};
check('engine is declared', typeof insight.engine === 'string', insight.engine);
check('upstream is declared', typeof insight.upstream === 'string', insight.upstream);
check('24 hourly buckets', Array.isArray(insight.timeseries) && insight.timeseries.length === 24, insight.timeseries?.length);
check('volume.total is a number', typeof insight.volume?.total === 'number', insight.volume);
check('latency percentiles present', ['p50', 'p90', 'p95', 'p99'].every((k) => typeof insight.latency?.[k] === 'number'), insight.latency);
check('status classes present', !!insight.status?.byClass && typeof insight.status.byClass['2xx'] === 'number', insight.status);
check('SLO shares present', typeof insight.slo?.under500msPct === 'number', insight.slo);
check('empty store explains itself', String(insight.insights?.[0] || '').includes('لا توجد بيانات'), insight.insights);
check('generatedAt is ISO', !Number.isNaN(Date.parse(String(insight.generatedAt))), insight.generatedAt);

res = await call('GET', '/analytics/insights?period=7d', { token });
check('7d → daily buckets', res.json?.bucketUnit === 'day' && res.json?.timeseries?.length === 7, res.json?.bucketUnit);
check('7d → period echoed', res.json?.period === '7d', res.json?.period);

res = await call('GET', '/analytics/insights?period=NOT_A_PERIOD', { token });
check('unknown period falls back to 24h', res.json?.period === '24h', res.json?.period);

res = await call('GET', '/analytics/insights?period=30d', { token });
check('30d → 30 buckets', res.json?.timeseries?.length === 30, res.json?.timeseries?.length);

// ---- report ----------------------------------------------------------------
console.log('— report —');
res = await call('GET', '/analytics/report?period=24h', { token });
check('report → 200', res.status === 200, res);
const report = res.json || {};
check('markdown title in Arabic', String(report.markdown || '').startsWith('# تقرير تحليل البيانات'), String(report.markdown).slice(0, 40));
check('markdown has the SLO section', String(report.markdown || '').includes('## 🎯 اتفاقية مستوى الخدمة (SLO)'), report.markdown?.slice(0, 200));
check('markdown leaks no "undefined"', !String(report.markdown || '').includes('undefined'), report.markdown?.match(/.{0,20}undefined.{0,20}/));
check('timeseries CSV header', String(report.timeseriesCsv || '').startsWith('bucket,requests,errors,throttled,avg_ms,p95_ms'), report.timeseriesCsv?.split('\n')[0]);
check('endpoints CSV header', String(report.endpointsCsv || '').startsWith('path,requests,share_pct,error_rate_pct,p95_ms'), report.endpointsCsv?.split('\n')[0]);
check('CSV rows match the buckets', report.timeseriesCsv.trim().split('\n').length === 25, report.timeseriesCsv?.trim().split('\n').length);
check('analysis attached to the report', typeof report.analysis?.volume?.total === 'number', Object.keys(report));

// ---- delegated path (only when a Python service URL is exported) -----------
// Asserts BOTH outcomes of the contract: with a reachable service the gateway
// must report `python_remote`, and with a dead one it must silently fall back
// to the native analysis instead of failing the request.
if (process.env.ANALYTICS_SERVICE_URL) {
  console.log('— python delegation / fallback —');
  const serviceBase = String(process.env.ANALYTICS_SERVICE_URL).replace(/\/+$/, '');
  let reachable = false;
  try {
    const probe = await fetch(`${serviceBase}/health`, { signal: AbortSignal.timeout(1500) });
    reachable = probe.ok;
  } catch {
    reachable = false;
  }
  console.log(`  (service reachable: ${reachable})`);

  res = await call('GET', '/analytics/insights?period=24h', { token });
  check('insights still answers', res.status === 200, res);
  check('analysis still complete', typeof res.json?.volume?.total === 'number' && Array.isArray(res.json?.timeseries), res.json?.engine);

  res = await call('GET', '/analytics/report?period=24h', { token });
  check('report still answers', res.status === 200, res);
  check('markdown still in Arabic', String(res.json?.markdown || '').startsWith('# تقرير تحليل البيانات'), String(res.json?.markdown).slice(0, 40));

  if (reachable) {
    res = await call('GET', '/analytics/insights?period=24h', { token });
    check('upstream reports python_remote', String(res.json?.upstream || '').startsWith('python_remote:'), res.json?.upstream);
    check('python engine is declared', res.json?.engine === 'python', res.json?.engine);
    res = await call('GET', '/analytics/report?period=24h', { token });
    check('report comes from python too', String(res.json?.upstream || '').startsWith('python_remote:'), res.json?.upstream);
  } else {
    res = await call('GET', '/analytics/insights?period=24h', { token });
    check('dead service falls back to native', res.json?.upstream === 'typescript_native', res.json?.upstream);
    check('fallback engine is typescript', res.json?.engine === 'typescript', res.json?.engine);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
