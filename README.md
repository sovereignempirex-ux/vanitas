<div align="center">

<img src="https://i.postimg.cc/SNN169kT/orders.png" alt="Vanitas Logo" width="120" height="120" style="border-radius: 24px;" />

<h1>VANITAS</h1>

<p align="center">
  <strong>Centralized API · Developer Platform · Security Control Center · AI-Powered</strong>
</p>

<p align="center">
  <a href="https://vanitas-bot.vercel.app" target="_blank">
    <img src="https://img.shields.io/badge/🌐_Live_Demo-vanitas--bot.vercel.app-3B82F6?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" />
  </a>
  <a href="https://vanitas-bot.vercel.app/api/" target="_blank">
    <img src="https://img.shields.io/badge/🔌_API_Docs-vanitas--bot.vercel.app/api-10B981?style=for-the-badge&logo=swagger&logoColor=white" alt="API Docs" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white&style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white&style=flat-square" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black&style=flat-square" alt="React" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white&style=flat-square" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white&style=flat-square" alt="Supabase" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white&style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white&style=flat-square" alt="Redis" />
  <img src="https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white&style=flat-square" alt="OpenAI" />
</p>

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [Authentication](#-authentication)
- [API & Developer Portal](#-api--developer-portal)
- [API Key Management](#-api-key-management)
- [Permissions & RBAC](#-permissions--rbac)
- [Admin Center](#-admin-center)
- [Security Engine](#-security-engine)
- [Vanitas AI](#-vanitas-ai)
- [Bot Integration](#-bot-integration)
- [Audit Logs](#-audit-logs)
- [Webhooks](#-webhooks)
- [Observability](#-observability)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Project Structure](#-project-structure)
- [API Endpoints](#-api-endpoints)
- [Security](#-security)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## 🌟 Overview

**Vanitas** is a production-ready, full-stack centralized platform designed to power a unified ecosystem across multiple clients — Web, Mobile, Desktop, WhatsApp Bot, and Discord Bot — all communicating through a single secure API with robust authentication, granular permissions, and AI assistance.

### Free, self-hosted local stack

The repository can run without a paid AI API using an open-source Ollama model and PostgreSQL:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose exec ollama ollama pull llama3.2
```

Open `http://localhost:3000`. This uses free/open-source software locally; hosting, model hardware, and third-party free-tier limits remain the operator's responsibility. Gemini is optional and disabled when `AI_PROVIDER=ollama`.

`DEMO_MODE` is disabled by default. Do not enable it in production: it is solely a local UI-testing aid and no production authorization decision trusts browser role headers.

> **Live Website:** [https://vanitas-bot.vercel.app](https://vanitas-bot.vercel.app)  
> **API Base:** [https://vanitas-bot.vercel.app/api/](https://vanitas-bot.vercel.app/api/)

### Design Philosophy

- **Premium SaaS Experience** — Glassmorphism, Crystal UI, ambient glow, and smooth micro-interactions
- **Security First** — Server-side authorization, granular RBAC, audit logging, rate limiting
- **Developer-Friendly** — Interactive API playground, comprehensive documentation, SDK examples
- **AI-Powered** — Intelligent assistants for code, API, documentation, security, and analytics
- **Scalable Architecture** — Ready for multi-tenant, multi-client, and enterprise-grade growth

---

## 🏗️ Architecture

```
                         ┌─────────────────────────────────────┐
                         │           VANITAS                   │
                         │    Central API + PostgreSQL         │
                         │    Redis Cache + Supabase RLS       │
                         └──────────────┬──────────────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
           ┌──┴──┐                   ┌─┴─┐                     ┌─┴─┐
           │ WEB │                   │BOT│                     │APP│
           └──┬──┘                   └─┬─┘                     └─┬─┘
              │                         │                         │
              └─────────────────────────┼─────────────────────────┘
                                        │
                              ┌─────────┴─────────┐
                              │   AUTHENTICATION  │
                              │  OAuth + Sessions │
                              └─────────┬─────────┘
                                        │
                              ┌─────────┴─────────┐
                              │  RBAC + SCOPES    │
                              │  Role-Based ACL   │
                              └───────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| **Backend** | Next.js API Routes, Server Actions, Edge Runtime |
| **Database** | PostgreSQL (Supabase), Row Level Security (RLS) |
| **Cache** | Redis (Upstash) |
| **Auth** | Supabase Auth, OAuth 2.0 (Google, GitHub, Discord) |
| **AI** | OpenAI GPT-4, Function Calling |
| **Storage** | Supabase Storage (avatars, assets) |
| **Hosting** | Vercel (Edge Network) |

---

## ✨ Features

### 🔐 Authentication
- **OAuth 2.0** — Google, GitHub, Discord login
- **Email/Password** — Secure registration with validation
- **Session Management** — JWT-based sessions with refresh tokens
- **2FA / Passkeys** — TOTP and WebAuthn support
- **Connected Accounts** — Link/unlink OAuth providers safely
- **OAuth Provider** — Third-party apps can offer "Sign in with Vanitas" (authorization-code flow + PKCE)

### 🛡️ Security
- **Granular RBAC** — USER and ADMIN roles with permission-based access
- **API Key Scopes** — Explicit scope assignment per key
- **Rate Limiting** — IP, user, API key, and endpoint-level limits
- **Audit Logging** — Complete action tracking with CSV export
- **Security Engine** — Automated threat detection and alerts
- **Security Headers** — CSP, HSTS, X-Content-Type-Options, etc.

### 🔑 API Key Management
- Create, rotate, revoke API keys
- Scope picker with `assertGrantableScopes` validation
- One-time secret reveal with copy-to-clipboard
- Usage tracking and quota monitoring
- Safe rotation with confirmation dialogs

### 🤖 Vanitas AI
- **Code Assistant** — Explain, analyze, fix, and generate code
- **API Assistant** — Generate requests, explain endpoints and errors
- **Documentation Assistant** — Search platform docs and answer questions
- **Security Analyst** — Detect suspicious patterns and explain risks
- **Analytics Assistant** — Summarize usage and identify trends
- **Web Search** — External research with trusted sources

### 📊 Admin Dashboard
- Real-time statistics (users, API requests, errors, latency)
- User management with role assignment
- API key administration
- Database overview
- System logs with pagination and filters
- Security alerts and monitoring
- Emergency controls (maintenance mode, force logout, block source)

### 👤 User Dashboard
- Profile management (avatar, display name, bio)
- Security center (2FA, sessions, login history)
- API keys and usage
- Developer portal and documentation
- Activity feed and notifications
- Connected accounts management
- Account directory search and private messaging (real accounts only — never seeded)

### 🔔 Notifications
- New login / new device alerts
- API key lifecycle events
- Role changes
- Security alerts
- API quota warnings

### ⌨️ Command Palette
- `Ctrl + K` global search
- Quick navigation to any section
- Search users, API keys, logs, documentation

---

## 🔐 Authentication

Vanitas supports multiple authentication methods:

### OAuth Providers

| Provider | Status | Endpoint |
|----------|--------|----------|
| Google | ✅ Active | `/api/auth/callback/google` |
| GitHub | ✅ Active | `/api/auth/callback/github` |
| Discord | ✅ Active | `/api/auth/callback/discord` |

### Session Flow

```
User → OAuth Provider → Callback → Supabase Auth → JWT Session → Redirect
```

### Role Assignment

```
Authenticated User → user_id → user_roles table → Role (USER/ADMIN)
```

> **Note:** Admin promotion is done server-side or via secure bootstrap process. No hardcoded credentials exist in the codebase.

---

## 🔌 API & Developer Portal

### API Versioning

```
/api/v1/    — Current stable version
/api/v2/    — Reserved for future releases
```

### Interactive Playground

Test endpoints directly from the developer portal:

```javascript
// Example: GET /api/v1/users/me
const response = await fetch('/api/v1/users/me', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
});
const user = await response.json();
```

### SDK Examples

- **JavaScript/TypeScript**
- **Python**
- **cURL**

### Rate Limits

| Plan | Requests/Month | Rate Limit |
|------|---------------|------------|
| Free | 10,000 | 100/min |
| Pro | 100,000 | 500/min |
| Business | 1,000,000 | 2,000/min |
| Enterprise | Custom | Custom |

---

## 🔑 API Key Management

### Creating an API Key

1. Navigate to **Developer → API Keys**
2. Click **Create API Key**
3. Enter name and select scopes
4. Server validates scopes via `assertGrantableScopes`
5. One-time secret reveal — copy immediately

### Scopes

```
api.read          — Read API information
api.write         — Write API data
users.read        — Read user data
users.write       — Modify users
users.delete      — Delete users
roles.read        — Read roles
roles.manage      — Manage roles
database.read     — Read database info
database.write    — Write database data
logs.read         — Read audit logs
logs.export       — Export logs to CSV
settings.read     — Read settings
settings.write    — Modify settings
system.read       — Read system status
system.manage     — Manage system
security.read     — Read security data
security.manage   — Manage security
keys.read         — Read API keys
keys.create       — Create API keys
keys.rotate       — Rotate API keys
keys.revoke       — Revoke API keys
keys.scopes.update — Update key scopes
```

### Secret Security

- Secrets are generated server-side only
- Stored as secure hashes (never plaintext in logs)
- One-time reveal with copy button
- Masked by default: `sk_live_••••••••••••91`
- Never stored in localStorage, URLs, or analytics

---

## 🛡️ Permissions & RBAC

### Roles

| Role | Description |
|------|-------------|
| `USER` | Standard platform user |
| `ADMIN` | Full platform administration |

### Permission Hierarchy

```
User
  ↓
Role (USER / ADMIN)
  ↓
Permissions (users.read, api.write, etc.)
  ↓
API Key
  ↓
API Key Scopes
  ↓
Endpoint Permission Check
  ↓
Allow / Deny (403 Forbidden)
```

### Server-Side Enforcement

```typescript
// Example: Admin route guard
async function requireAdmin(userId: string) {
  const hasRole = await checkUserRole(userId, 'ADMIN');
  if (!hasRole) {
    throw new Error('403 Forbidden');
  }
}
```

> **Critical:** Frontend role checks are UI-only. All authorization is enforced server-side.

---

## 🎛️ Admin Center

### Dashboard Sections

| Section | Description |
|---------|-------------|
| **Overview** | Platform metrics and health status |
| **Users** | User list, search, filter, role management |
| **API** | Endpoint overview, usage statistics |
| **API Keys** | Full key management for all users |
| **Database** | Schema overview, RLS policies |
| **Logs** | Audit logs with pagination, filters, CSV export |
| **Statistics** | Real-time charts and analytics |
| **Permissions** | Role and permission management |
| **Security** | Alerts, threat detection, emergency controls |
| **System** | Feature flags, maintenance mode, health checks |
| **AI** | AI usage analytics and configuration |

### Emergency Controls

- Disable API globally
- Revoke suspicious API keys
- Force logout specific users
- Block suspicious IP/sources
- Enable maintenance mode

> All emergency actions require confirmation and are fully audited.

---

## 🔒 Security Engine

### Threat Detection

The security engine automatically detects:

- Excessive failed API requests
- Unusual API usage patterns
- Authentication failures
- New device logins
- Suspicious client behavior
- Abnormal request volumes

### Response Actions

| Severity | Action |
|----------|--------|
| Low | Alert notification |
| Medium | Rate-limit increase |
| High | Require step-up authentication |
| Critical | Revoke key / Block source |

### Security Center (User)

- 2FA status and configuration
- Passkeys management
- Active sessions (browser, OS, IP, last active)
- Login history
- Security alerts
- API keys overview

---

## 🤖 Vanitas AI

### Capabilities

| Assistant | Functions |
|-----------|-----------|
| **Code Assistant** | Explain, analyze errors, suggest fixes, generate snippets |
| **API Assistant** | Explain endpoints, generate requests, explain errors |
| **Documentation** | Search docs, answer platform questions, explain scopes |
| **System Analyst** | Analyze API health, errors, summarize status |
| **Security Analyst** | Analyze audit events, detect patterns, explain risks |
| **Analytics** | Summarize usage, identify trends, explain charts |
| **Web Search** | External research with source attribution |

### AI Permissions

AI operates with explicit permissions:

```
logs.read         — Read audit logs
analytics.read    — Read analytics data
api.read          — Read API information
documentation.read — Read platform docs
```

Sensitive actions (revoke key, delete user) require:

```
AI Request → Permission Check → User Confirmation → Action → Audit Log
```

---

## 🤖 Bot Integration

Vanitas bots connect through the same centralized API:

### Bot Authentication

```
Bot → API Key (with bot scopes) → Rate Limited → Authorized
```

### Bot Scopes

```
bot.execute       — Execute bot commands
api.read          — Read API data
usage.read        — Read usage statistics
```

### Supported Bots

| Platform | Status |
|----------|--------|
| WhatsApp | 🚧 In Development |
| Discord | 🚧 In Development |

> Bots do NOT automatically receive admin privileges. Explicit scopes required.

---

## 📋 Audit Logs

### Tracked Events

| Category | Events |
|----------|--------|
| **API Keys** | Created, rotated, revoked, scope updated |
| **Users** | Created, updated, deleted, role changed |
| **Roles** | Assigned, removed, permission changed |
| **Security** | Login, logout, 2FA enabled, session revoked |
| **System** | Settings changed, maintenance mode, feature flags |

### Log Format

| Field | Description |
|-------|-------------|
| `actor` | User ID who performed the action |
| `action` | Action performed |
| `category` | Event category |
| `target` | Affected resource ID |
| `timestamp` | ISO 8601 timestamp |
| `source` | WEB, BOT, MOBILE, DESKTOP |
| `status` | SUCCESS, FAILED |
| `request_id` | Unique request identifier |
| `metadata` | Additional context (JSON) |

### Filters

- **Time:** 24h, 7d, 30d, All
- **Category:** All, Admin, API
- **Pagination:** `limit`, `offset`, `from`

### CSV Export

Export filtered logs to CSV with all visible fields. Secrets and passwords are never exported.

---

## 🔔 Webhooks

### Supported Events

```
user.created
user.updated
user.deleted
api_key.created
api_key.rotated
api_key.revoked
role.changed
security.alert
```

### Features

- Webhook URL configuration
- Secret/signature verification (HMAC)
- Event selection
- Enable/disable toggle
- Delivery history with retry logic
- Failure handling and alerting

---

## 📊 Observability

### Metrics

| Metric | Target |
|--------|--------|
| Requests/sec | Real-time tracking |
| Latency (P50/P95/P99) | < 200ms / < 500ms / < 1000ms |
| Error Rate | < 0.1% |
| Database Latency | < 50ms |
| Cache Hit Rate | > 80% |

### Health Endpoints

```
GET /health     — API alive check
GET /ready      — Database and dependencies ready
```

### Status Page

```
API             ● Operational
Authentication  ● Operational
Database        ● Operational
AI              ● Operational
Bot             ● Operational
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ (22 LTS recommended)
- npm
- PostgreSQL 16 — **optional**: without it the app runs on its in-memory store
  (`docker compose up` starts Postgres for you)
- OAuth app credentials (Google, GitHub, Discord) — optional, social login only

> This README describes the **Express + Vite + PostgreSQL** application in this
> repository. Earlier revisions of this file documented a Next.js/Supabase/Redis
> stack that does not exist here. See `DEPLOY_AR.md` for the full deployment
> guide.

### Installation

```bash
# Clone the repository
git clone https://github.com/sovereignempirex-ux/vanitas.git
cd vanitas

# Install dependencies
npm install

# Set up environment variables (the server reads .env at boot)
cp .env.example .env
# Edit .env with your credentials

# Optional: create PostgreSQL tables (only if you set DATABASE_URL)
npm run db:migrate

# Start development server
npm run dev
```

Leave `DATABASE_URL` empty in `.env` to run without a database.

### Build for Production

```bash
npm run build
npm start

# or, containerised
docker compose up --build
```

### Run Tests

```bash
# Type check + SQL/DDL checks against a real (WASM) PostgreSQL
npm run test

# Full end-to-end OAuth flow against a mock provider (builds first)
npm run test:e2e
```

Other checks: `npm run lint` / `npm run typecheck` (both run `tsc --noEmit`).

---

## 🔧 Environment Variables

Copy `.env.example` to `.env` — that file is the authoritative, commented
reference. The server loads it at boot (`import 'dotenv/config'` in
`server.ts`) and never overrides variables already provided by the platform.

```env
# AI (ollama = local, gemini = optional paid)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2
GEMINI_API_KEY=

# Database — EMPTY = in-memory mode (works out of the box)
DATABASE_URL=
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# Crypto / bootstrap
INVITE_ENC_KEY=            # openssl rand -hex 32
ADMIN_API_TOKEN=           # openssl rand -base64 32
ADMIN_EMAILS=

# Server
FRONTEND_URL=http://localhost:3000
PORT=3000
DEMO_MODE=false

# Optional social login (leave a provider empty to hide its button)
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=
```

> **⚠️ Security:** never commit `.env`. It is covered by `.gitignore` and CI
> (`.github/workflows/ci.yml`) fails the build if any `.env` file other than
> `.env.example` is ever tracked again. On Vercel/Render, set these as platform
> environment variables instead.
>
> Never prefix a secret with `VITE_` — Vite inlines any `VITE_*` variable into
> the browser bundle.

---

## 📁 Project Structure

```
vanitas/
├── server.ts                 # Express app — every /api/v1 route, auth, rate limits
├── api/index.js              # Vercel serverless bundle (built from src/server/vercelEntry.ts)
├── index.html                # Vite SPA entry point
├── vite.config.ts            # Vite + React + Tailwind v4
├── vercel.json               # Build/output, SPA rewrites, security headers
├── Dockerfile                # Multi-stage build → node dist/server.cjs
├── docker-compose.yml        # postgres + ollama + app
├── src/
│   ├── main.tsx / App.tsx    # React entry + app shell
│   ├── types.ts              # Shared domain types (User, ApiKey, …)
│   ├── components/           # Views, CommandPalette, charts, modals
│   ├── pages/                # AuthPage and other top-level screens
│   ├── context/              # AuthContext (client session state)
│   ├── lib/                  # apiClient (Bearer-aware fetch), client helpers
│   ├── data/                 # Static fixture content (docs, releases)
│   └── server/               # Server-only modules (never bundled into the SPA)
│       ├── security.ts       # getActorUser, requireAdmin, rateLimit, sanitizers
│       ├── db.ts             # In-memory store, ALL_SCOPES, API-key hashing
│       ├── pg.ts             # PostgreSQL pool + idempotent SCHEMA_DDL upgrades
│       ├── authStore.ts      # Accounts, sessions, TOTP, 2FA brute-force lockout
│       ├── apiKeyAuth.ts     # x-api-key auth, scope checks, per-key rate limits
│       ├── apiKeyStore.ts    # Durable api_keys persistence (jsonb record)
│       ├── oauth.ts          # Signed state + code exchange
│       ├── totp.ts           # TOTP secret generation / verification
│       ├── aiService.ts      # AI provider client + semantic search
│       └── vercelEntry.ts    # Serverless wrapper → api/index.js
├── scripts/                  # migrate.js, sql-check.mjs, e2e + smoke tests
├── supabase/schema.sql       # Canonical PostgreSQL schema (npm run db:migrate)
├── public/                   # Self-hosted static assets
├── .github/workflows/        # ci.yml (typecheck + build + secret scan), codeql.yml
└── .env.example              # Every supported variable, annotated
```

---

## 🔌 API Endpoints

All routes are served by `server.ts` (Express). Unless noted, authentication is
`Authorization: Bearer <session token>`; the `/public/*` surface uses
`x-api-key: sk_live_vanitas_…` instead.

### Health & meta

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/v1/health` | Liveness probe | — |
| `GET` | `/api/v1/ready` | Readiness (DB reachable?) | — |
| `GET` | `/api/v1/status` | Public status snapshot | — |

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/v1/auth/register` | Create an account (first one bootstraps as ADMIN) | — |
| `POST` | `/api/v1/auth/login` | Password login (may require 2FA) | — |
| `POST` | `/api/v1/auth/logout` | Revoke the current session | Bearer |
| `GET` | `/api/v1/auth/me` | Current user + permissions | Bearer |
| `PATCH` | `/api/v1/auth/profile` | Update own profile | Bearer |
| `POST` | `/api/v1/auth/password` | Change password | Bearer |
| `DELETE` | `/api/v1/auth/account` | Delete own account | Bearer |
| `GET` | `/api/v1/auth/sessions` | List active sessions | Bearer |
| `DELETE` | `/api/v1/auth/sessions/:id` | Revoke one session | Bearer |
| `POST` | `/api/v1/auth/2fa/{setup,enable,disable,complete}` | TOTP lifecycle | Bearer / challenge |
| `GET` | `/api/v1/auth/providers` | Which OAuth providers are configured | — |
| `GET` | `/api/v1/social/:provider` | Start OAuth (sets the state cookie) | — |
| `GET` | `/api/v1/social/:provider/callback` | OAuth callback | state + cookie |

### API keys

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/v1/api-keys` | List keys (own, or all for ADMIN) | Bearer |
| `POST` | `/api/v1/api-keys` | Create a key → returns `rawSecret` once | Bearer |
| `POST` | `/api/v1/api-keys/:id/rotate` | Rotate the secret | Bearer |
| `DELETE` | `/api/v1/api-keys/:id` | Revoke | Bearer |
| `PATCH` | `/api/v1/api-keys/:id/scopes` | Change scopes | Bearer |
| `PATCH` | `/api/v1/api-keys/:id/rate-limit` | Change rate/quota policy | Bearer |
| `GET` | `/api/v1/api-keys/usage-analytics` | Time-series usage | Bearer |

### OAuth provider ("Sign in with Vanitas")

Vanitas doubles as an OAuth 2.0 authorization server. Register a
third-party application in the dashboard (OAuth Apps) and send its
users through the standard authorization-code flow with PKCE.

App types:
- **Confidential** (server-side) — receives a `client_secret` once;
  every token exchange must present it.
- **Public** (SPA/mobile) — NO secret is ever minted (a shipped binary
  can't keep one); PKCE (`code_challenge`) is mandatory on authorize.

Redirect URIs: `https://` everywhere except loopback
(`localhost` / `127.0.0.1` / `[::1]`, any port — for local dev and
native apps, RFC 8252). Private/link-local hosts are always rejected.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/v1/oauth/apps` | List your registered apps | Bearer |
| `POST` | `/api/v1/oauth/apps` | Register an app (`type` = `confidential`\|`public`) → `clientSecret` shown once (null for public) | Bearer |
| `DELETE` | `/api/v1/oauth/apps/:id` | Revoke an app (codes + tokens die with it) | Bearer |
| `GET` | `/api/v1/oauth/authorize` | Validate an authorize request → consent ticket | Bearer |
| `POST` | `/api/v1/oauth/authorize/decision` | Allow/deny → single-use code (via redirect URL) | Bearer |
| `POST` | `/api/v1/oauth/token` | Exchange code → access token (secret for confidential, PKCE for public) | client |
| `GET` | `/api/v1/oauth/userinfo` | OIDC-style profile; `email_verified` is reported honestly (true only when a social provider proved it) | Bearer (access token) |
| `POST` | `/api/v1/oauth/revoke` | RFC 7009 token revocation (idempotent) | client |
| `GET` | `/api/v1/oauth/grants` | Apps with live access to **your** account | Bearer |
| `DELETE` | `/api/v1/oauth/grants/:appId` | Cut every token you granted to one app | Bearer |
| `DELETE` | `/api/v1/oauth/grants` | Cut every grant at once ("sign out of all apps") | Bearer |

Browser flow (the consent page is the SPA route `/oauth/consent`):

1. The app sends the user to
   `https://<vanitas>/oauth/consent?client_id=…&redirect_uri=…&response_type=code&state=…`
   (public clients MUST add `code_challenge` + `code_challenge_method=s256`).
2. Signed-out visitors land on `/login?next=…`; after signing in they
   return to the consent screen.
3. The screen shows the app name, requested scopes (`profile`, `email`),
   the exact redirect URI and the `state` value — the user allows or denies.
4. On allow, the browser is redirected to the app's registered
   `redirect_uri?code=vnt_code_…&state=…` (single-use, 10-minute code).
5. The app exchanges the code at `POST /api/v1/oauth/token` and
   receives a 1-hour `Bearer` access token, then reads the profile at
   `/api/v1/oauth/userinfo`.
6. The user reviews or withdraws any grant anytime under
   **Dashboard → OAuth Apps → Apps with access to your account**.

Secrets at rest: client secrets are scrypt-hashed, codes and tokens are
sha256-hashed — a database dump alone can never mint a credential.
Expired codes/tokens are swept opportunistically; a wrong PKCE verifier
burns the code (single-use consumption caps verifier guessing).

### Public API (key-authenticated)

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| `GET` | `/api/v1/public/ping` | — | Liveness for machine clients |
| `GET` | `/api/v1/public/me` | — | This key's identity + usage |
| `GET` | `/api/v1/public/quota` | — | This key's quota + rate window |
| `GET` | `/api/v1/public/status` | `api.read` | Aggregated platform status |

### Admin

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/v1/admin/users` | List accounts | ADMIN |
| `PATCH` | `/api/v1/admin/users/:id/role` | Change role | ADMIN |
| `PATCH` | `/api/v1/admin/users/:id/verification` | Set verification badge | ADMIN |
| `DELETE` | `/api/v1/admin/users/:id` | Delete account | ADMIN |
| `GET/POST/DELETE` | `/api/v1/admin/invites[/:id]` | Invite links | ADMIN |
| `GET` | `/api/v1/admin/logs` | Audit logs (paginated) | ADMIN |
| `GET` | `/api/v1/admin/logs/export` | Audit logs as CSV | ADMIN |
| `GET` | `/api/v1/admin/statistics` | Platform statistics | ADMIN |
| `GET/PATCH` | `/api/v1/admin/feature-flags[/:id]` | Feature flags | ADMIN |
| `GET/PATCH` | `/api/v1/admin/suggestions[/:id]` | Product suggestions | ADMIN |
| `POST` | `/api/v1/admin/emergency` | Emergency controls | ADMIN |

### AI, bots, webhooks

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/v1/ai/chat` | Assistant chat (streaming supported) | Bearer |
| `POST` | `/api/v1/ai/diagnose-fix` | Code diagnosis | Bearer |
| `GET/DELETE` | `/api/v1/ai/history` | Chat history | Bearer |
| `GET` | `/api/v1/search/semantic` | Documentation search | — |
| `POST` | `/api/v1/bot/execute` | Bot gateway execution | ADMIN |
| `GET/POST` | `/api/v1/webhooks[/:id/test]` | Webhook endpoints | ADMIN |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/comments/:docId` · `POST` · `DELETE /:id` | Doc comments |
| `GET` | `/api/v1/profiles/:username` | Public profile (per-IP rate limited) |
| `GET` | `/api/v1/invites/:token` | Invite preview (per-IP rate limited) |
| `POST` | `/api/v1/suggestions` | Submit product feedback |
| `GET` | `/api/v1/youtube/search` | Video search proxy |
| `GET` | `/api/v1/download/:type` | Signed client artifacts |
| `GET` | `/api/v1/members/accounts?q=` | Search real accounts by name or @username (Bearer) |
| `GET` | `/api/v1/members/conversations` | Inbox: peers, last message, unread count (Bearer) |
| `GET` | `/api/v1/members/conversations/:username` | Thread with an account — marks it read (Bearer) |
| `POST` | `/api/v1/members/messages` | Send a private message to a real account (Bearer) |
| `GET` | `/api/v1/github/status` | Is the account connected to GitHub? (Bearer) |
| `GET` | `/api/v1/github/repos` | The user's own GitHub repositories (Bearer) |
| `POST` | `/api/v1/github/import` | Import a repo as a published project (Bearer) |
| `GET` | `/api/v1/publish/projects` | The signed-in user's published projects (Bearer) |
| `GET` | `/api/v1/publish/projects/public` | Public project gallery |
| `GET` | `/api/v1/publish/projects/:id` | Project detail with files |
| `DELETE` | `/api/v1/publish/projects/:id` | Delete own project (owner/admin) |
| `GET` | `/api/v1/publish/projects/:id/preview` | Sandboxed web preview (sandboxed iframe) |
| `POST` | `/api/v1/publish/snippets` | Publish an individual code file (Bearer) |
| `GET` | `/api/v1/publish/snippets` | The signed-in user's snippets (Bearer) |
| `GET` | `/api/v1/publish/snippets/public` | Public snippet gallery |
| `GET` | `/api/v1/publish/snippets/:id` | Snippet detail |
| `DELETE` | `/api/v1/publish/snippets/:id` | Delete own snippet (owner/admin) |
| `GET` | `/api/v1/publish/snippets/:id/preview` | Sandboxed preview (HTML snippets) |

---

## 🛡️ Security

### Security Checklist

- ✅ Server-side authorization on all admin endpoints
- ✅ Granular API key scopes with validation
- ✅ Rate limiting (IP, user, API key, endpoint)
- ✅ Row Level Security (RLS) on all tables
- ✅ Input validation and sanitization
- ✅ XSS, CSRF, SQL injection protection
- ✅ Secure cookies (HttpOnly, Secure, SameSite)
- ✅ Security headers (CSP, HSTS, etc.)
- ✅ Audit logging for all sensitive actions
- ✅ No secrets in frontend code or logs
- ✅ No hardcoded admin credentials
- ✅ API secrets masked by default

### Reporting Vulnerabilities

If you discover a security vulnerability, please email **security@vanitas.dev** (or open a private security advisory on GitHub).

---

## 🧪 Testing

### Test Coverage

| Module | Tests |
|--------|-------|
| Authentication | Login, OAuth, logout, sessions |
| Authorization | Role checks, permission enforcement |
| API Keys | Create, scope validation, rotate, revoke |
| Audit Logs | Pagination, filters, CSV export |
| Security | Unauthorized requests, rate limits |

### Running Tests

```bash
# Type check + SQL/DDL checks (self-contained, no server needed)
npm run test

# End-to-end OAuth flow against a mock provider (runs npm run build first)
npm run test:e2e

# Type checking only
npm run typecheck

# Alias of typecheck
npm run lint
```

> Earlier revisions of this file listed `npm run verify` and a unit-test suite
> that do not exist in this repository.

---

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Environment Setup

1. Connect GitHub repository to Vercel
2. Add all environment variables in Vercel dashboard
3. Configure custom domain (vanitas-bot.vercel.app)
4. Enable Edge Network features

### Database Migrations

```bash
# Run migrations on production
npx supabase migration up --db-url $DATABASE_URL
```

---

## 🗺️ Roadmap

### Completed ✅
- [x] Authentication (OAuth + Email)
- [x] Role-based access control
- [x] API key management with scopes
- [x] Admin dashboard
- [x] User dashboard
- [x] Audit logging
- [x] Security engine
- [x] AI assistant
- [x] Developer portal
- [x] Rate limiting
- [x] Responsive design

### In Progress 🚧
- [ ] WhatsApp bot integration
- [ ] Discord bot integration
- [ ] Mobile application (React Native)
- [ ] Desktop application (Electron/Tauri)

### Planned 📅
- [ ] Organization/team support
- [ ] Billing integration (Stripe)
- [ ] Advanced analytics
- [ ] Webhook marketplace
- [ ] Plugin system
- [ ] Multi-region deployment

---

## 📄 License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2026 Vanitas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

<div align="center">

<h3>Built with 💙 by the Vanitas Team</h3>

<p>
  <a href="https://vanitas-bot.vercel.app">Website</a> •
  <a href="https://vanitas-bot.vercel.app/api/">API</a> •
  <a href="https://vanitas-bot.vercel.app/docs">Docs</a> •
  <a href="https://github.com/sovereignempirex-ux/vanitas">GitHub</a>
</p>

<img src="https://i.postimg.cc/pXXcfjRk/Test.png" alt="Vanitas Visual" width="400" style="border-radius: 16px; margin-top: 20px;" />

</div>
