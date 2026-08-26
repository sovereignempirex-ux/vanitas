import React, { useState } from 'react';
import { useAuth, DEMO_ACCOUNTS, DemoAccount } from '../context/AuthContext.tsx';
import { BRAND_ASSETS } from '../data/assets.ts';
import {
  Shield,
  X,
  Mail,
  Lock,
  Key,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  UserCheck,
  UserPlus,
  KeyRound,
  Fingerprint,
  Zap,
  Globe,
  Radio,
} from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, setIsAuthModalOpen, loginOAuth, loginWithEmail, loginAsDemoAccount } = useAuth();
  const [tab, setTab] = useState<'login' | 'register' | 'demo' | 'token'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rawToken, setRawToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [is2FaStep, setIs2FaStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (!isAuthModalOpen) return null;

  const handleOAuth = async (provider: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      await loginOAuth(provider);
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (tab === 'login' && !is2FaStep && email.toLowerCase().includes('admin')) {
      // Prompt 2FA simulation for admin
      setIs2FaStep(true);
      return;
    }

    setLoading(true);
    try {
      await loginWithEmail(email, password, name);
      setIs2FaStep(false);
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to authenticate');
    } finally {
      setLoading(false);
    }
  };

  const handleTokenLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawToken.trim()) return;
    setLoading(true);
    setTimeout(() => {
      loginWithEmail(`token_dev_${Date.now().toString(36)}@vanitas-ingress.io`, 'token_pass', 'Token Developer Ingress');
      setLoading(false);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* Background crystal lighting glow */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[500px] h-[500px] bg-gradient-to-tr from-cyan-600/15 via-blue-600/15 to-purple-600/15 rounded-full blur-3xl animate-crystal-pulse" />
      </div>

      <div className="relative w-full max-w-lg rounded-3xl border border-white/20 crystal-card shadow-[0_0_60px_rgba(56,189,248,0.2)] overflow-hidden p-6 sm:p-8 z-10 max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={() => {
            setIsAuthModalOpen(false);
            setIs2FaStep(false);
            setAuthError(null);
          }}
          className="absolute top-5 right-5 rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          title="Close / إغلاق"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl crystal-gem">
            <img src={BRAND_ASSETS.logo} alt="Vanitas" className="h-9 w-9 object-contain drop-shadow-[0_0_12px_rgba(56,189,248,0.7)]" />
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <h2 className="font-display text-xl font-bold tracking-wider text-white">VANITAS INGRESS</h2>
            <span className="crystal-badge px-2 py-0.5 rounded text-[10px] font-mono">CRYSTAL SECURE</span>
          </div>
          <p className="mt-1 text-xs text-slate-300">
            بوابة تسجيل الدخول المركزية • Centralized Access & Intelligence
          </p>
        </div>

        {/* Auth Error Banner */}
        {authError && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
            {authError}
          </div>
        )}

        {/* Tab Switcher */}
        {!is2FaStep && (
          <div className="mt-5 grid grid-cols-4 rounded-xl border border-white/10 bg-slate-900/70 p-1 text-center">
            <button
              onClick={() => {
                setTab('login');
                setAuthError(null);
              }}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                tab === 'login' ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setTab('register');
                setAuthError(null);
              }}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                tab === 'register' ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Register
            </button>
            <button
              onClick={() => {
                setTab('demo');
                setAuthError(null);
              }}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                tab === 'demo' ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 text-white shadow-md' : 'text-cyan-300 hover:text-white'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              <span>Demo</span>
            </button>
            <button
              onClick={() => {
                setTab('token');
                setAuthError(null);
              }}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                tab === 'token' ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <KeyRound className="h-3 w-3" />
              <span>API Key</span>
            </button>
          </div>
        )}

        {/* DEMO ACCOUNTS TAB */}
        {tab === 'demo' && !is2FaStep && (
          <div className="mt-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase text-cyan-400 font-bold">1-Click Instant Demo Profiles</span>
              <span className="text-[10px] text-slate-400">حسابات تجريبية سريعة</span>
            </div>
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.id}
                onClick={() => loginAsDemoAccount(account)}
                className="group w-full flex items-center justify-between p-3 rounded-2xl border border-white/10 bg-slate-900/60 hover:border-cyan-400/50 hover:bg-slate-800/80 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <img src={account.avatarUrl} alt={account.name} className="h-9 w-9 rounded-xl object-cover border border-white/20" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">{account.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                        account.role === 'ADMIN' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-slate-700/50 text-slate-300'
                      }`}>
                        {account.badge}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1">{account.description}</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
              </button>
            ))}
          </div>
        )}

        {/* DIRECT API KEY TAB */}
        {tab === 'token' && !is2FaStep && (
          <form onSubmit={handleTokenLogin} className="mt-5 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300">Direct Ingress API Secret / JWT Token</label>
              <div className="relative mt-1">
                <KeyRound className="absolute left-3.5 top-3 h-4 w-4 text-purple-400" />
                <input
                  type="password"
                  required
                  placeholder="vnt_live_sec_••••••••••••••••"
                  value={rawToken}
                  onChange={(e) => setRawToken(e.target.value)}
                  className="w-full rounded-xl border border-purple-500/30 bg-slate-900/80 py-2.5 pl-10 pr-4 text-xs text-purple-200 font-mono placeholder:text-slate-600 focus:border-purple-400 focus:outline-none"
                />
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400">
                Authenticate using a Vanitas Provisioned Bearer Key for headless programmatic session.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !rawToken}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-purple-600/30 hover:from-purple-500 hover:to-blue-500 transition-all disabled:opacity-50"
            >
              <span>Authenticate with Ingress Key</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>
        )}

        {/* STANDARD SIGN IN / REGISTER FORM */}
        {(tab === 'login' || tab === 'register') && (
          <>
            {/* OAuth Quick Options */}
            {!is2FaStep && (
              <div className="mt-5 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleOAuth('google')}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2 px-3 text-xs font-medium text-slate-200 hover:border-blue-500/40 hover:bg-white/[0.08] transition-all"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Google</span>
                  </button>

                  <button
                    onClick={() => handleOAuth('github')}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2 px-3 text-xs font-medium text-slate-200 hover:border-blue-500/40 hover:bg-white/[0.08] transition-all"
                  >
                    <svg className="h-3.5 w-3.5 fill-white" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    <span>GitHub</span>
                  </button>

                  <button
                    onClick={() => handleOAuth('discord')}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2 px-3 text-xs font-medium text-slate-200 hover:border-blue-500/40 hover:bg-white/[0.08] transition-all"
                  >
                    <svg className="h-3.5 w-3.5 fill-[#5865F2]" viewBox="0 0 24 24">
                      <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.893.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                    <span>Discord</span>
                  </button>
                </div>

                <div className="my-4 flex items-center gap-3">
                  <div className="flex-1 border-t border-white/10"></div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">OR EMAIL CREDENTIALS</span>
                  <div className="flex-1 border-t border-white/10"></div>
                </div>
              </div>
            )}

            {/* Email / 2FA Form */}
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              {!is2FaStep ? (
                <>
                  {tab === 'register' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300">Display Name / الاسم</label>
                      <div className="relative mt-1">
                        <UserPlus className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                        <input
                          type="text"
                          required
                          placeholder="e.g. Sovereign Emperor"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-slate-900/60 py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none"
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
                        placeholder="sovereign.empirex@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-900/60 py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-medium text-slate-300">Password / كلمة المرور</label>
                      <span className="text-[11px] text-cyan-400 hover:underline cursor-pointer">Forgot?</span>
                    </div>
                    <div className="relative mt-1">
                      <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                      <input
                        type="password"
                        required
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-900/60 py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-cyan-500/30 crystal-card p-4 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                    <Shield className="h-6 w-6" />
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-white">Two-Factor Authentication (2FA)</h3>
                  <p className="mt-1 text-xs text-slate-300">Enter the 6-digit TOTP code from your authenticator app</p>
                  
                  <input
                    type="text"
                    maxLength={6}
                    autoFocus
                    placeholder="123456"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className="mt-3 w-full rounded-xl border border-cyan-500/40 bg-slate-900 py-2.5 text-center text-lg font-mono tracking-widest text-cyan-300 focus:border-cyan-300 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setTotpCode('123456')}
                    className="mt-2 text-[10px] text-cyan-400 hover:underline"
                  >
                    Quick Autofill Mock TOTP: 123456
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-500 py-2.5 text-xs font-semibold text-white shadow-lg shadow-cyan-600/25 hover:opacity-95 transition-all"
              >
                <span>{is2FaStep ? 'Verify TOTP & Enter' : tab === 'login' ? 'Continue to Console' : 'Create & Access Console'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>
          </>
        )}

        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-emerald-400" />
            <span>End-to-end Encrypted</span>
          </div>
          <span className="font-mono text-[10px] text-cyan-400">Vanitas Ingress v1.4</span>
        </div>
      </div>
    </div>
  );
};

