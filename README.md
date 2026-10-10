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
  <img src="https://img.shields.io/badge/Express-000000?logo=express&logoColor=white&style=flat-square" alt="Express" />
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

`AI_PROVIDER=pollinations` selects the free hosted model directly without a Gemini key. `AI_PROVIDER=ollama` uses your local model first and falls back to Pollinations if Ollama is unavailable. Gemini is optional and may be subject to provider quotas or pricing.

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
                         │   Optional DB + process-local mode  │
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
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS |
| **Backend** | Node.js, Express 4, TypeScript |
| **Database** | PostgreSQL (optional; in-memory mode for local use) |
| **Auth** | Server-managed sessions, scrypt passwords, OAuth 2.0, TOTP 2FA |
| **AI / ML** | **Python (FastAPI)** — `services/ai-service`; the TypeScript gateway delegates to it over HTTP and falls back to its own chain when it is unreachable |
| **Data Analysis** | **Python (+ optional R)** — `services/analytics`; percentiles, trends, anomalies and report exports, with a native TypeScript fallback |
| **Rate Limiting** | **Go** — `services/ratelimit`; one shared sliding-window bucket for every gateway instance, with the built-in TypeScript limiter as fallback |
| **Mobile (Android)** | **Kotlin** — `apps/android`; Gradle app (login, API keys, usage, local alerts) on the same gateway, with every decision unit-tested in a pure-JVM `:core` module |
| **Mobile (iOS)** | **Swift** — `apps/ios`; SwiftUI app on the same gateway, with the whole client/evaluator/store as a SwiftPM package (`VanitasCore`) tested by `swift test` and built by `xcodebuild` in CI |
| **Desktop** | **C# (.NET 10 + WPF)** — `apps/desktop`; Windows client on the same gateway with API keys, usage, a request log, CSV export and keyboard shortcuts, with every decision in a UI-free `Vanitas.Core` library tested by `dotnet test` |
| **Blockchain** | **Solidity (Foundry)** — `contracts/`; `VanitasCredit`, the on-chain credit ledger, authorised by off-chain EIP-712 signatures so any relayer can submit and the user pays no gas. Zero external dependencies, tested by `forge test` |
| **AI Providers** | Local Ollama, free Pollinations fallback, optional Gemini |
| **Hosting** | Vercel or Docker/Render (+ Docker Compose for the Python service) |

Each domain follows the platform's [language map](/languages): web → TypeScript,
AI/ML → Python, data analysis → Python/R, mobile → Kotlin (Android) and
Swift (iOS), desktop → C# (WPF), blockchain → Solidity (Foundry), databases → SQL,
servers → TypeScript/Python/Go/Java.

---

## ✨ Features

### 🔐 Authentication
- **OAuth 2.0** — Google, GitHub, Discord login
- **Email/Password** — Secure registration with validation
- **Session Management** — server-managed bearer sessions
- **Two-factor authentication** — TOTP authenticator codes
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
- Server request orders («طلب سيرفرات») — hosting intake queue with a pending → approved → delivered | rejected lifecycle, plan catalog CRUD and one-time track tokens

### 👤 User Dashboard
- Profile management (avatar, display name, bio)
- Publishing & sandbox previews with a real JS terminal console (streamed `console.*`/errors, in-page eval, phone-width)
- Security center (2FA, sessions, login history)
- API keys and usage
- Developer portal and documentation
- Activity feed and notifications
- Connected accounts management
- Account directory search and private messaging (real accounts only — never seeded)
- Embeddable server-order widget for third-party sites (`/embed/server-orders.js`, CORS `*` public API, accountless tracking page)

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
New account → USER by default → ADMIN only for addresses in ADMIN_EMAILS
```

> **Note:** Admin promotion is server-side. Add a trusted address to `ADMIN_EMAILS` before its first registration. Production account creation order never grants administrator privileges; isolated local tests may opt in with `ALLOW_FIRST_USER_ADMIN=true`.

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
# AI (ollama = local, pollinations = free hosted, gemini = optional)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2
GEMINI_API_KEY=

# Python AI microservice (services/ai-service) — leave AI_SERVICE_URL empty
# to keep using the built-in TypeScript chain
AI_SERVICE_URL=http://127.0.0.1:8100
AI_SERVICE_TOKEN=                # openssl rand -hex 32 (X-Internal-Token)

# Python analytics microservice (services/analytics) — leave
# ANALYTICS_SERVICE_URL empty to keep the built-in TypeScript analysis
ANALYTICS_SERVICE_URL=http://127.0.0.1:8200
ANALYTICS_SERVICE_TOKEN=         # openssl rand -hex 32 (X-Internal-Token)

# Go rate-limit microservice (services/ratelimit) — leave
# RATELIMIT_SERVICE_URL empty to keep the built-in per-IP limiter
RATELIMIT_SERVICE_URL=http://127.0.0.1:8300
RATELIMIT_SERVICE_TOKEN=         # openssl rand -hex 32 (X-Internal-Token)
RATELIMIT_SERVICE_TIMEOUT_MS=300 # per-decision budget before falling back

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
│       ├── aiService.ts      # AI chain + optional delegation to the Python service
│       ├── aiRemoteClient.ts # HTTP bridge to services/ai-service (AI_SERVICE_URL)
│       ├── analyticsNative.ts   # Fallback analysis + report (mirrors metrics.py)
│       ├── analyticsRemote.ts   # HTTP bridge to services/analytics (ANALYTICS_SERVICE_URL)
│       ├── rateLimitRemote.ts   # HTTP bridge to services/ratelimit (RATELIMIT_SERVICE_URL)
│       └── vercelEntry.ts    # Serverless wrapper → api/index.js
├── services/
│   ├── ai-service/           # Python (FastAPI): chat, streaming, diagnosis, search
│   │   ├── app/              # chain, prompts, providers, diagnosis, semantic
│   │   ├── tests/            # offline pytest suite (no network)
│   │   └── Dockerfile        # python:3.12-slim → uvicorn :8100
│   ├── analytics/            # Python (FastAPI + optional R): usage analysis
│   │   ├── app/              # metrics, report, charts, rbridge (R when installed)
│   │   ├── stats/trend.R     # base-R trend script — no CRAN packages
│   │   ├── tests/            # offline pytest suite (pinned clock)
│   │   └── Dockerfile        # python:3.12-slim → uvicorn :8200
│   └── ratelimit/            # Go: shared sliding-window rate limiter
│       ├── limiter.go        # bucket bookkeeping (mirrors security.ts)
│       ├── main.go           # stdlib-only HTTP API → :8300
│       ├── *_test.go         # offline go test ./...
│       └── Dockerfile        # golang:1.27-alpine → static binary
├── apps/
│   ├── android/              # Kotlin: login, API keys, usage, local alerts
│   │   ├── core/             # pure JVM module — 40 offline unit tests
│   │   │   ├── src/main/…    # Models, VanitasClient (Ktor), UsageEvaluator
│   │   │   └── src/test/…    # MockEngine suite (no server, no emulator)
│   │   ├── app/              # Android shell: activities, notifications, prefs
│   │   └── README.md         # Arabic guide (structure, API map, alert rules)
│   └── ios/                  # Swift: same features, SwiftUI
│       ├── Package.swift     # VanitasCore package — 42 offline `swift test`s
│       ├── Sources/…         # Models, VanitasClient (HTTPTransport), evaluator
│       ├── Tests/…           # scripted-transport suite (no server, no simulator)
│       ├── Vanitas/          # SwiftUI shell: views, notifications, prefs
│       ├── Vanitas.xcodeproj # hand-written project + shared scheme
│       └── README.md         # Arabic guide (structure, API map, alert rules)
│   └── desktop/              # C#: same features, WPF on Windows
│       ├── Vanitas.Core/     # UI-free library — 46 offline `dotnet test`s
│       │   ├── *.cs          # Models, VanitasClient (IHttpTransport), evaluator
│       │   └── …             # scripted-transport suite (no server, no window)
│       ├── Vanitas.Core.Tests/
│       ├── Vanitas.Desktop/  # WPF shell: views, shortcuts, request log, CSV
│       └── README.md         # Arabic guide (structure, API map, shortcuts)
├── contracts/                # Solidity: the on-chain credit ledger
│   ├── src/VanitasCredit.sol #   CREDIT/DEBIT/TRANSFER, off-chain EIP-712 auth
│   ├── test/…                #   35 offline Forge tests (98.8% line coverage)
│   ├── script/Deploy.s.sol   #   forge script — dry run needs no key, no RPC
│   ├── lib/forge-std/        #   vendored with --no-git (not a submodule)
│   └── README.md             # Arabic guide (design, deploy, EIP-712 reference)
├── scripts/                  # migrate.js, sql-check.mjs, e2e + smoke tests
├── supabase/schema.sql       # Canonical PostgreSQL schema (npm run db:migrate)
├── public/                   # Self-hosted static assets
├── .github/workflows/        # ci.yml (10 jobs: web, Python, Go, Kotlin, Swift,
│                             #          C#, Solidity, secret scan), codeql.yml
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
| `POST` | `/api/v1/auth/register` | Create an account (`ADMIN` only for addresses in `ADMIN_EMAILS`) | — |
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

### Server Requests — «طلب سيرفرات» (hosting request orders)

A queue of real hosting requests with a full lifecycle
(`pending → approved → delivered | rejected`), fed from two doors:

1. **Embeddable widget** — drop one script tag on *any* website:

   ```html
   <script src="https://YOUR-HOST/embed/server-orders.js"
           data-label="Request a Server"
           data-plan="spl_…"                 <!-- optional preselection -->
           data-position="bottom-left"       <!-- optional -->
           defer></script>
   ```

   It renders a floating button + panel in a closed shadow root (host
   CSS/JS cannot touch it), reads the public plan catalog, submits the
   form and shows the **one-time tracking token**. The embedding page
   can listen: `window.addEventListener('vanitas:server-request', e =>
   /* { id, status, planName, trackToken, trackPath } */)`, and drive
   it programmatically via `VanitasServers.open() / .close() /
   .track(token)`.

2. **Public API** (no auth, `Access-Control-Allow-Origin: *`,
   rate-limited, honeypot + validation on submit):

   | Method | Endpoint | Description |
   |--------|----------|-------------|
   | `GET` | `/api/v1/servers/plans` | Active plan catalog (`?all=1` = admin) |
   | `POST` | `/api/v1/servers/requests` | Submit an anonymous request |
   | `GET` | `/api/v1/servers/requests/track/:token` | Status by track token |

   `POST` answers `201` with `trackToken` **exactly once** — only its
   sha256 is stored, so a DB dump cannot re-derive it. The token
   unlocks `/embed/track.html?token=…` (accountless status page:
   status, review note, and — only after delivery — host/port/user/
   credentials). A `website` honeypot field and a 15/min per-IP budget
   keep bots out of the queue.

**Admin side (Dashboard → Admin Center → Server Requests):** review the
queue, attach a review note, approve/reject, and mark deliveries with
the real connection details (a delivery without a host is rejected
server-side). The plan catalog (`server_plans`) is authored here too —
requests snapshot `plan_name`, so editing or deleting a plan never
re-writes history. Every admin action is audit-logged
(`SERVER_REQUEST_*`, category `ADMIN`); anonymous submissions are not
(disclosure/flood hygiene).

**Sandbox console:** every sandboxed preview (`/publish/…/preview`)
now hosts a **SANDBOX TERMINAL** — a real JS console driven against the
previewed page (`console.*`, errors and unhandled rejections stream up
from an injected `/embed/sandbox-bridge.js`; evaluate code in the
page's global scope, refresh, flip to phone width). The preview
wrapper's scripts are external files so the platform's
`script-src 'self'` CSP stays intact; `vercel.json` relaxes CSP for
preview responses only.

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
| `GET` | `/api/v1/servers/plans` | Public server plan catalog (CORS `*`) |
| `POST` | `/api/v1/servers/requests` | Submit a server request (CORS `*`, honeypot) |
| `GET` | `/api/v1/servers/requests/track/:token` | Track a request by its one-time token (CORS `*`) |
| `GET` | `/api/v1/servers/requests` | The intake queue, filterable by status | ADMIN |
| `PATCH` | `/api/v1/servers/requests/:id` | Approve/reject/deliver with hand-off details | ADMIN |
| `GET/POST` | `/api/v1/servers/plans[?all=1]` | Plan catalog (public active / admin all) | ADMIN* |
| `PATCH/DELETE` | `/api/v1/servers/plans/:id` | Edit or remove a plan | ADMIN |

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
| Server Orders | Plan CRUD, submit validation, honeypot, track token, admin lifecycle, embed files, sandbox console |
| Audit Logs | Pagination, filters, CSV export |
| Security | Unauthorized requests, rate limits |
| AI Service (Python) | Prompts/project mode, provider chain + fallback, pollinations breakers, local diagnosis analyzer, semantic scoring, YouTube parser |
| Smart contract (Solidity) | EIP-712 authorisation, replay/nonces, wrong-signer and wrong-domain rejection, atomic batches, pause, ownership — 35 Forge tests, 98.8% line coverage |

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

# Python AI service (offline, no network): cd services/ai-service && pytest -q
# Python analytics service (offline, pinned clock): npm run analytics:test
# Go rate-limit service (offline): npm run ratelimit:test
# Android app (offline Kotlin suite; needs a JDK 17+): npm run android:test
# iOS app (structural checks, no macOS needed): npm run ios:check
# iOS logic tests (needs a Swift toolchain): cd apps/ios && swift test
# Desktop app (offline .NET suite; needs the .NET 10 SDK): npm run desktop:test
# Desktop app tests + WPF build: npm run desktop:build
# Smart contract (offline Forge suite, in-process EVM; needs Foundry):
npm run contracts:test
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
