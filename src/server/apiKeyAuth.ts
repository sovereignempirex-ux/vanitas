// ---------------------------------------------------------------------------
// External API-key authentication, scope enforcement and per-key rate limiting
// for the public surface (/api/v1/public/*).
//
// Contract for clients:
//   x-api-key: sk_live_vanitas_...               (or)
//   Authorization: Bearer sk_live_vanitas_...
//
// Only sha256(secret) is stored on the ApiKey object — as a NON-ENUMERABLE
// property — so JSON.stringify / spread can never leak it. The raw secret
// exists exactly once: in the create/rotate response. Seeded demo keys carry
// no hash at all and therefore can never authenticate (display-only).
//
// Per-key policy honours the key's configured algorithm
// (sliding_window | fixed_window | token_bucket) and action on exceed
// (reject_429 | throttle_delay | alert_only).
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, hashApiKeySecret } from './db.ts';
import type { ApiKey, PermissionScope } from '../types.ts';

const MAX_KEY_LENGTH = 300;
const WINDOW_MS = 60_000;
const MAX_THROTTLE_SLEEP_MS = 2000;
const ALERT_THROTTLE_MS = 60_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Per-key rate-limit state (process-local, in-memory — matches the rest of db.ts)
// ---------------------------------------------------------------------------
interface KeyRateState {
  /** sliding_window: request timestamps inside the rolling 60s window */
  hits: number[];
  /** fixed_window: start of the current minute + requests inside it */
  windowStart: number;
  windowCount: number;
  /** token_bucket: available tokens + last refill timestamp */
  tokens: number;
  lastRefill: number;
}

const rateStates = new Map<string, KeyRateState>();
const lastAlerts = new Map<string, number>();

function stateFor(key: ApiKey): KeyRateState {
  let state = rateStates.get(key.id);
  if (!state) {
    state = { hits: [], windowStart: 0, windowCount: 0, tokens: 0, lastRefill: 0 };
    rateStates.set(key.id, state);
  }
  return state;
}

interface RateDecision {
  allowed: boolean;
  limit: number;
  /** requests counted in the current window (used for the RPM gauge) */
  windowCount: number;
  remaining: number;
  /** unix seconds when a slot/bucket becomes available again */
  resetAtSec: number;
  retryAfterMs: number;
}

function bucketCapacity(key: ApiKey): number {
  const configured = Number(key.burstLimit) || 0;
  if (configured > 0) return configured;
  return Math.max(1, Math.round((key.rateLimitPerMin || 600) * 0.05));
}

/** Peek at the window WITHOUT consuming a slot (safe to call for headers). */
function peekRateLimit(key: ApiKey, now: number): RateDecision {
  const limit = Math.max(1, key.rateLimitPerMin || 600);
  const algorithm = key.rateLimitAlgorithm || 'sliding_window';
  const state = stateFor(key);

  if (algorithm === 'token_bucket') {
    const capacity = bucketCapacity(key);
    const refillPerMs = limit / WINDOW_MS;
    if (state.lastRefill === 0) {
      state.tokens = capacity;
      state.lastRefill = now;
    }
    const elapsed = now - state.lastRefill;
    if (elapsed > 0) {
      state.tokens = Math.min(capacity, state.tokens + elapsed * refillPerMs);
      state.lastRefill = now;
    }
    const allowed = state.tokens >= 1;
    const resetAtSec = Math.ceil((now + (capacity - state.tokens) / refillPerMs) / 1000);
    return {
      allowed,
      limit,
      windowCount: Math.round(capacity - state.tokens),
      remaining: Math.max(0, Math.floor(state.tokens)),
      resetAtSec,
      retryAfterMs: allowed ? 0 : Math.ceil((1 - state.tokens) / refillPerMs),
    };
  }

  if (algorithm === 'fixed_window') {
    const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
    if (state.windowStart !== windowStart) {
      state.windowStart = windowStart;
      state.windowCount = 0;
    }
    const allowed = state.windowCount < limit;
    const resetAtMs = windowStart + WINDOW_MS;
    return {
      allowed,
      limit,
      windowCount: state.windowCount,
      remaining: Math.max(0, limit - state.windowCount),
      resetAtSec: Math.ceil(resetAtMs / 1000),
      retryAfterMs: allowed ? 0 : resetAtMs - now,
    };
  }

  // sliding_window (default)
  state.hits = state.hits.filter((t) => now - t < WINDOW_MS);
  const allowed = state.hits.length < limit;
  const resetAtMs = (state.hits[0] ?? now) + WINDOW_MS;
  return {
    allowed,
    limit,
    windowCount: state.hits.length,
    remaining: Math.max(0, limit - state.hits.length),
    resetAtSec: Math.ceil(resetAtMs / 1000),
    retryAfterMs: allowed ? 0 : resetAtMs - now,
  };
}

/** Record a served request against the key's window. */
function recordRateLimit(key: ApiKey, now: number): void {
  const algorithm = key.rateLimitAlgorithm || 'sliding_window';
  const state = stateFor(key);

  if (algorithm === 'fixed_window') {
    const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
    if (state.windowStart !== windowStart) {
      state.windowStart = windowStart;
      state.windowCount = 0;
    }
    state.windowCount += 1;
    return;
  }

  if (algorithm === 'token_bucket') {
    const capacity = bucketCapacity(key);
    const refillPerMs = Math.max(1, key.rateLimitPerMin || 600) / WINDOW_MS;
    if (state.lastRefill === 0) {
      state.tokens = capacity;
      state.lastRefill = now;
    }
    const elapsed = now - state.lastRefill;
    if (elapsed > 0) {
      state.tokens = Math.min(capacity, state.tokens + elapsed * refillPerMs);
      state.lastRefill = now;
    }
    state.tokens = Math.max(0, state.tokens - 1);
    return;
  }

  // sliding_window
  state.hits = state.hits.filter((t) => now - t < WINDOW_MS);
  state.hits.push(now);
}

function setRateHeaders(res: Response, decision: RateDecision): void {
  res.setHeader('X-RateLimit-Limit', String(decision.limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, decision.remaining)));
  res.setHeader('X-RateLimit-Reset', String(decision.resetAtSec));
}

// ---------------------------------------------------------------------------
// Quota period helpers
// ---------------------------------------------------------------------------
function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

export function nextQuotaReset(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

// ---------------------------------------------------------------------------
// Key extraction + lookup
// ---------------------------------------------------------------------------
export function extractApiKey(req: Request): string | null {
  const header = req.headers['x-api-key'];
  const raw = (Array.isArray(header) ? header[0] : header || '').trim();
  if (raw && raw.length <= MAX_KEY_LENGTH) return raw;

  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    // Session tokens (vnt_sess_…) are never accepted here — only sk_* secrets.
    if (token.startsWith('sk_') && token.length <= MAX_KEY_LENGTH) return token;
  }
  return null;
}

function findKeyBySecret(raw: string): ApiKey | null {
  const digest = hashApiKeySecret(raw);
  const target = Buffer.from(digest, 'utf8');
  for (const key of db.apiKeys) {
    const stored = key.secretHash;
    if (typeof stored !== 'string' || stored.length !== target.length) continue;
    if (crypto.timingSafeEqual(Buffer.from(stored, 'utf8'), target)) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rate-limit alert (action = alert_only): served, but audited (throttled 1/60s)
// ---------------------------------------------------------------------------
function maybeAlertRateLimit(req: Request, key: ApiKey, decision: RateDecision): void {
  const now = Date.now();
  const last = lastAlerts.get(key.id) || 0;
  if (now - last < ALERT_THROTTLE_MS) return;
  lastAlerts.set(key.id, now);

  try {
    db.recordAuditLog({
      actorId: key.ownerId,
      actorName: key.ownerName,
      actorEmail: db.users.find((u) => u.id === key.ownerId)?.email || '',
      action: 'API_KEY_RATE_LIMIT_EXCEEDED',
      category: 'API',
      target: `${key.id} (${key.name})`,
      source: 'APPLICATION',
      status: 'WARNING',
      ipAddress: req.ip || 'unknown',
      metadata: {
        path: req.originalUrl,
        limit: decision.limit,
        algorithm: key.rateLimitAlgorithm || 'sliding_window',
        action: 'alert_only',
      },
    });
  } catch (err) {
    console.error('[apiKeyAuth] audit write failed:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// The middleware
// ---------------------------------------------------------------------------
async function runApiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = extractApiKey(req);
  if (!raw) {
    res.status(401).json({
      error: 'API key required',
      hint: 'Send x-api-key: sk_... or Authorization: Bearer sk_...',
    });
    return;
  }

  const key = findKeyBySecret(raw);
  if (!key) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  // Record the REAL outcome of this request for usage analytics. Attached
  // before quota/rate/scope decisions so 403/429 rejections are counted
  // honestly too — the chart never reports traffic that did not happen.
  const receivedAt = Date.now();
  res.on('finish', () => {
    try {
      db.recordApiKeyUsage({
        keyId: key.id,
        ownerId: key.ownerId,
        path: req.path,
        status: res.statusCode,
        latencyMs: Date.now() - receivedAt,
        ts: Date.now(),
      });
    } catch {
      // Telemetry must never break a served response.
    }
  });

  // --- status / expiry ------------------------------------------------------
  if (key.status === 'revoked') {
    res.status(403).json({ error: 'API key revoked', keyId: key.id });
    return;
  }
  if (key.status === 'suspended') {
    res.status(403).json({ error: 'API key suspended', keyId: key.id });
    return;
  }
  if (key.expiresAt && Date.parse(key.expiresAt) < Date.now()) {
    res.status(403).json({ error: 'API key expired', expiresAt: key.expiresAt });
    return;
  }

  // --- monthly quota rollover ----------------------------------------------
  const period = currentPeriod();
  if (key.usagePeriod !== period) {
    key.usagePeriod = period;
    key.currentUsageThisMonth = 0;
  }

  const now = Date.now();
  let decision = peekRateLimit(key, now);
  setRateHeaders(res, decision);

  // --- monthly quota (checked BEFORE the rate window) -----------------------
  // Applies to every public route — including /public/quota itself; the 429
  // body carries limit/used/resetsAt so the caller still gets the numbers.
  const quota = key.monthlyQuota || 0;
  const used = key.currentUsageThisMonth || 0;
  if (quota > 0 && used >= quota) {
    const resetsAt = nextQuotaReset();
    const retryAfterSec = Math.max(1, Math.ceil((Date.parse(resetsAt) - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({ error: 'Monthly quota exceeded', quota, used, resetsAt });
    return;
  }

  // --- per-key rate window --------------------------------------------------
  if (!decision.allowed) {
    const action = key.actionOnExceed || 'reject_429';

    if (action === 'throttle_delay') {
      // Delay instead of rejecting (capped at 2s) — then serve anyway.
      await sleep(Math.min(MAX_THROTTLE_SLEEP_MS, Math.max(0, decision.retryAfterMs)));
      recordRateLimit(key, Date.now());
    } else if (action === 'alert_only') {
      // Serve every request, but audit the overage (throttled to 1/min/key).
      recordRateLimit(key, now);
      maybeAlertRateLimit(req, key, decision);
    } else {
      // reject_429 (default)
      const retryAfterSec = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: 'Rate limit exceeded',
        limit: decision.limit,
        windowSeconds: Math.round(WINDOW_MS / 1000),
        retryAfter: retryAfterSec,
      });
      return;
    }
  } else {
    recordRateLimit(key, now);
  }

  // Refresh headers now that this request has been counted.
  decision = peekRateLimit(key, Date.now());
  setRateHeaders(res, decision);

  // --- usage counters (served requests only) --------------------------------
  key.usageCount += 1;
  key.currentUsageThisMonth = (key.currentUsageThisMonth || 0) + 1;
  key.currentRpmUsage = decision.windowCount;
  key.lastUsedAt = new Date().toISOString();

  (req as any).apiKey = key;
  next();
}

/**
 * authenticateApiKey — synchronous Express middleware wrapping the async
 * verification flow. Rejections go to the central error handler (JSON 500),
 * because Express 4 does not catch rejected promises from handlers.
 */
export function authenticateApiKey(req: Request, res: Response, next: NextFunction): void {
  runApiKeyAuth(req, res, next).catch(next);
}

/**
 * requireScope('api.read') — 403 with the granted scope list when missing.
 * Always mounted AFTER authenticateApiKey.
 */
export function requireScope(scope: PermissionScope) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = (req as any).apiKey as ApiKey | undefined;
    if (!key) {
      res.status(401).json({ error: 'API key required' });
      return;
    }
    if (!key.scopes.includes(scope)) {
      res.status(403).json({ error: `Missing required scope: ${scope}`, grantedScopes: key.scopes });
      return;
    }
    next();
  };
}

/** Non-mutating view of the key's current rate window (used by /public/quota). */
export interface RateWindowStatus {
  algorithm: string;
  limitPerMin: number;
  windowCount: number;
  remaining: number;
  resetAt: string;
  retryAfterMs: number;
}

export function rateWindowStatus(key: ApiKey): RateWindowStatus {
  const now = Date.now();
  const decision = peekRateLimit(key, now);
  return {
    algorithm: key.rateLimitAlgorithm || 'sliding_window',
    limitPerMin: decision.limit,
    windowCount: decision.windowCount,
    remaining: decision.remaining,
    resetAt: new Date(decision.resetAtSec * 1000).toISOString(),
    retryAfterMs: decision.retryAfterMs,
  };
}
