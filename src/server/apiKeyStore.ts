// ---------------------------------------------------------------------------
// Durable storage for API keys.
//
// WHY THIS EXISTS
// ---------------
// `db.apiKeys` (src/server/db.ts) is the runtime source of truth used by
// authenticateApiKey / the dashboard, but it was NEVER hydrated from
// PostgreSQL. In PG mode every key you created lived only in the process
// heap: every deploy, restart or cold serverless start silently wiped all of
// them, while `/public/status` kept counting the (empty) table. Keys are the
// product's core credential, so they have to survive the process.
//
// MODEL
// -----
// * `record` (jsonb) holds the FULL ApiKey snapshot. It keeps this layer
//   independent of schema drift — burstLimit, actionOnExceed, usagePeriod… all
//   round-trip without one column per field.
// * `secret_hash` / `status` / `scopes`… are ALSO mirrored into real columns,
//   because other queries read them directly (`count(*) … where status='active'`)
//   and scripts/sql-check.mjs asserts on them.
// * The raw secret is never written: `secretHash` is non-enumerable, so the
//   `{ ...key }` snapshot cannot contain it.
//
// WRITES
// ------
// * Structural changes (create / rotate / revoke / scopes / rate-limit) are
//   awaited inside the request handler before the response is sent — a 201 must
//   mean the key is durable.
// * Usage counters change on EVERY authenticated call, so they are flushed at
//   most once per minute per key (fire-and-forget). Those updates go through
//   jsonb_set(), which patches only the counter paths of the ROW's current
//   record — they can therefore never roll back a concurrent revoke/rotate.
// ---------------------------------------------------------------------------

import type { ApiKey } from '../types.ts';
import { databasePool, ensureSchema } from './pg.ts';
import { attachSecretHash, db } from './db.ts';

/** Full snapshot upsert. Used by every structural mutation. */
const UPSERT_SQL = `
insert into public.api_keys (
  id, name, key_prefix, secret_hash, owner_id, owner_name, scopes, status,
  environment, rate_limit_per_min, monthly_quota, usage_count,
  created_at, last_used_at, expires_at, masked_secret, record
) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
on conflict (id) do update set
  name             = excluded.name,
  key_prefix       = excluded.key_prefix,
  secret_hash      = excluded.secret_hash,
  owner_id         = excluded.owner_id,
  owner_name       = excluded.owner_name,
  scopes           = excluded.scopes,
  status           = excluded.status,
  environment      = excluded.environment,
  rate_limit_per_min = excluded.rate_limit_per_min,
  monthly_quota    = excluded.monthly_quota,
  usage_count      = excluded.usage_count,
  last_used_at     = excluded.last_used_at,
  expires_at       = excluded.expires_at,
  masked_secret    = excluded.masked_secret,
  record           = excluded.record`;

/**
 * Counter-only update. jsonb_set() patches paths inside whatever record is
 * currently stored, so unlike UPSERT_SQL it cannot resurrect an old status,
 * scope list or secret hash.
 */
const USAGE_SQL = `
update public.api_keys
   set usage_count = $2,
       last_used_at = $3,
       record = jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(coalesce(record, '{}'::jsonb),
               '{usageCount}',          to_jsonb($2::bigint)),
             '{currentUsageThisMonth}', to_jsonb($4::int)),
           '{usagePeriod}',             to_jsonb($5::text)),
         '{lastUsedAt}',                to_jsonb($6::text))
 where id = $1`;

const USAGE_FLUSH_INTERVAL_MS = 60_000;
const lastUsageFlush = new Map<string, number>();

function toRecord(key: ApiKey): Record<string, unknown> {
  // Spread copies own ENUMERABLE properties only — `secretHash` is defined
  // non-enumerable, so it can never ride along in the snapshot.
  return { ...key };
}

/**
 * Rebuild `db.apiKeys` from PostgreSQL. Called once during boot, after
 * ensureSchema(). Failure leaves the list empty rather than crashing the app —
 * the alternative (booting with an empty list while the table has rows) is the
 * exact bug this module fixes, so the error is loud in the logs.
 */
export async function loadApiKeys(): Promise<void> {
  if (!databasePool) return;
  await ensureSchema();
  try {
    const res = await databasePool.query(
      'select id, secret_hash, status, record from public.api_keys order by created_at desc nulls last',
    );
    const keys: ApiKey[] = [];
    for (const row of res.rows) {
      const record = row.record;
      if (!record || typeof record !== 'object' || !record.id) continue;
      const key = { ...record, id: String(record.id) } as ApiKey;
      // The column wins: it is what every other query reads.
      if (row.status) key.status = row.status;
      attachSecretHash(key, row.secret_hash || '');
      keys.push(key);
    }
    db.apiKeys = keys;
    db.systemStats.activeApiKeys = keys.filter((k) => k.status === 'active').length;
    if (keys.length > 0) console.log(`[apikeys] hydrated ${keys.length} key(s) from PostgreSQL`);
  } catch (err) {
    console.error('[apikeys] hydration failed — starting with an empty list:', (err as Error).message);
  }
}

/** Persist one key's full snapshot. No-op (and no throw) outside PG mode. */
export async function saveApiKey(key: ApiKey): Promise<void> {
  if (!databasePool) return;
  // Memoized: guarantees the `record`/`masked_secret` columns exist even when a
  // request beats the boot-time migration to the punch.
  await ensureSchema();
  try {
    await databasePool.query(UPSERT_SQL, [
      key.id,
      key.name,
      key.keyPrefix,
      (key as { secretHash?: string }).secretHash || '',
      key.ownerId,
      key.ownerName,
      key.scopes,
      key.status,
      key.environment,
      key.rateLimitPerMin,
      key.monthlyQuota || 0,
      key.usageCount || 0,
      key.createdAt,
      key.lastUsedAt,
      key.expiresAt,
      key.maskedSecret,
      toRecord(key),
    ]);
  } catch (err) {
    // Surface it: the caller decides whether a failed write may still 2xx.
    console.error('[apikeys] persist failed for', key.id, (err as Error).message);
    throw err;
  }
}

/**
 * Throttled counter flush, called from the per-key rate limiter after every
 * served request. Best-effort: if the process dies mid-window we lose at most
 * one minute of usage, never a key.
 */
export function scheduleUsageFlush(key: ApiKey): void {
  if (!databasePool) return;
  const now = Date.now();
  const last = lastUsageFlush.get(key.id) || 0;
  if (now - last < USAGE_FLUSH_INTERVAL_MS) return;
  lastUsageFlush.set(key.id, now);
  void flushUsage(key).catch((err: Error) =>
    console.error('[apikeys] usage flush failed for', key.id, err.message),
  );
}

async function flushUsage(key: ApiKey): Promise<void> {
  if (!databasePool) return;
  await ensureSchema(); // `record` column may not exist on a legacy database yet
  await databasePool.query(USAGE_SQL, [
    key.id,
    key.usageCount || 0,
    key.lastUsedAt,
    key.currentUsageThisMonth || 0,
    key.usagePeriod || null,
    key.lastUsedAt || null,
  ]);
}

/** Drain pending counters — used on graceful shutdown so nothing is lost. */
export async function flushAllUsage(): Promise<void> {
  if (!databasePool) return;
  lastUsageFlush.clear();
  for (const key of db.apiKeys) {
    try {
      await flushUsage(key);
    } catch (err) {
      console.error('[apikeys] shutdown flush failed for', key.id, (err as Error).message);
    }
  }
}
