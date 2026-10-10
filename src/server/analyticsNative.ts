/**
 * Native TypeScript analysis used when the Python analytics service is not
 * configured or unreachable — the fallback that keeps `/api/v1/analytics/*`
 * answering at all times.
 *
 * It mirrors `services/analytics/app/metrics.py` and `report.py` exactly:
 * same percentile convention (nearest rank), same UTC bucketing, same status
 * split (429 is throttling, not an error), same anomaly threshold (|z| ≥ 2.5)
 * and the same Arabic summary lines. Keep the two implementations in sync.
 */
import type { ApiKeyUsageEvent } from './db.ts';

export type UsageEvent = ApiKeyUsageEvent;
export type AnalyticsPeriod = '24h' | '7d' | '30d';
export type BucketUnit = 'hour' | 'day';

export const ANALYTICS_PERIODS: AnalyticsPeriod[] = ['24h', '7d', '30d'];

const PERIODS: Record<AnalyticsPeriod, { unit: BucketUnit; count: number }> = {
  '24h': { unit: 'hour', count: 24 },
  '7d': { unit: 'day', count: 7 },
  '30d': { unit: 'day', count: 30 },
};

const THROTTLED = 429;
const INSIGHT_Z = 2.5;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  '24h': 'آخر 24 ساعة',
  '7d': 'آخر 7 أيام',
  '30d': 'آخر 30 يوم',
};

interface Bucket {
  label: string;
  count: number;
  errors: number;
  throttled: number;
  latencies: number[];
}

interface Grouped {
  key: string;
  count: number;
  errors: number;
  latencies: number[];
}

export interface AnalyticsInsight {
  label: string;
  count: number;
  errorCount: number;
  throttledCount: number;
  p95: number;
  avg: number;
}

export interface AnalyticsAnalysis {
  engine: 'typescript';
  period: AnalyticsPeriod;
  bucketUnit: BucketUnit;
  generatedAt: string;
  window: { from: number; to: number; previousFrom: number };
  volume: {
    total: number;
    previous: number | null;
    deltaPct: number | null;
    trend: 'up' | 'down' | 'flat' | 'unknown';
    peakBucket: AnalyticsInsight | null;
  };
  latency: Record<string, number | null>;
  status: {
    total: number;
    byClass: Record<'2xx' | '3xx' | '4xx' | '5xx', number>;
    errors: number;
    throttled: number;
    errorRatePct: number;
    previousErrorRatePct: number | null;
    errorRateDeltaPct: number | null;
    topFailingPaths: Array<Record<string, unknown>>;
  };
  endpoints: Array<Record<string, unknown>>;
  keys: Array<Record<string, unknown>>;
  slo: Record<string, number>;
  timeseries: AnalyticsInsight[];
  anomalies: Array<Record<string, unknown>>;
  insights: string[];
}

/** Nearest-rank percentile (`index = ceil(p * n) - 1`, clamped). */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(p * ordered.length) - 1));
  return ordered[index]!;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bucketLabel(ts: number, unit: BucketUnit): string {
  const iso = new Date(ts).toISOString();
  return unit === 'hour' ? iso.slice(0, 13) : iso.slice(0, 10);
}

function windowStart(nowMs: number, unit: BucketUnit, count: number): number {
  const date = new Date(nowMs);
  const floored =
    unit === 'hour'
      ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours())
      : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const step = unit === 'hour' ? HOUR_MS : DAY_MS;
  return floored - step * (count - 1);
}

function labelsFor(startMs: number, unit: BucketUnit, count: number): string[] {
  const step = unit === 'hour' ? HOUR_MS : DAY_MS;
  return Array.from({ length: count }, (_, index) => bucketLabel(startMs + index * step, unit));
}

function delta(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return round(((current - previous) / previous) * 100, 1);
}

function statusClass(status: number): '2xx' | '3xx' | '4xx' | '5xx' {
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  return '2xx';
}

function isError(status: number): boolean {
  return status >= 400 && status !== THROTTLED;
}

function zscores(values: number[]): number[] {
  if (values.length < 2) return values.map(() => 0);
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
  const stdev = Math.sqrt(variance);
  if (!stdev) return values.map(() => 0);
  return values.map((value) => (value - average) / stdev);
}

function trendOf(value: number | null): 'up' | 'down' | 'flat' | 'unknown' {
  if (value === null) return 'unknown';
  if (value > 5) return 'up';
  if (value < -5) return 'down';
  return 'flat';
}

function share(values: number[], ceiling: number): number {
  if (!values.length) return 0;
  return round((values.filter((value) => value <= ceiling).length / values.length) * 100, 1);
}

function rank(groups: Grouped[], kind: 'path' | 'key', limit = 8): Array<Record<string, unknown>> {
  const total = groups.reduce((sum, group) => sum + group.count, 0) || 1;
  const ranked = groups.map((group) => ({
    // A path row has no key id and a key row has no path — the Python engine
    // emits the absent field as `null`, so the fallback must too.
    path: kind === 'path' ? group.key : null,
    keyId: kind === 'key' ? group.key : null,
    count: group.count,
    errorRatePct: round((group.errors / group.count) * 100, 2),
    p95: round(percentile(group.latencies, 0.95), 1),
    sharePct: round((group.count / total) * 100, 1),
  }));
  ranked.sort((a, b) => (b.count as number) - (a.count as number));
  return ranked.slice(0, limit);
}

function topFailing(groups: Grouped[], limit = 5): Array<Record<string, unknown>> {
  const failing = groups
    .filter((group) => group.errors > 0)
    .map((group) => ({
      path: group.key,
      errors: group.errors,
      count: group.count,
      errorRatePct: round((group.errors / group.count) * 100, 2),
    }));
  failing.sort((a, b) => {
    if ((b.errorRatePct as number) !== (a.errorRatePct as number)) {
      return (b.errorRatePct as number) - (a.errorRatePct as number);
    }
    return (b.errors as number) - (a.errors as number);
  });
  return failing.slice(0, limit);
}

function buildInsights(input: {
  total: number;
  volumeDelta: number | null;
  errorRate: number;
  previousErrorRate: number | null;
  p95: number;
  previousP95: number | null;
  anomalies: Array<Record<string, unknown>>;
  throttled: number;
}): string[] {
  const lines: string[] = [];
  if (input.total === 0) return ['لا توجد بيانات استخدام في هذه الفترة.'];

  if (input.volumeDelta === null) {
    lines.push(`تم تسجيل ${input.total} طلب في الفترة الحالية.`);
  } else {
    const direction =
      input.volumeDelta > 0 ? 'ارتفع' : input.volumeDelta < 0 ? 'انخفض' : 'ثبّت';
    lines.push(
      `${direction} حجم الطلبات ${Math.abs(input.volumeDelta)}% (${input.total} طلب مقابل فترة سابقة).`,
    );
  }

  if (input.previousErrorRate === null) {
    lines.push(`معدل الأخطاء الحالي ${input.errorRate}%.`);
  } else {
    const diff = round(input.errorRate - input.previousErrorRate, 2);
    if (diff > 0) lines.push(`معدل الأخطاء ارتفع ${diff}% مقارنة بالفترة السابقة.`);
    else if (diff < 0) lines.push(`معدل الأخطاء انخفض ${Math.abs(diff)}% مقارنة بالفترة السابقة.`);
    else lines.push(`معدل الأخطاء ثابت عند ${input.errorRate}%.`);
  }

  if (input.previousP95) {
    const diffPct = delta(input.p95, input.previousP95);
    if (diffPct !== null && Math.abs(diffPct) >= 5) {
      const verb = diffPct < 0 ? 'تحسّن' : 'تدهور';
      lines.push(`زمن الاستجابة p95 ${verb} ${Math.abs(diffPct)}% (الآن ${input.p95}ms).`);
    } else {
      lines.push(`زمن الاستجابة p95 مستقر عند ${input.p95}ms.`);
    }
  } else {
    lines.push(`زمن الاستجابة p95 = ${input.p95}ms.`);
  }

  if (input.throttled) lines.push(`${input.throttled} طلب تم تقييدها بـ 429 (Rate Limit).`);
  for (const anomaly of input.anomalies.slice(0, 3)) {
    lines.push(`⚠️ شذوذ: ${anomaly.kind} — ${anomaly.detail}`);
  }
  return lines;
}

/** Full analysis of the window, falling back here when Python is unavailable. */
export function nativeAnalyze(
  events: UsageEvent[],
  period: AnalyticsPeriod = '24h',
  nowMs: number = Date.now(),
): AnalyticsAnalysis {
  const { unit, count } = PERIODS[period] ?? PERIODS['24h'];
  const now = nowMs;
  const startMs = windowStart(now, unit, count);
  const previousStart = startMs - (now - startMs);
  const labels = labelsFor(startMs, unit, count);
  const buckets = new Map<string, Bucket>(
    labels.map((label) => [label, { label, count: 0, errors: 0, throttled: 0, latencies: [] }]),
  );

  const current: UsageEvent[] = [];
  const previous: UsageEvent[] = [];
  for (const event of events) {
    if (typeof event?.ts !== 'number') continue;
    if (event.ts >= startMs) current.push(event);
    else if (event.ts >= previousStart) previous.push(event);
  }

  const byPath = new Map<string, Grouped>();
  const byKey = new Map<string, Grouped>();
  const latencies: number[] = [];
  const byClass = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 } as AnalyticsAnalysis['status']['byClass'];
  let errors = 0;
  let throttled = 0;

  const group = (map: Map<string, Grouped>, key: string): Grouped => {
    const existing = map.get(key);
    if (existing) return existing;
    const created: Grouped = { key, count: 0, errors: 0, latencies: [] };
    map.set(key, created);
    return created;
  };

  for (const event of current) {
    const label = bucketLabel(event.ts, unit);
    const bucket = buckets.get(label) ?? buckets.get(labels[labels.length - 1]!);
    if (bucket) {
      bucket.count += 1;
      bucket.latencies.push(event.latencyMs);
      if (event.status === THROTTLED) {
        bucket.throttled += 1;
        throttled += 1;
      } else if (isError(event.status)) {
        bucket.errors += 1;
        errors += 1;
      }
    }
    byClass[statusClass(event.status)] += 1;
    latencies.push(event.latencyMs);

    const pathGroup = group(byPath, event.path || '/');
    pathGroup.count += 1;
    pathGroup.latencies.push(event.latencyMs);
    if (isError(event.status) || event.status === THROTTLED) pathGroup.errors += 1;

    const keyGroup = group(byKey, event.keyId || 'unknown');
    keyGroup.count += 1;
    keyGroup.latencies.push(event.latencyMs);
    if (isError(event.status) || event.status === THROTTLED) keyGroup.errors += 1;
  }

  const timeseries: AnalyticsInsight[] = labels.map((label) => {
    const bucket = buckets.get(label)!;
    return {
      label,
      count: bucket.count,
      errorCount: bucket.errors,
      throttledCount: bucket.throttled,
      p95: round(percentile(bucket.latencies, 0.95), 1),
      avg: bucket.latencies.length ? round(mean(bucket.latencies), 1) : 0,
    };
  });

  const previousLatencies = previous.map((event) => event.latencyMs);
  const total = current.length;
  const previousTotal = previous.length;
  const errorRate = total ? round((errors / total) * 100, 2) : 0;
  const previousErrors = previous.filter((event) => isError(event.status)).length;
  const previousErrorRate = previousTotal ? round((previousErrors / previousTotal) * 100, 2) : null;

  const volumeZ = zscores(timeseries.map((point) => point.count));
  const errorZ = zscores(timeseries.map((point) => point.errorCount));
  const p95Z = zscores(timeseries.map((point) => point.p95));
  const anomalies: Array<Record<string, unknown>> = [];
  timeseries.forEach((point, index) => {
    const zVolume = volumeZ[index] ?? 0;
    const zError = errorZ[index] ?? 0;
    const zP95 = p95Z[index] ?? 0;
    if (Math.abs(zVolume) >= INSIGHT_Z && point.count > 0) {
      anomalies.push({
        kind: zVolume > 0 ? 'volume_spike' : 'volume_drop',
        bucket: point.label,
        zscore: round(zVolume),
        detail: `${point.count} طلب في ${point.label}`,
      });
    }
    if (Math.abs(zError) >= INSIGHT_Z && point.errorCount > 0) {
      anomalies.push({
        kind: 'error_spike',
        bucket: point.label,
        zscore: round(zError),
        detail: `${point.errorCount} خطأ في ${point.label}`,
      });
    }
    if (Math.abs(zP95) >= INSIGHT_Z && point.p95 > 0) {
      anomalies.push({
        kind: 'latency_spike',
        bucket: point.label,
        zscore: round(zP95),
        detail: `p95 = ${point.p95}ms في ${point.label}`,
      });
    }
  });

  const volumeDelta = previousTotal ? delta(total, previousTotal) : null;
  const p95 = percentile(latencies, 0.95);
  const previousP95 = previousLatencies.length ? percentile(previousLatencies, 0.95) : null;

  return {
    engine: 'typescript',
    period,
    bucketUnit: unit,
    generatedAt: new Date(now).toISOString(),
    window: { from: startMs, to: now, previousFrom: previousStart },
    volume: {
      total,
      previous: previousTotal ? previousTotal : null,
      deltaPct: volumeDelta,
      trend: trendOf(volumeDelta),
      peakBucket: timeseries.length
        ? timeseries.reduce((best, point) => (point.count > best.count ? point : best))
        : null,
    },
    latency: {
      p50: round(percentile(latencies, 0.5), 1),
      p90: round(percentile(latencies, 0.9), 1),
      p95: round(p95, 1),
      p99: round(percentile(latencies, 0.99), 1),
      previousP95: previousP95 === null ? null : round(previousP95, 1),
      p95DeltaPct: previousP95 ? delta(p95, previousP95) : null,
      mean: latencies.length ? round(mean(latencies), 1) : 0,
      max: latencies.length ? round(Math.max(...latencies), 1) : 0,
    },
    status: {
      total,
      byClass,
      errors,
      throttled,
      errorRatePct: errorRate,
      previousErrorRatePct: previousErrorRate,
      errorRateDeltaPct: previousErrorRate === null ? null : delta(errorRate, previousErrorRate),
      topFailingPaths: topFailing([...byPath.values()]),
    },
    endpoints: rank([...byPath.values()], 'path'),
    keys: rank([...byKey.values()], 'key'),
    slo: {
      under100msPct: share(latencies, 100),
      under500msPct: share(latencies, 500),
      under1sPct: share(latencies, 1000),
    },
    timeseries,
    anomalies,
    insights: buildInsights({
      total,
      volumeDelta,
      errorRate,
      previousErrorRate,
      p95,
      previousP95,
      anomalies,
      throttled,
    }),
  };
}

// --- Report building (mirrors services/analytics/app/report.py) -------------

function fmt(value: unknown, suffix = ''): string {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'number') return `${String(value)}${suffix}`;
  const text = Number.isInteger(value)
    ? value.toLocaleString('en-US')
    : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${text}${suffix}`;
}

function csvCellLite(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCellLite).join(',');
}

/** Arabic Markdown report — byte-for-byte the sections Python emits. */
export function nativeReport(analysis: AnalyticsAnalysis): string {
  const lines: string[] = [];
  lines.push(`# تقرير تحليل البيانات — ${PERIOD_LABELS[analysis.period] ?? analysis.period}`);
  lines.push('');
  lines.push(`*تم التوليد في ${analysis.generatedAt} · المحرك: ${analysis.engine}*`);
  lines.push('');

  lines.push('## 🔢 ملخص الحجم');
  lines.push('');
  lines.push('| المؤشر | القيمة |');
  lines.push('| --- | --- |');
  lines.push(`| إجمالي الطلبات | ${fmt(analysis.volume.total)} |`);
  lines.push(`| الفترة السابقة | ${fmt(analysis.volume.previous)} |`);
  lines.push(
    `| التغير | ${analysis.volume.deltaPct !== null ? fmt(analysis.volume.deltaPct, '%') : '—'} |`,
  );
  const peak = analysis.volume.peakBucket;
  lines.push(
    `| أعلى فترة | ${peak ? `${fmt(peak.count)} طلب (${peak.label})` : '—'} |`,
  );
  lines.push('');

  lines.push('## ⏱️ زمن الاستجابة (ms)');
  lines.push('');
  lines.push('| p50 | p90 | p95 | p99 | المتوسط | الأقصى |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  lines.push(
    `| ${fmt(analysis.latency.p50)} | ${fmt(analysis.latency.p90)} | ${fmt(analysis.latency.p95)} | ` +
      `${fmt(analysis.latency.p99)} | ${fmt(analysis.latency.mean)} | ${fmt(analysis.latency.max)} |`,
  );
  lines.push('');

  lines.push('## 🩺 الحالة والأخطاء');
  lines.push('');
  const byClass = analysis.status.byClass;
  lines.push('| 2xx | 3xx | 4xx | 5xx | حُصّر (429) | معدل الخطأ |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  lines.push(
    `| ${fmt(byClass['2xx'])} | ${fmt(byClass['3xx'])} | ${fmt(byClass['4xx'])} | ` +
      `${fmt(byClass['5xx'])} | ${fmt(analysis.status.throttled)} | ${fmt(analysis.status.errorRatePct, '%')} |`,
  );
  lines.push('');

  const failing = analysis.status.topFailingPaths;
  if (failing.length) {
    lines.push('### أكثر المسارات خطأً');
    lines.push('');
    lines.push('| المسار | الأخطاء | الطلبات | نسبة الخطأ |');
    lines.push('| --- | --- | --- | --- |');
    for (const item of failing) {
      lines.push(
        `| \`${String(item.path)}\` | ${fmt(item.errors)} | ${fmt(item.count)} | ${fmt(item.errorRatePct, '%')} |`,
      );
    }
    lines.push('');
  }

  lines.push('## 🎯 اتفاقية مستوى الخدمة (SLO)');
  lines.push('');
  lines.push(`- تحت 100ms: **${fmt(analysis.slo.under100msPct, '%')}**`);
  lines.push(`- تحت 500ms: **${fmt(analysis.slo.under500msPct, '%')}**`);
  lines.push(`- تحت 1s: **${fmt(analysis.slo.under1sPct, '%')}**`);
  lines.push('');

  if (analysis.endpoints.length) {
    lines.push('## 🛤️ أكثر المسارات استخدامًا');
    lines.push('');
    lines.push('| المسار | الطلبات | الحصة | p95 | نسبة الخطأ |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const item of analysis.endpoints.slice(0, 8)) {
      lines.push(
        `| \`${String(item.path ?? item.keyId)}\` | ${fmt(item.count)} | ${fmt(item.sharePct, '%')} | ` +
          `${fmt(item.p95)} | ${fmt(item.errorRatePct, '%')} |`,
      );
    }
    lines.push('');
  }

  if (analysis.anomalies.length) {
    lines.push('## ⚠️ الشذوذات المكتشفة');
    lines.push('');
    for (const anomaly of analysis.anomalies) {
      lines.push(
        `- \`${String(anomaly.kind)}\` في ${String(anomaly.bucket)} ` +
          `(z = ${String(anomaly.zscore)}) — ${String(anomaly.detail)}`,
      );
    }
    lines.push('');
  }

  if (analysis.insights.length) {
    lines.push('## 📌 خلاصة');
    lines.push('');
    for (const line of analysis.insights) lines.push(`- ${line}`);
    lines.push('');
  }

  return `${lines.join('\n').replace(/\s+$/, '')}\n`;
}

export function nativeTimeseriesCsv(analysis: AnalyticsAnalysis): string {
  const rows = ['bucket,requests,errors,throttled,avg_ms,p95_ms'];
  for (const point of analysis.timeseries) {
    rows.push(
      csvRow([point.label, point.count, point.errorCount, point.throttledCount, point.avg, point.p95]),
    );
  }
  return `${rows.join('\n')}\n`;
}

export function nativeEndpointsCsv(analysis: AnalyticsAnalysis): string {
  const rows = ['path,requests,share_pct,error_rate_pct,p95_ms'];
  for (const item of analysis.endpoints) {
    rows.push(
      csvRow([item.path, item.count, item.sharePct, item.errorRatePct, item.p95]),
    );
  }
  return `${rows.join('\n')}\n`;
}
