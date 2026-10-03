import React, { useState } from 'react';
import { BRAND_ASSETS } from '../data/assets.ts';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Check,
  ChevronRight,
  Copy,
  KeyRound,
  Lock,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Terminal,
  Webhook,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Public marketing homepage — the FIRST thing a signed-out visitor sees at "/".
// Every claim below maps to a shipped, server-enforced feature: no invented
// metrics, no fake logos, no placeholder testimonials. Auth stays one click
// away (/login, /register — the only auth routes the server rewrites).
// ---------------------------------------------------------------------------

const API_BASE = 'https://vanitas-bot.vercel.app/api/v1';

const CURL_SNIPPET = `curl ${API_BASE}/public/ping \\
  -H "x-api-key: vnt_live_your_key_here"`;

const PING_RESPONSE = `{
  "ok": true,
  "key": { "id": "key_live_…", "scopes": ["api.read"] },
  "serverTime": "2026-10-03T20:00:00.000Z"
}`;

interface Feature {
  icon: React.ReactNode;
  title: string;
  arabic: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: 'Streaming AI Copilot',
    arabic: 'مساعد ذكي بردود متدفقة',
    body: 'Typewriter-paced answers with code diagnosis, site-aware guidance about this very platform, and full Arabic + English support.',
  },
  {
    icon: <KeyRound className="h-5 w-5" />,
    title: 'Scoped API Keys',
    arabic: 'مفاتيح API بنطاقات صلاحيات',
    body: 'Mint, rotate and revoke keys with server-enforced scopes, per-key rate limits, burst control and monthly quotas.',
  },
  {
    icon: <Webhook className="h-5 w-5" />,
    title: 'Signed Webhooks',
    arabic: 'Webhooks موقّعة وموثّقة',
    body: 'HMAC-SHA256 signed deliveries with timeouts, retry-safe logs and owner-scoped endpoints you can verify yourself.',
  },
  {
    icon: <Bot className="h-5 w-5" />,
    title: 'Bot Gateway',
    arabic: 'بوابة أوامر الروبوتات',
    body: 'Dispatch WhatsApp, Discord and Telegram commands through one audited gateway with scoped keys.',
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: 'Hardened Auth',
    arabic: 'هوية محمية متعددة الطبقات',
    body: 'scrypt password hashing, TOTP two-factor with replay protection, OAuth 2.0 sign-in and a full session inventory.',
  },
  {
    icon: <ScrollText className="h-5 w-5" />,
    title: 'Immutable Audit Trail',
    arabic: 'سجل تدقيق غير قابل للتعديل',
    body: 'Every login, key rotation, role change and invite is written to a durable PostgreSQL audit log.',
  },
  {
    icon: <Terminal className="h-5 w-5" />,
    title: 'Playground & Docs',
    arabic: 'مختبر تفاعلي وتوثيق',
    body: 'A live REST console with instant responses, plus guides for authentication, scopes, endpoints and error codes.',
  },
  {
    icon: <BadgeCheck className="h-5 w-5" />,
    title: 'Badges, Invites & Profiles',
    arabic: 'شارات ودعوات وملفات عامة',
    body: 'Three-tier verification badges, encrypted developer invites and shareable @username profile pages.',
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: 'Every Platform',
    arabic: 'كل المنصات',
    body: 'One gateway for web, bots, mobile and desktop — with native APK, Windows, macOS and Linux builds.',
  },
];

const TRUST_CHIPS = [
  'scrypt + TOTP 2FA',
  'OAuth 2.0',
  'HMAC-signed webhooks',
  'Per-IP rate limits',
  'PostgreSQL-backed audit',
  'Arabic + English AI',
];

const SECURITY_POINTS = [
  'Passwords hashed with scrypt — never stored in plain text',
  'TOTP two-factor with one-time code replay protection',
  'Session inventory with scoped revoke and password-rotation flush',
  'Invite tokens encrypted at rest (AES-256-GCM), looked up by SHA-256',
  'SSRF-guarded outbound fetches and per-IP rate limiting',
  'Owner-scoped API key, webhook and analytics access — enforced server-side',
];

const STEPS = [
  {
    n: '01',
    title: 'Create your account',
    arabic: 'أنشئ حسابك',
    body: 'Email and password, or continue with Google, Discord and GitHub. Takes seconds.',
    href: '/register',
    cta: 'Create account',
  },
  {
    n: '02',
    title: 'Mint an API key',
    arabic: 'أنشئ مفتاح API',
    body: 'Pick scopes, a rate limit and a monthly quota in the console — the secret shows exactly once.',
    href: '/login',
    cta: 'Open console',
  },
  {
    n: '03',
    title: 'Call the gateway',
    arabic: 'استدعِ البوابة',
    body: 'Send your first authenticated request and get a signed, audited JSON answer back.',
    href: '/register',
    cta: 'Start now',
  },
];

export const LandingPage: React.FC = () => {
  const [copied, setCopied] = useState<'curl' | null>(null);

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(CURL_SNIPPET);
      setCopied('curl');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable — the snippet stays selectable */
    }
  };

  return (
    <div className="min-h-screen vnt-app-bg text-slate-100 flex flex-col">
      {/* ================= Navbar ================= */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-slate-950/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3.5">
          <a href="/" className="flex items-center gap-2 group">
            <img
              src={BRAND_ASSETS.logo}
              alt="Vanitas"
              className="h-7 w-7 object-contain drop-shadow-[0_0_10px_rgba(56,189,248,0.55)]"
            />
            <span className="font-display font-bold tracking-widest text-sm text-white group-hover:text-cyan-300 transition-colors">
              VANITAS
            </span>
          </a>

          <div className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
            <a href="#features" className="hover:text-cyan-300 transition-colors">
              Features <span className="text-slate-600">المميزات</span>
            </a>
            <a href="#start" className="hover:text-cyan-300 transition-colors">
              Quick start
            </a>
            <a href="#security" className="hover:text-cyan-300 transition-colors">
              Security
            </a>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/login"
              className="rounded-xl border border-white/10 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-400/40 hover:text-white transition-all"
            >
              Sign in
            </a>
            <a
              href="/register"
              className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-700/25 hover:from-blue-500 hover:to-cyan-500 transition-all"
            >
              Get started
            </a>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* ================= Hero ================= */}
        <section className="relative overflow-hidden">
          {/* Ambient glows */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[520px] w-[720px] rounded-full bg-gradient-to-tr from-cyan-600/15 via-blue-600/12 to-purple-600/12 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24 pb-16 grid lg:grid-cols-2 gap-12 items-center vnt-fade-up">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-mono text-cyan-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                API • AI • Security — one console
              </div>

              <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold leading-[1.08] tracking-tight">
                <span className="vnt-gradient-text">One gateway</span> for every app you build.
              </h1>

              <p className="mt-4 text-sm sm:text-base leading-relaxed text-slate-300 max-w-xl">
                Vanitas connects your website, bots, mobile and desktop clients through a single
                secure API — scoped keys, signed webhooks, live audit logs and a site-aware AI
                copilot.
              </p>
              <p className="mt-2 text-sm text-slate-400" dir="rtl" lang="ar">
                بوابة موحّدة وآمنة لموقعك وبوتاتك وتطبيقاتك — مفاتيح بصلاحيات، سجل تدقيق حيّ،
                ومساعد ذكي بالعربية والإنجليزية.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a
                  href="/register"
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-700/30 hover:opacity-95 transition-all"
                >
                  Create free account
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#features"
                  className="flex items-center gap-1.5 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-slate-200 hover:border-cyan-400/40 hover:text-white transition-all"
                >
                  Explore features
                  <ChevronRight className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                {TRUST_CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono text-slate-400"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* Terminal card — a REAL endpoint, honest about needing a key */}
            <div className="rounded-2xl border border-white/12 bg-[#070b16]/90 shadow-[0_25px_70px_rgba(0,0,0,0.55)] overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                </div>
                <span className="font-mono text-[10px] text-slate-500">bash — vanitas gateway</span>
                <button
                  type="button"
                  onClick={copyCurl}
                  className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-400 hover:border-cyan-400/40 hover:text-cyan-300 transition-all"
                  aria-label="Copy curl command"
                >
                  {copied === 'curl' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied === 'curl' ? 'Copied' : 'Copy'}
                </button>
              </div>

              <pre className="px-4 py-4 font-mono text-[11px] leading-relaxed text-slate-300 overflow-x-auto">
                <code>
                  <span className="text-emerald-400">$</span> curl <span className="text-cyan-300">{API_BASE}/public/ping</span> {' \\'}
                  {'\n    '}<span className="text-amber-200">-H</span> <span className="text-slate-400">"x-api-key: vnt_live_your_key_here"</span>
                </code>
              </pre>

              <div className="border-t border-white/10 bg-black/30 px-4 py-3">
                <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">Response</p>
                <pre className="font-mono text-[11px] leading-relaxed text-emerald-300/90 overflow-x-auto">
                  <code>{PING_RESPONSE}</code>
                </pre>
              </div>

              <p className="border-t border-white/10 px-4 py-2.5 text-[10px] text-slate-500">
                Real endpoint — keys are minted in the console and shown exactly once.
              </p>
            </div>
          </div>
        </section>

        {/* ================= Features ================= */}
        <section id="features" className="border-t border-white/[0.06] scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
            <div className="text-center max-w-2xl mx-auto">
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-cyan-400">Features</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Everything a production integration needs
              </h2>
              <p className="mt-3 text-sm text-slate-400" dir="rtl" lang="ar">
                كل ما يحتاجه تكاملك في الإنتاج — من المفتاح إلى سجل التدقيق.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="crystal-card crystal-card-interactive rounded-2xl p-5 group"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-400/25 text-cyan-300 group-hover:bg-cyan-500/15 transition-colors">
                    {f.icon}
                  </div>
                  <h3 className="mt-3.5 text-sm font-bold text-white">{f.title}</h3>
                  <p className="text-[11px] text-cyan-400/80" dir="rtl" lang="ar">
                    {f.arabic}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= Quick start ================= */}
        <section id="start" className="border-t border-white/[0.06] scroll-mt-20 bg-slate-950/40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
            <div className="text-center max-w-2xl mx-auto">
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-cyan-400">Quick start</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white">
                From zero to first request in three steps
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
              {STEPS.map((s) => (
                <div key={s.n} className="relative rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                  <span className="font-mono text-2xl font-bold text-cyan-500/30">{s.n}</span>
                  <h3 className="mt-2 text-sm font-bold text-white">{s.title}</h3>
                  <p className="text-[11px] text-cyan-400/80" dir="rtl" lang="ar">
                    {s.arabic}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{s.body}</p>
                  <a
                    href={s.href}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    {s.cta} <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= Security ================= */}
        <section id="security" className="border-t border-white/[0.06] scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20 grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-cyan-400">Security</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Enforced on the server, not the dashboard
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                Every rule below lives behind the API itself — a modified client cannot talk its way
                past any of it.
              </p>
              <p className="mt-1.5 text-sm text-slate-400" dir="rtl" lang="ar">
                كل هذه الحماية مفروضة على الخادم — لا يمكن تجاوزها من الواجهة.
              </p>

              <a
                href="/register"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-700/25 hover:opacity-95 transition-all"
              >
                Create your account <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            <ul className="space-y-3">
              {SECURITY_POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-400/30">
                    <Check className="h-3 w-3 text-emerald-400" />
                  </span>
                  <span className="text-xs leading-relaxed text-slate-300">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ================= Final CTA ================= */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20 text-center">
            <div className="mx-auto max-w-2xl rounded-3xl border border-cyan-400/20 crystal-card p-8 sm:p-10">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl crystal-gem">
                <Lock className="h-7 w-7 text-cyan-200" />
              </div>
              <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Ready to route your first request?
              </h2>
              <p className="mt-3 text-sm text-slate-400" dir="rtl" lang="ar">
                أنشئ حسابك وابدأ أول طلب خلال دقائق.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <a
                  href="/register"
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-700/30 hover:opacity-95 transition-all"
                >
                  Get started free <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/login"
                  className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-slate-200 hover:border-cyan-400/40 hover:text-white transition-all"
                >
                  Sign in
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ================= Footer ================= */}
      <footer className="border-t border-white/[0.06] bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={BRAND_ASSETS.logo} alt="" aria-hidden="true" className="h-6 w-6 object-contain" />
              <span className="font-display font-bold tracking-widest text-xs text-slate-300">VANITAS</span>
              <span className="text-xs text-slate-500">• Centralized API &amp; Intelligence Platform</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <a href="#features" className="hover:text-cyan-300 transition-colors">Features</a>
              <a href="#security" className="hover:text-cyan-300 transition-colors">Security</a>
              <a href="/login" className="hover:text-cyan-300 transition-colors">Sign in</a>
              <a href="/register" className="hover:text-cyan-300 transition-colors">Create account</a>
            </div>
          </div>
          <p className="mt-4 text-center font-mono text-[10px] text-slate-600">
            Ingress: {API_BASE} — registered developers only
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
