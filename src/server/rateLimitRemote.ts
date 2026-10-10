/**
 * Optional HTTP bridge to the Go rate-limit microservice
 * (`services/ratelimit`).
 *
 * The "servers" domain belongs to Go/TypeScript/Python/Java per the platform's
 * language map, and rate limiting is the part that genuinely benefits from a
 * separate process: every gateway instance behind a load balancer shares ONE
 * bucket instead of keeping its own in-process counters (which silently
 * multiplied the allowed budget by the number of instances).
 *
 * Every function returns `null` when the service is unconfigured, unreachable,
 * slower than the budget, or answers with an unexpected shape — the caller then
 * falls back to the native in-memory limiter in `security.ts`, so a dead Go
 * service can never take the gateway down.
 */

const TIMEOUT_MS = Number(process.env.RATELIMIT_SERVICE_TIMEOUT_MS || 300);

export interface RateDecision {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSecs: number;
}

export function getRateLimitServiceUrl(): string | null {
  const raw = (process.env.RATELIMIT_SERVICE_URL || '').trim().replace(/\/+$/, '');
  return raw ? raw : null;
}

function serviceHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = process.env.RATELIMIT_SERVICE_TOKEN;
  if (token) headers['X-Internal-Token'] = token;
  return headers;
}

/**
 * Ask Go whether this bucket may serve one more request.
 * `null` ⇒ caller must use the native limiter (never fail open AND never
 * fail closed: the native limiter applies the very same ceiling).
 */
export async function remoteRateCheck(
  key: string,
  windowMs: number,
  max: number,
): Promise<RateDecision | null> {
  const base = getRateLimitServiceUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/v1/rate/check`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ key, windowMs, max }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object' || typeof data.allowed !== 'boolean') return null;
    return {
      allowed: data.allowed,
      count: typeof data.count === 'number' ? data.count : 0,
      remaining: typeof data.remaining === 'number' ? data.remaining : 0,
      // The TS original sends `Math.ceil(windowMs / 1000)`; if Go ever omits
      // it, recompute rather than emit a header-less 429.
      retryAfterSecs:
        typeof data.retryAfterSecs === 'number'
          ? data.retryAfterSecs
          : Math.ceil(windowMs / 1000),
    };
  } catch {
    return null;
  }
}
