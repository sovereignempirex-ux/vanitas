/**
 * One-off parity check: the Python analysis must produce the SAME numbers as
 * the native TypeScript fallback for the same usage window.
 *
 *   npx tsx scripts/_analytics-parity.ts   (needs services/analytics on :8200)
 */
import {
  nativeAnalyze,
  nativeReport,
  nativeTimeseriesCsv,
  nativeEndpointsCsv,
} from '../src/server/analyticsNative.ts';

const URL_ = (process.env.ANALYTICS_SERVICE_URL || 'http://127.0.0.1:8200').replace(/\/+$/, '');
const HOUR = 3_600_000;

let seed = 42;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const now = Date.now();
const PATHS = ['/api/v1/public/ping', '/api/v1/ai/chat', '/api/v1/downloads', '/api/v1/auth/login'];
const events = Array.from({ length: 400 }, () => {
  const roll = rnd();
  const status =
    roll < 0.78 ? 200 : roll < 0.86 ? 201 : roll < 0.92 ? 404 : roll < 0.95 ? 429 : roll < 0.98 ? 500 : 503;
  return {
    ts: now - Math.floor(rnd() * 46) * HOUR - Math.floor(rnd() * 3500) * 1000,
    keyId: rnd() < 0.5 ? 'key-a' : 'key-b',
    ownerId: 'u1',
    path: PATHS[Math.floor(rnd() * PATHS.length)]!,
    status,
    latencyMs: Math.round(rnd() * rnd() * 2500),
  };
});

const native = nativeAnalyze(events as never, '24h', now);

const response = await fetch(`${URL_}/v1/analytics/analyze`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ events, period: '24h', nowMs: now }),
  signal: AbortSignal.timeout(20_000),
});
if (!response.ok) {
  console.error(`service unreachable (${response.status})`);
  process.exit(2);
}
const python = (await response.json()) as Record<string, any>;

let diffs = 0;
const compare = (label: string, a: unknown, b: unknown, tolerance = 0.01) => {
  let ok: boolean;
  if (typeof a === 'number' && typeof b === 'number') ok = Math.abs(a - b) <= tolerance;
  else ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) {
    diffs++;
    console.log(`  DIFF ${label}: native=${JSON.stringify(a)} python=${JSON.stringify(b)}`);
  }
};

compare('volume.total', native.volume.total, python.volume.total, 0);
compare('volume.previous', native.volume.previous, python.volume.previous, 0);
compare('volume.deltaPct', native.volume.deltaPct, python.volume.deltaPct);
compare('volume.trend', native.volume.trend, python.volume.trend, 0);
compare('latency.p50', native.latency.p50, python.latency.p50);
compare('latency.p90', native.latency.p90, python.latency.p90);
compare('latency.p95', native.latency.p95, python.latency.p95);
compare('latency.p99', native.latency.p99, python.latency.p99);
compare('latency.mean', native.latency.mean, python.latency.mean);
compare('latency.max', native.latency.max, python.latency.max);
compare('latency.previousP95', native.latency.previousP95, python.latency.previousP95);
compare('status.byClass', native.status.byClass, python.status.byClass, 0);
compare('status.errors', native.status.errors, python.status.errors, 0);
compare('status.throttled', native.status.throttled, python.status.throttled, 0);
compare('status.errorRatePct', native.status.errorRatePct, python.status.errorRatePct);
compare('status.topFailingPaths', native.status.topFailingPaths, python.status.topFailingPaths);
compare('slo', native.slo, python.slo);
compare('endpoints', native.endpoints, python.endpoints);
compare('keys', native.keys, python.keys);
compare('insights', native.insights, python.insights, 0);
compare('anomaly kinds', native.anomalies.map((a) => a.kind), python.anomalies.map((a: any) => a.kind), 0);
compare('anomaly buckets', native.anomalies.map((a) => a.bucket), python.anomalies.map((a: any) => a.bucket), 0);

const nativeSeries = native.timeseries.map((p) => [p.label, p.count, p.errorCount, p.throttledCount, p.p95, p.avg]);
const pythonSeries = python.timeseries.map((p: any) => [p.label, p.count, p.errorCount, p.throttledCount, p.p95, p.avg]);
compare('timeseries', nativeSeries, pythonSeries);

// The report is rendered verbatim by the dashboard, so it must agree too.
const reportResponse = await fetch(`${URL_}/v1/analytics/report`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ events, period: '24h', nowMs: now }),
  signal: AbortSignal.timeout(20_000),
});
const pyReport = (await reportResponse.json()) as Record<string, any>;
compare('report.timeseriesCsv', nativeTimeseriesCsv(native), pyReport.timeseriesCsv, 0);
compare('report.endpointsCsv', nativeEndpointsCsv(native), pyReport.endpointsCsv, 0);
// Only the engine label may differ — it names which side produced the report.
const normalize = (markdown: string) => markdown.replace(/· المحرك: \w+/, '· المحرك: ENGINE');
compare('report.markdown', normalize(nativeReport(native)), normalize(pyReport.markdown), 0);

console.log(
  diffs
    ? `\n${diffs} difference(s) between engines`
    : `\nPARITY OK — native TS and Python agree on ${events.length} events (window ${python.generatedAt})`,
);
process.exit(diffs ? 1 : 0);
