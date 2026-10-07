# Vanitas — Brand Identity

The single source of truth for how Vanitas is named, drawn and written.
If you are adding a page, a badge, an email or a slide, start here.

---

## 1. The name

| | |
|---|---|
| **Product name** | **Vanitas** — always capitalised, one word |
| **Never** | `Vanita`, `VANITAS App`, `The Vanitas`, `vanitas.io` |
| **Lowercase `vanitas`** | allowed only in code, URLs, package names and storage keys |
| **Short form** | `VNT` — reserved for internal prefixes (CSS `.vnt-*`, storage `vanitas_*`) |
| **Legal / repo** | `sovereignempirex-ux/vanitas` |

### Taglines

| Use | Line |
|---|---|
| **Primary** (hero, cards, `og:title`) | **Centralized API & Security Engine** |
| Secondary (feature lists) | One unified gateway for web, bots, mobile and desktop |
| Technical (API docs) | Scoped keys, per-key rate limits, webhooks, audit logs and an AI copilot |

The full boilerplate sentence used in `index.html` metadata:

> Vanitas is a centralized platform connecting website, bot, mobile, and desktop
> applications through a unified secure API — scoped keys, rate limits, webhooks,
> audit logs and a site-aware AI copilot.

---

## 2. Logo

The mark is a **faceted gem** — six cut planes reading as a crystal. It stands for
layered protection: every facet is a different control (auth, scopes, rate limits,
webhooks, audit, AI) around one solid core.

### Assets

| File | Variant | Use on |
|---|---|---|
| [`public/images/logo.svg`](public/images/logo.svg) | **Primary**, full colour | Dark surfaces — app header, favicon, README |
| [`public/images/logo-mono.svg`](public/images/logo-mono.svg) | **Mono**, white ink | One-colour contexts, footers, print, watermarks |

Both are 64×64 viewBox and scale without loss.

### Rules

- **Clear space** — keep at least half the mark's height free on every side.
- **Minimum size** — 24 px on screen; below that the inner facets close up.
- **Backgrounds** — primary only on dark (`#05070e` … `#0f172a`). On light
  backgrounds use `logo-mono.svg` tinted to `#05070e`.
- **Never** recolour the gem to amber/red, rotate it, add a drop shadow outside
  the app's own glow, outline the container, or place it inside a shape badge.

### Don't

| ❌ | Why |
|---|---|
| Re-hosting the logo on an image CDN | Third-party hosts can swap the asset (supply chain) — the app deliberately self-hostes every icon |
| Using `overview-hero.jpg` as the logo | It is a decorative photo, not brand artwork |
| Stretching to a non-square box | The gem must stay regular-hexagonal |

---

## 3. Colour

Defined once in [`src/index.css`](src/index.css) as `--vnt-*` tokens.

### Surfaces

| Token | Value | Role |
|---|---|---|
| `--vnt-bg` | `#05070e` | **Void** — page background (canonical; `index.html` body uses `#060913` for the first paint) |
| `--vnt-surface` | `rgba(13, 20, 38, 0.72)` | Glass panels, cards, drawers |
| `--vnt-border` | `rgba(148, 163, 184, 0.14)` | Hairlines, dividers, card edges |

### Accents

| Token | Value | Role |
|---|---|---|
| `--vnt-accent` | `#60a5fa` | **Azure** — links, focus rings, active chrome, data series |
| `--vnt-accent-2` | `#22d3ee` | **Cyan** — live/online states, secondary series, the gradient's end stop |
| Primary button | `linear-gradient(135deg, #2563eb → #0891b2)` | Every primary CTA |
| Heading gradient | `linear-gradient(100deg, #93c5fd → #67e8f9 45% → #dbeafe)` | Display headlines |

### The gem

| Stop | Value |
|---|---|
| Body | `#7dd3fc` → `#2563eb` → `#1e3a8a` |
| Facet light | `#e0f2fe` → `#38bdf8` |
| Outline | `#38bdf8` |

### Signal (restricted)

| Value | Meaning |
|---|---|
| `amber-400 #fbbf24` / `amber-500 #f59e0b` | **Admin & critical only** — Admin Control Center nav, warnings, `CRITICAL` badges |

> **Rule:** amber never appears outside an admin or destructive context, and is
> never used for a primary CTA. Azure/cyan own all product chrome; amber is the
> alarm. Red is reserved for irreversible actions and failed states.

### Text

| Use | Value |
|---|---|
| Headings | `#eff6ff` |
| Body | `#e2e8f0` |
| Muted / labels | `#94a3b8` |
| Code | `#7dd3fc` |

### Ratios

Roughly **70 % void · 20 % surface · 8 % accent · 2 % signal.** If a screen
needs more than ~10 % accent area, it is too loud.

---

## 4. Typography

Loaded in [`index.html`](index.html).

| Role | Family | Weights | Where |
|---|---|---|---|
| **Display / wordmark** | **Cinzel** (`.font-display`) | 500 · 700 · 900 | `VANITAS` wordmark, page titles, hero |
| **Interface** | **Plus Jakarta Sans** | 300 – 800 | Everything else — body, buttons, tables |
| **Code & labels** | **JetBrains Mono** | 400 · 500 · 600 | Code, API keys, eyebrows, badges, `tracking-widest` labels |

- Cinzel is **only** for the wordmark and top-level display text. Never in
  paragraphs, buttons or tables — it is a carved-stone face and reads badly small.
- Eyebrow labels are `JetBrains Mono`, uppercase, `tracking-widest`, ~10–11 px.
- Never introduce a fourth family.

---

## 5. Voice & tone

**We write like the engineer who built it, talking to the engineer using it.**

- **Precise over clever.** "Revokes the session", not "Say goodbye to sessions 👋".
- **Second person, present tense, active voice.** "Set `DATABASE_URL`" — not
  "The `DATABASE_URL` variable should be configured".
- **No superlatives.** Avoid *blazing*, *revolutionary*, *seamless*, *enterprise-grade*.
  State the property and let the reader judge.
- **Numbers beat adjectives.** "5 failures → 5-minute lockout" beats "brute-force protected".
- **En-US** for product copy. Code identifiers stay English regardless of docs
  language; Arabic docs keep code, identifiers and commands untranslated.
- **Emojis** — functional only (✅/❌ in checklists, ⚠️ for warnings). Never in
  headings, buttons or product UI.

---

## 6. Code conventions

| Thing | Convention | Example |
|---|---|---|
| CSS utilities | `.vnt-` prefix | `.vnt-btn-primary` |
| Local storage | `vanitas_*` | `vanitas_auth_token` |
| Public env vars | `VITE_` prefix only | `VITE_API_BASE_URL` |
| Secret env vars | no prefix, never `VITE_`/`NEXT_PUBLIC_` | `DATABASE_URL`, `INVITE_ENC_KEY` |
| API surface | `/api/v1/<noun>[/<id>][/verb]` | `/api/v1/api-keys/:id/rotate` |
| Scopes | `<domain>.<verb>` | `keys.revoke`, `security.manage` |
| Webhook events | `<noun>.<past-tense-verb>` | `key.rotated`, `key.revoked` |
| Audit categories | lowercase snake plural | `api_keys`, `admin_actions` |
| Route handlers | `async` + the `wrap()` helper | Express 4 does not catch rejections |

---

## 7. Imagery

- **Self-hosted only.** No image CDN, font CDN call at runtime for icons, or
  remote avatars in critical chrome — anything served to users must live in
  `public/`.
- **Dark, cool, low-contrast.** Photographs are texture, never the subject
  (`auth-bg.jpg`, `docs-banner.jpg`, `overview-hero.jpg` are backgrounds only —
  **do not present them as product screenshots**).
- **Charts** use the accent ramp first (`#60a5fa`, `#22d3ee`); amber only for a
  series that is genuinely a warning.
- **Social cards** must be generated from this document so the typeface and
  palette match; keep 1200 × 630 and the bottom gradient rule.

---

## 8. Quick checklist

- [ ] Logo from `public/images/`, never a third-party host
- [ ] `#05070e` background, azure/cyan accents, amber **only** for admin/critical
- [ ] Cinzel for the wordmark, Plus Jakarta Sans for UI, JetBrains Mono for code
- [ ] Copy is concrete, second person, no hype
- [ ] `.vnt-` / `vanitas_*` / `/api/v1/` / `<domain>.<verb>` conventions respected
- [ ] No secret ever prefixed `VITE_`
