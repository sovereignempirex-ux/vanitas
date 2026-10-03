import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../lib/apiClient.ts';
import { SessionDevice } from '../../types.ts';
import {
  Shield,
  Key,
  Smartphone,
  Laptop,
  Globe,
  Trash2,
  CheckCircle2,
  Lock,
  QrCode,
  Copy,
  Check,
  AlertTriangle,
  Fingerprint,
} from 'lucide-react';

export const SecurityView: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<'secret' | 'url' | null>(null);
  // Real TOTP setup payload from POST /auth/2fa/setup (stored, not enabled yet).
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [totpInput, setTotpInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  // Password rotation form.
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const res = await api.getSessions();
      setSessions(res.sessions);
    } catch (e) {
      console.warn('Failed sessions load:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleRevokeSession = async (id: string) => {
    try {
      await api.revokeSession(id);
      setSessions(sessions.filter((s) => s.id !== id));
      setActionSuccess('Device session successfully revoked and invalidated.');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      console.error(err);
    }
  };

  /** Step 1: the server generates a fresh real TOTP secret for this account. */
  const handleStartSetup = async () => {
    setBusy(true);
    setFormMsg(null);
    try {
      const res = await api.setupTwoFactor();
      setSetup({ secret: res.secret, otpauthUrl: res.otpauthUrl });
    } catch (err: any) {
      setFormMsg({ kind: 'err', text: err?.message || 'Could not start two-factor setup' });
    } finally {
      setBusy(false);
    }
  };

  /** Step 2: prove the authenticator app with a live 6-digit code → ENABLED. */
  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(totpInput)) {
      setFormMsg({ kind: 'err', text: 'Enter the 6-digit code from your authenticator app.' });
      return;
    }
    setBusy(true);
    setFormMsg(null);
    try {
      await api.enableTwoFactor(totpInput);
      await refreshUser(); // the server is the source of truth for this state
      setSetup(null);
      setTotpInput('');
      setFormMsg({ kind: 'ok', text: 'Two-factor authentication is now ENFORCED at sign-in.' });
    } catch (err: any) {
      setFormMsg({ kind: 'err', text: err?.message || 'Invalid code' });
    } finally {
      setBusy(false);
    }
  };

  /** Turning it off also requires a live code — a stolen session can't do it. */
  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(totpInput)) {
      setFormMsg({ kind: 'err', text: 'Enter the 6-digit code from your authenticator app.' });
      return;
    }
    setBusy(true);
    setFormMsg(null);
    try {
      await api.disableTwoFactor(totpInput);
      await refreshUser();
      setTotpInput('');
      setFormMsg({ kind: 'ok', text: 'Two-factor authentication disabled.' });
    } catch (err: any) {
      setFormMsg({ kind: 'err', text: err?.message || 'Invalid code' });
    } finally {
      setBusy(false);
    }
  };

  const copyText = (what: 'secret' | 'url', text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  /** Password rotation — proof = current password; the server then revokes
   * every OTHER session so a stolen session dies together with the old
   * credential. */
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwNext.length < 8 || pwNext.length > 128) {
      setPwMsg({ kind: 'err', text: 'New password must be between 8 and 128 characters.' });
      return;
    }
    if (pwCurrent === pwNext) {
      setPwMsg({ kind: 'err', text: 'New password must be different from the current one.' });
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    try {
      const res = await api.changePassword(pwCurrent, pwNext);
      setPwCurrent('');
      setPwNext('');
      setPwMsg({
        kind: 'ok',
        text:
          res.sessionsRevoked > 0
            ? `Password updated — ${res.sessionsRevoked} other session${res.sessionsRevoked === 1 ? '' : 's'} signed out.`
            : 'Password updated.',
      });
      void loadSessions(); // revoked sessions disappear from the list
    } catch (err: any) {
      setPwMsg({ kind: 'err', text: err?.message || 'Password change failed' });
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-blue-400" />
          <h1 className="text-xl sm:text-2xl font-bold text-white">Security Center & Active Sessions</h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Harden account defenses, configure TOTP two-factor authentication, and monitor authorized client devices.
        </p>
      </div>

      {actionSuccess && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Two-Factor Authentication (TOTP) Card */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-blue-400" />
              <h2 className="text-base font-bold text-white">Two-Factor Authentication (2FA)</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Require a time-based 6-digit code from Google Authenticator or 1Password when signing in.
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-1 font-mono text-xs font-semibold border ${
              user?.twoFactorEnabled
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}
          >
            {user?.twoFactorEnabled ? 'ENFORCED' : 'NOT CONFIGURED'}
          </span>
        </div>

        {/* Real TOTP — state driven entirely by the server */}
        {user?.twoFactorEnabled ? (
          /* Enabled: enforced at sign-in; disabling requires a live code */
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 flex flex-col items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-6 text-center">
              <Shield className="h-8 w-8 text-emerald-400" />
              <p className="mt-3 text-xs font-semibold text-emerald-300">Real TOTP enforced at sign-in</p>
              <p className="mt-1 text-[11px] text-emerald-200/60">مفعّل فعليًا — يُطلب رمزه عند كل تسجيل دخول</p>
            </div>
            <div className="lg:col-span-7 flex flex-col justify-center gap-4">
              <form onSubmit={handleDisable} className="flex gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  value={totpInput}
                  onChange={(e) => setTotpInput(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-mono text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || totpInput.length !== 6}
                  className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-900/40 transition-all disabled:opacity-50"
                >
                  {busy ? 'Verifying…' : 'Disable 2FA'}
                </button>
              </form>
            </div>
          </div>
        ) : setup ? (
          /* Setup in progress: the server's real secret, verified before enabling */
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-[11px] leading-relaxed text-slate-300">
                In your authenticator app choose <span className="text-white">“Enter a setup key”</span> and paste the
                real server-generated key below, then enter the code it shows.
              </p>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  Setup key (real, server-generated)
                </label>
                <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 p-2.5">
                  <code className="break-all font-mono text-[11px] leading-relaxed text-blue-300">{setup.secret}</code>
                  <button
                    onClick={() => copyText('secret', setup.secret)}
                    className="shrink-0 rounded p-1 text-slate-400 hover:text-white hover:bg-white/10"
                  >
                    {copied === 'secret' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  otpauth:// link (paste into the app)
                </label>
                <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 p-2.5">
                  <code className="truncate font-mono text-[10px] text-slate-400">{setup.otpauthUrl}</code>
                  <button
                    onClick={() => copyText('url', setup.otpauthUrl)}
                    className="shrink-0 rounded p-1 text-slate-400 hover:text-white hover:bg-white/10"
                  >
                    {copied === 'url' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-center gap-3">
              <form onSubmit={handleEnable} className="flex gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  value={totpInput}
                  onChange={(e) => setTotpInput(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-mono text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || totpInput.length !== 6}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all disabled:opacity-50"
                >
                  {busy ? 'Verifying…' : 'Verify & Enable'}
                </button>
              </form>
              <button
                type="button"
                onClick={() => {
                  setSetup(null);
                  setTotpInput('');
                  setFormMsg(null);
                }}
                className="self-start text-[11px] text-slate-400 transition-colors hover:text-slate-200"
              >
                ← Cancel setup
              </button>
            </div>
          </div>
        ) : (
          /* Not configured — honest empty state */
          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-5">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-slate-400" />
              <div>
                <p className="text-xs font-medium text-white">
                  Not configured — add this account to Google Authenticator, Authy, or 1Password
                </p>
                <p className="text-[11px] text-slate-400">لم يُفعَّل بعد — أضِف الحساب بتطبيق المصادق ثم أكّد الرمز</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleStartSetup}
              disabled={busy}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-600/20 hover:from-blue-500 hover:to-cyan-500 transition-all disabled:opacity-50"
            >
              {busy ? 'Generating…' : 'Generate Setup Key'}
            </button>
          </div>
        )}

        {formMsg && (
          <p className={`mt-4 text-xs font-medium ${formMsg.kind === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formMsg.kind === 'ok' ? '✓ ' : '✕ '}
            {formMsg.text}
          </p>
        )}
      </div>

      {/* Password rotation — proof = current password; every OTHER session is
          revoked with it so a stolen session dies when the credential moves. */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl overflow-hidden shadow-2xl">
        <div className="p-4 sm:p-6 border-b border-white/10 flex items-center gap-2">
          <Key className="h-5 w-5 text-amber-400" />
          <div>
            <h2 className="text-sm font-bold text-white">Account Password</h2>
            <p className="text-[11px] text-slate-400">
              Changing the password signs out every other device automatically.
            </p>
          </div>
        </div>
        <form onSubmit={handleChangePassword} className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <label className="block">
            <span className="block text-[11px] font-medium text-slate-400 mb-1">Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
              placeholder="••••••••"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-slate-400 mb-1">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={pwNext}
              onChange={(e) => setPwNext(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
              placeholder="8–128 characters"
            />
          </label>
          <button
            type="submit"
            disabled={pwBusy || !pwCurrent || !pwNext}
            className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-amber-600/25 hover:bg-amber-500 transition-all disabled:opacity-50"
          >
            {pwBusy ? 'Updating…' : 'Update password'}
          </button>
          {pwMsg && (
            <p
              className={`sm:col-span-3 text-xs font-medium ${pwMsg.kind === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}
            >
              {pwMsg.kind === 'ok' ? '✓ ' : '✕ '}
              {pwMsg.text}
            </p>
          )}
        </form>
      </div>

      {/* Active Device Sessions Manager */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl overflow-hidden shadow-2xl">
        <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Laptop className="h-5 w-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">Active Device Sessions</h2>
          </div>
          <span className="text-xs font-mono text-slate-400">{sessions.length} Authorized</span>
        </div>

        <div className="divide-y divide-white/5">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading session telemetry...</div>
          ) : (
            sessions.map((sess) => (
              <div key={sess.id} className="p-4 sm:p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] border border-white/10 text-slate-300">
                    {/phone|mobile|ios|android/i.test(`${sess.device} ${sess.os}`) ? (
                      <Smartphone className="h-5 w-5 text-purple-400" />
                    ) : (
                      <Laptop className="h-5 w-5 text-cyan-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-white">
                        {sess.browser} <span className="text-slate-500">on</span> {sess.os}
                      </p>
                      {sess.isCurrent && (
                        <span className="rounded bg-blue-500/20 px-2 py-0.5 font-mono text-[9px] font-bold text-blue-300">
                          CURRENT DEVICE
                        </span>
                      )}
                    </div>
                    {/* Real session row facts: IP, client source, sign-in time.
                        There is no geo-IP or activity tracking — nothing about
                        location or "last active" is invented here. */}
                    <p className="text-[11px] text-slate-400">
                      IP: <span className="font-mono text-slate-300">{sess.ip || 'unknown'}</span> • Source:{' '}
                      {sess.source} • Signed in: {new Date(sess.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                {!sess.isCurrent && (
                  <button
                    onClick={() => handleRevokeSession(sess.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/30 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Revoke</span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
