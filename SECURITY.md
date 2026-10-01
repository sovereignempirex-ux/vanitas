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
