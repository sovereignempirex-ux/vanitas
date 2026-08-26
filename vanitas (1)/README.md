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

- Node.js 18+
- npm or yarn
- Supabase account
- Redis (Upstash recommended)
- OAuth app credentials (Google, GitHub, Discord)

### Installation

```bash
# Clone the repository
git clone https://github.com/sovereignempirex-ux/vanitas.git
cd vanitas

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Run database migrations
npx supabase migration up

# Start development server
npm run dev
```

### Build for Production

```bash
npm run build
npm start
```

### Run Tests

```bash
npm run test
npm run test:e2e
```

---

## 🔧 Environment Variables

Create a `.env.local` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret

# Redis (Upstash)
REDIS_URL=redis://your-redis-url

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# App
NEXT_PUBLIC_APP_URL=https://vanitas-bot.vercel.app
APP_SECRET=your-app-secret-min-32-chars
```

> **⚠️ Security Warning:** Never commit `.env.local` to version control. Use Vercel environment variables for production.

---

## 📁 Project Structure

```
vanitas/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Auth routes (login, register, callback)
│   │   ├── (dashboard)/        # User dashboard
│   │   ├── admin/              # Admin center
│   │   ├── api/                # API routes
│   │   │   ├── v1/             # API v1 endpoints
│   │   │   ├── auth/           # Auth callbacks
│   │   │   └── webhooks/       # Webhook handlers
│   │   ├── ai/                 # AI assistant interface
│   │   ├── docs/               # Developer documentation
│   │   └── layout.tsx          # Root layout
│   ├── components/             # Reusable UI components
│   │   ├── ui/                 # Base UI primitives
│   │   ├── auth/               # Auth-related components
│   │   ├── admin/              # Admin dashboard components
│   │   ├── dashboard/          # User dashboard components
│   │   ├── api-keys/           # API key management
│   │   ├── security/           # Security center components
│   │   └── ai/                 # AI assistant components
│   ├── lib/                    # Utilities and helpers
│   │   ├── supabase/           # Supabase client & server
│   │   ├── auth/               # Auth utilities
│   │   ├── api/                # API client
│   │   ├── permissions/        # Permission checks
│   │   ├── security/           # Security engine
│   │   └── ai/                 # AI integration
│   ├── hooks/                  # Custom React hooks
│   ├── types/                  # TypeScript type definitions
│   ├── styles/                 # Global styles
│   └── middleware.ts           # Next.js middleware (auth, rate limit)
├── supabase/
│   ├── migrations/             # Database migrations
│   ├── functions/              # Edge functions
│   └── policies/               # RLS policies
├── public/                     # Static assets
├── tests/                      # Test suites
├── .env.example                # Environment template
├── next.config.js              # Next.js configuration
├── tailwind.config.ts          # Tailwind CSS configuration
├── tsconfig.json               # TypeScript configuration
└── package.json
```

---

## 🔌 API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/providers` | List OAuth providers |
| `GET` | `/api/auth/callback/[provider]` | OAuth callback |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/auth/session` | Get current session |

### Users

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/v1/users/me` | Get current user | API Key |
| `GET` | `/api/v1/users` | List users | Admin |
| `GET` | `/api/v1/users/:id` | Get user by ID | Admin |
| `PATCH` | `/api/v1/users/:id` | Update user | Admin |
| `DELETE` | `/api/v1/users/:id` | Delete user | Admin |

### API Keys

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/v1/keys` | List API keys | API Key |
| `POST` | `/api/v1/keys` | Create API key | API Key |
| `PATCH` | `/api/v1/keys/:id` | Update key scopes | API Key |
| `POST` | `/api/v1/keys/:id/rotate` | Rotate key | API Key |
| `DELETE` | `/api/v1/keys/:id` | Revoke key | API Key |

### Admin

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/v1/admin/stats` | Platform statistics | Admin |
| `GET` | `/api/v1/admin/logs` | Audit logs | Admin |
| `GET` | `/api/v1/admin/logs/export` | Export CSV | Admin |
| `GET` | `/api/v1/admin/health` | System health | Admin |

### AI

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/v1/ai/chat` | AI assistant chat | API Key |
| `POST` | `/api/v1/ai/code` | Code assistant | API Key |
| `POST` | `/api/v1/ai/search` | Web search | API Key |

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
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Type checking
npm run typecheck

# Linting
npm run lint

# Full verification
npm run verify
```

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
