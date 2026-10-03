import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../lib/apiClient.ts';
import { BRAND_ASSETS } from '../data/assets.ts';
import { Mail, Lock, UserPlus, ArrowRight, Shield, Loader2, Link2 } from 'lucide-react';
import { VerifiedBadge } from '../components/VerifiedBadge.tsx';

// ---------------------------------------------------------------------------
// Standalone auth pages served at /register and /login (shareable links).
// Social buttons hit the real OAuth flow — they light up automatically once
// <PROVIDER>_CLIENT_ID / <PROVIDER>_CLIENT_SECRET are added in Vercel.
// ---------------------------------------------------------------------------

type AuthPageMode = 'login' | 'register';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  not_configured: "This sign-in method isn't configured yet — add its keys in Vercel (see DEPLOY_AR.md).",
  invalid_state: 'Sign-in session expired or was tampered with — please try again.',
  provider_denied: 'The provider denied the request — please try again.',
  provider_failed: 'Sign-in failed at the provider — please try again.',
  unknown_provider: 'Unknown sign-in provider.',
  storage: 'Auth storage unavailable — run npm run db:migrate first.',
};

const DiscordIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const GoogleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.27 14.29a7.16 7.16 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
  </svg>
);

const GitHubIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.12-.31-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.18.77.84 1.24 1.91 1.24 3.23 0 4.63-2.81 5.65-5.49 5.95.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
  </svg>
);

const SOCIALS: Array<{ id: string; label: string; Icon: React.FC<{ className?: string }> }> = [
  { id: 'google', label: 'Google', Icon: GoogleIcon },
  { id: 'github', label: 'GitHub', Icon: GitHubIcon },
  { id: 'discord', label: 'Discord', Icon: DiscordIcon },
];

interface AuthPageProps {
  mode: AuthPageMode;
  /** Developer invite being redeemed — its token rides along with register. */
  invite?: {
    token: string;
    creatorName: string;
    role: string;
    verification?: string;
    note?: string;
    expiresAt?: string;
  };
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode, invite }) => {
  const { loginWithEmail, completeOAuthLogin, completeTwoFactorLogin, user, authLoading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Real 2FA step: server answered twoFactorRequired (password flow, state
  // undefined) or an OAuth callback paused with #vnt_2fa=<signed challenge>.
  const [twoFactor, setTwoFactor] = useState<{ state?: string } | null>(null);
  const [twoCode, setTwoCode] = useState('');
  const [providers, setProviders] = useState<Record<string, boolean>>({});
  const [providersLoaded, setProvidersLoaded] = useState(false);

  // Which social buttons are live?
  useEffect(() => {
    api
      .getProviders()
      .then((r) => setProviders(r.providers || {}))
      .catch(() => setProviders({}))
      .finally(() => setProvidersLoaded(true));
  }, []);

  // Read the OAuth callback fragment EXACTLY once (and scrub it from the URL
  // immediately so a session token never lingers in history), but defer any
  // decision until the real session state is known.
  const pendingFragment = useRef<{ token?: string; twoFaState?: string; oauthError?: string } | 'none' | 'unread'>('unread');

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) {
      pendingFragment.current = 'none';
      return;
    }
    const params = new URLSearchParams(hash);
    pendingFragment.current = {
      token: params.get('vnt_oauth') || undefined,
      twoFaState: params.get('vnt_2fa') || undefined,
      oauthError: params.get('vnt_error') || undefined,
    };
    // Clear the fragment from history immediately — the token must not linger.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  // Consume the pending fragment only after the initial /auth/me check has
  // finished. Adopting a token while the visitor is already signed in would
  // be session fixation (an attacker could log victims INTO the attacker's
  // account by handing them a link), and adopting during the check would
  // race it. The token shape is validated too — only server-minted
  // `vnt_sess_` tokens are ever sent to the API.
  useEffect(() => {
    const pending = pendingFragment.current;
    if (pending === 'unread' || pending === 'none') return;
    if (authLoading) return;
    pendingFragment.current = 'none'; // consume exactly once
    if (pending.token) {
      const shapeOk = /^vnt_sess_[A-Za-z0-9_-]{40,}$/.test(pending.token);
      if (user) return; // already signed in — ignore the injected token, keep our session
      if (!shapeOk) {
        setError(OAUTH_ERROR_MESSAGES.provider_failed);
        return;
      }
      setLoading(true);
      completeOAuthLogin(pending.token)
        .then(() => window.location.assign('/'))
        .catch(() => {
          setError(OAUTH_ERROR_MESSAGES.provider_failed);
          setLoading(false);
        });
    } else if (pending.twoFaState) {
      // OAuth sign-in paused for the account's real TOTP code (HMAC-signed
      // server-side — a forged value is rejected there).
      setTwoFactor({ state: pending.twoFaState });
    } else if (pending.oauthError) {
      setError(OAUTH_ERROR_MESSAGES[pending.oauthError] || OAUTH_ERROR_MESSAGES.provider_failed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const startOAuth = (provider: string) => {
    setError(null);
    if (!providersLoaded) return;
    if (!providers[provider]) {
      setError(OAUTH_ERROR_MESSAGES.not_configured);
      return;
    }
    setLoading(true);
    window.location.href = `/api/v1/social/${provider}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register' && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const result = await loginWithEmail(
        email,
        password,
        mode,
        mode === 'register' ? name : undefined,
        undefined,
        mode === 'register' ? invite?.token : undefined,
      );
      if (!result.success) {
        if (result.twoFactorRequired) {
          // Real 2FA — password accepted, now ask for the authenticator code.
          setTwoFactor({});
          setTwoCode('');
          setError(null);
          return;
        }
        setError(result.error || 'Authentication failed');
        return;
      }
      window.location.assign('/');
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(twoCode)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = twoFactor?.state
        ? await completeTwoFactorLogin(twoFactor.state, twoCode)
        : await loginWithEmail(email, password, 'login', undefined, twoCode);
      if (!result.success) {
        setError(result.error || 'Invalid code');
        return;
      }
      window.location.assign('/');
    } catch (err: any) {
      setError(err?.message || 'Two-factor verification failed');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-slate-900/60 py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none';

  return (
    <div className="min-h-screen vnt-app-bg text-slate-100 flex flex-col relative overflow-hidden">
      {/* Real photographic backdrop (bundled in /public/images) */}
      <img
        src="/images/auth-bg.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-25 pointer-events-none"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/90 to-slate-950/95 pointer-events-none" />

      {/* Background crystal glow */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[560px] h-[560px] bg-gradient-to-tr from-cyan-600/15 via-blue-600/15 to-purple-600/15 rounded-full blur-3xl animate-crystal-pulse" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4">
        <a href="/" className="flex items-center gap-2 group">
          <img src={BRAND_ASSETS.logo} alt="Vanitas" className="h-7 w-7 object-contain drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]" />
          <span className="font-display font-bold tracking-widest text-sm text-white group-hover:text-cyan-300 transition-colors">VANITAS</span>
        </a>
        <a href="/" className="text-xs text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1">
          <ArrowRight className="h-3 w-3 rotate-180" /> Home <span dir="rtl">الرئيسية</span>
        </a>
      </header>

      {/* Auth card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md rounded-3xl border border-white/15 crystal-card p-6 sm:p-8 shadow-[0_0_60px_rgba(56,189,248,0.15)] vnt-fade-up">
          {/* Brand header */}
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl crystal-gem">
              <img src={BRAND_ASSETS.logo} alt="Vanitas" className="h-9 w-9 object-contain drop-shadow-[0_0_12px_rgba(56,189,248,0.7)]" />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <h1 className="font-display text-xl font-bold tracking-wider text-white">VANITAS INGRESS</h1>
              <span className="crystal-badge px-2 py-0.5 rounded text-[10px] font-mono">CRYSTAL SECURE</span>
            </div>
            <p className="mt-1 text-xs text-slate-300">
              {mode === 'register' ? 'أنشئ حسابك • Create your account' : 'أهلاً بعودتك • Welcome back'}
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">{error}</div>
          )}

          {/* Developer invite banner — exactly what this private link grants */}
          {invite && mode === 'register' && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-100">
              <div className="flex items-center gap-1.5 font-semibold text-amber-200">
                <Link2 className="h-3.5 w-3.5" />
                <span>Developer invite • دعوة مطوّر</span>
              </div>
              <p className="mt-1.5 text-amber-200/90">
                دعوتكم من <b className="text-white">{invite.creatorName}</b> — عند إنشاء الحساب تحصل مباشرة على
                صلاحيات <b>{invite.role === 'ADMIN' ? 'أدمن ADMIN' : 'مستخدم USER'}</b>
                {invite.verification ? ' مع شارة توثيق' : ''}.
                {invite.verification && <VerifiedBadge type={invite.verification} className="ml-1.5 h-4 w-4" />}
              </p>
              <p className="mt-1 text-amber-300/70">
                سجّل عبر البريد الإلكتروني لتفعيل الدعوة
                {invite.expiresAt ? ` • تنتهي ${new Date(invite.expiresAt).toLocaleDateString()}` : ''}
              </p>
              {invite.note && (
                <p className="mt-1 border-t border-amber-500/20 pt-1.5 text-amber-100/80">
                  ملاحظة إضافية: {invite.note}
                </p>
              )}
            </div>
          )}

          {/* Social login buttons */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            {SOCIALS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => startOAuth(id)}
                disabled={loading || !providersLoaded}
                title={providersLoaded && !providers[id] ? 'Not configured yet' : `Continue with ${label}`}
                className={`flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/60 py-3 text-[11px] font-medium text-slate-200 hover:border-cyan-400/50 hover:bg-slate-800/80 transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                  providersLoaded && providers[id] ? 'hover:text-white' : 'opacity-70'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {twoFactor ? (
            /* Real 2FA — authenticator code step */
            <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber-200">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Two-factor check — enter the 6-digit code from your authenticator app.
                  <span className="mt-0.5 block text-amber-300/70">تحقّق ثنائي — أدخل الرمز من تطبيق المصادق</span>
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">Authenticator Code / رمز المصادق</label>
                <div className="relative mt-1">
                  <Shield className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={twoCode}
                    onChange={(e) => setTwoCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className={`${inputClass} text-center text-sm font-mono tracking-[0.5em]`}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || twoCode.length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 text-xs font-semibold text-white transition-all hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Verify &amp; Enter Console
              </button>
              <button
                type="button"
                onClick={() => {
                  setTwoFactor(null);
                  setTwoCode('');
                  setError(null);
                }}
                className="w-full text-[11px] text-slate-400 transition-colors hover:text-slate-200"
              >
                ← Back to sign in
              </button>
            </form>
          ) : (
            <>
          {/* Divider */}
          <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500">
            <span className="h-px flex-1 bg-white/10" />
            <span>or continue with email</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-300">Display Name / الاسم</label>
                <div className="relative mt-1">
                  <UserPlus className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    maxLength={80}
                    placeholder="e.g. Sovereign Emperor"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300">Email Address / البريد الإلكتروني</label>
              <div className="relative mt-1">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  maxLength={120}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Password / كلمة المرور</label>
              <div className="relative mt-1">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              {mode === 'register' && <p className="mt-1 text-[10px] text-slate-500">8+ characters • hashed with scrypt, never stored in plain text</p>}
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-300">Confirm Password / تأكيد كلمة المرور</label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    placeholder="••••••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-500 py-2.5 text-xs font-semibold text-white shadow-lg shadow-cyan-600/25 hover:opacity-95 transition-all disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>{mode === 'register' ? 'Create Account & Enter Console' : 'Sign In to Console'}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </form>
            </>
          )}

          {/* Switch between login / register */}
          <p className="mt-4 text-center text-[11px] text-slate-400">
            {mode === 'register' ? (
              <>
                Already have an account?{' '}
                <a href="/login" className="text-cyan-400 hover:text-cyan-300 font-semibold">
                  Sign in
                </a>
              </>
            ) : (
              <>
                New to Vanitas?{' '}
                <a href="/register" className="text-cyan-400 hover:text-cyan-300 font-semibold">
                  Create an account
                </a>
              </>
            )}
          </p>

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-emerald-400" />
              <span>scrypt + TOTP 2FA + OAuth 2.0 secured</span>
            </div>
            <span className="font-mono text-[10px] text-cyan-400">Vanitas Ingress v1.4</span>
          </div>
        </div>
      </main>

      <footer className="relative z-10 pb-5 text-center text-[11px] text-slate-600">
        VANITAS • Centralized API & Intelligence Platform
      </footer>
    </div>
  );
};

export default AuthPage;
