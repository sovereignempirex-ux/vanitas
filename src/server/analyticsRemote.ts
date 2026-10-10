/**
 * Optional HTTP bridge to the Python analytics microservice
 * (`services/analytics`).
 *
 * Data analysis belongs to Python/R per the platform's language map, so when
 * `ANALYTICS_SERVICE_URL` is configured every analysis is delegated there
 * first. Each function returns `null` when the service is unconfigured,
 * unreachable, slower than the budget, or answers with an unexpected shape —
 * the caller then falls back to the native TypeScript analysis, so a dead
 * Python service can never blank the dashboard.
 */
import type { UsageEvent, AnalyticsPeriod } from './analyticsNative.ts';

const TIMEOUT_MS = Number(process.env.ANALYTICS_SERVICE_TIMEOUT_MS || 10_000);

export function getAnalyticsServiceUrl(): string | null {
  const raw = (process.env.ANALYTICS_SERVICE_URL || '').trim().replace(/\/+$/, '');
  return raw ? raw : null;
}

function serviceHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = process.env.ANALYTICS_SERVICE_TOKEN;
  if (token) headers['X-Internal-Token'] = token;
  return headers;
}

/** Shape guard: an analysis is only usable if its core sections are present. */
function isAnalysis(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const volume = candidate.volume as Record<string, unknown> | undefined;
  const timeseries = candidate.timeseries;
  return (
    !!volume &&
    typeof volume === 'object' &&
    typeof volume.total === 'number' &&
    Array.isArray(timeseries)
  );
}

/**
 * POST the usage window to Python. `null` ⇒ caller uses the native analysis.
 */
export async function remoteAnalyze(
  events: UsageEvent[],
  period: AnalyticsPeriod,
  nowMs?: number,
): Promise<Record<string, unknown> | null> {
  const base = getAnalyticsServiceUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/v1/analytics/analyze`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ events, period, nowMs: nowMs ?? null }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as unknown;
    return isAnalysis(data) ? data : null;
  } catch {
    return null;
  }
}

export interface AnalyticsReport {
  markdown: string;
  timeseriesCsv: string;
  endpointsCsv: string;
  analysis: Record<string, unknown>;
}

function isReport(value: unknown): value is AnalyticsReport {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.markdown === 'string' &&
    typeof candidate.timeseriesCsv === 'string' &&
    typeof candidate.endpointsCsv === 'string' &&
    isAnalysis(candidate.analysis)
  );
}

/** Markdown + CSV exports from Python, or `null` for the native builder. */
export async function remoteReport(
  events: UsageEvent[],
  period: AnalyticsPeriod,
  nowMs?: number,
): Promise<AnalyticsReport | null> {
  const base = getAnalyticsServiceUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/v1/analytics/report`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ events, period, nowMs: nowMs ?? null }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as unknown;
    return isReport(data) ? data : null;
  } catch {
    return null;
  }
}
