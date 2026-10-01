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
- New self-registered users are always `USER`.
- Secrets use `crypto.randomBytes`. Raw API secrets are shown once only.
- Webhook URLs: `https` only in production, private hosts blocked (SSRF guard).
- Rate limits on `/api/*`, stricter on auth/AI/bot. Pagination capped at 100.
- All inputs length-capped + sanitized. Errors never leak stack traces.
- `DATABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are server-only (never `VITE_`).
- RLS enabled with no permissive anon policies; app uses server role.
