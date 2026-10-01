# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.4.x   | ✅ |
| < 1.4   | ❌ |

## Reporting a Vulnerability

- Open a **private** GitHub Security Advisory on this repo, or email the maintainer.
- Do not open public issues for secrets, auth bypass, SSRF, or RCE.
- Expect an initial response within 72 hours.

## Security Model (enforced server-side)

- No `x-user-role` / `x-user-id` trust in production. Admin requires `ADMIN_API_TOKEN`
  (min 32 chars, `Authorization: Bearer`) or server-side `ADMIN` role.
- **Real accounts**: `POST /api/v1/auth/register|login|logout` with scrypt-hashed
  passwords (`node:crypto`, no native deps) and random 256-bit session tokens.
  Only the **sha256 hash** of a token is stored (`public.auth_sessions`), sessions
  expire after 30 days, and login errors are generic (`Invalid email or password`)
  to block user enumeration. Login/register are rate-limited (60/min/IP).
- New self-registered users are always `USER`. Admin promotion paths are only:
  `ADMIN_EMAILS` env (comma-separated), the first account on a fresh database,
  or `ADMIN_API_TOKEN` promoting via `/api/v1/admin/users/:id/role`.
- **Social login** (Discord/Google/GitHub — OAuth 2.0 authorization code):
  `state` is an HMAC signed with the provider's client_secret (10-min expiry,
  verified with `timingSafeEqual`) so it works on serverless without shared
  storage. Identities link by provider id or by **verified email only** — an
  unverified email can never take over an existing account. Code/token/profile
  exchange happens server-side only; tokens never appear in logs or HTML.
- Local/demo sessions (OAuth sim, ingress-key tab) can never grant `ADMIN`.
- Secrets use `crypto.randomBytes`. Raw API secrets are shown once only.
- Webhook URLs: `https` only in production, private hosts blocked (SSRF guard).
- Rate limits on `/api/*`, stricter on auth/AI/bot. Pagination capped at 100.
- All inputs length-capped + sanitized. Errors never leak stack traces.
- `DATABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are server-only (never `VITE_`).
- RLS enabled with no permissive anon policies; app uses server role.

## API Keys (external integrations)

Public surface: `/api/v1/public/{ping,me,status,quota}` — the machine-to-machine
API that dashboard-created keys authenticate against.

**Storage & transport of the secret**

- A key's raw secret is `sk_<env>_vanitas_<24 random bytes, base64url>` (~256 bits
  of entropy), generated with `crypto.randomBytes`.
- Only `sha256(secret)` is kept, attached **non-enumerable** on the `ApiKey` object
  (`Object.defineProperty`), so `JSON.stringify`, spread, list/create/rotate
  responses and logs can never emit it. The raw secret exists exactly once — in
  the create/rotate response — and the UI reveals it once with a curl example.
- Lookup hashes the presented secret and compares with `crypto.timingSafeEqual`
  over equal-length digests (no early-exit string compare).
- Seeded/demo keys carry no hash and therefore can never authenticate (display only).

**Presentation of the secret (middleware order)**

1. `x-api-key: sk_...` **or** `Authorization: Bearer sk_...` (session tokens
   starting `vnt_sess_` are never accepted here; length capped at 300).
2. Missing → `401 API key required`; unknown hash → `401 Invalid API key`.
3. `revoked` / `suspended` / expired → `403` (the hash stays on a revoked key so
   the client gets a precise reason instead of a generic 401).
4. Monthly rollover via `usagePeriod` (`YYYY-MM`), then **quota** check →
   `429 Monthly quota exceeded` with `Retry-After` until the next month.
5. Per-key **rate window** (algorithm-aware) → `429 Rate limit exceeded` with
   `Retry-After`, honouring the key's `actionOnExceed`:
   - `reject_429` (default) — reject, nothing is counted;
   - `throttle_delay` — sleep up to 2s, then serve (request still counted);
   - `alert_only` — always serve, write an `API_KEY_RATE_LIMIT_EXCEEDED`
     audit entry (throttled to 1/min/key).
6. Only **served** requests move `usageCount`, `currentUsageThisMonth`,
   `currentRpmUsage` and `lastUsedAt`. Rejected requests consume neither quota
   nor the rate window.

**Algorithms** (`rateLimitAlgorithm`, per key): `sliding_window` (default,
rolling 60s timestamps), `fixed_window` (aligned minute buckets),
`token_bucket` (`burstLimit` capacity, refills `rateLimitPerMin/60000` per ms).
`X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` are set on
every response (and exposed to browsers via `Access-Control-Expose-Headers`).

**Scopes**: `requireScope('api.read')` returns `403` with `grantedScopes`, so a
caller can see exactly which scope is missing. `/ping`, `/me` and `/quota`
deliberately need no scope (a key may always validate itself and read its own
usage); `/status` requires `api.read`.

**Backstops**: per-key limits sit behind a per-IP limiter (1200/min for
`/api/v1/public/*`, 300/min for the rest of `/api/*`). `ADMIN_API_TOKEN`
session resolution is skipped for `sk_*` tokens so API keys never enter the
session store.
