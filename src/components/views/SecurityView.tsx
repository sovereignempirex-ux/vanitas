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
  const { user, updateUserProfile } = useAuth();
  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedTotp, setCopiedTotp] = useState(false);
  const [totpInput, setTotpInput] = useState('');
  const [totpSuccess, setTotpSuccess] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const totpSecret = 'JBSWY3DPEHPK3PXP';

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

  const handleVerify2Fa = (e: React.FormEvent) => {
    e.preventDefault();
    if (totpInput.length === 6) {
      setTotpSuccess(true);
      updateUserProfile({ twoFactorEnabled: true });
      setTimeout(() => setTotpSuccess(false), 3000);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(totpSecret);
    setCopiedTotp(true);
    setTimeout(() => setCopiedTotp(false), 2000);
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

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* QR Code display */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 rounded-2xl border border-white/10 bg-slate-900/60 text-center">
            {/* SVG QR Code Simulation */}
            <div className="bg-white p-3 rounded-xl shadow-lg">
              <svg className="h-32 w-32" viewBox="0 0 100 100" fill="currentColor">
                <path d="M0 0h30v30H0zm40 0h20v10H40zm30 0h30v30H70zM10 10v10h10V10zm70 0v10h10V10zm-40 10h10v10H40zm10 10h10v10H50zm-50 10h10v10H0zm20 0h20v20H20zm50 0h10v10H70zm10 10h20v10H80zM0 70h30v30H0zm10 10v10h10V80zm30-10h10v10H40zm20 0h10v20H60zm20 0h10v10H80zm-40 20h20v10H40zm40 0h20v10H80z" />
              </svg>
            </div>
            <p className="mt-3 text-[11px] font-medium text-slate-300">Scan with Authenticator App</p>
          </div>

          {/* Setup Instructions & Verification */}
          <div className="lg:col-span-8 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300">Manual Setup Key</label>
              <div className="mt-1 flex items-center justify-between rounded-xl border border-white/10 bg-black/40 p-2.5">
                <code className="font-mono text-xs text-blue-300">{totpSecret}</code>
                <button
                  onClick={copySecret}
                  className="rounded p-1 text-slate-400 hover:text-white hover:bg-white/10"
                >
                  {copiedTotp ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <form onSubmit={handleVerify2Fa} className="flex gap-3">
              <input
                type="text"
                placeholder="Enter 6-digit code"
                maxLength={6}
                value={totpInput}
                onChange={(e) => setTotpInput(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-mono text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all"
              >
                Verify & Enable
              </button>
            </form>

            {totpSuccess && (
              <p className="text-xs text-emerald-400 font-medium">
                ✓ Two-factor authentication successfully enabled for this account!
              </p>
            )}
          </div>
        </div>
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
                    {sess.device.toLowerCase().includes('phone') || sess.device.toLowerCase().includes('ios') ? (
                      <Smartphone className="h-5 w-5 text-purple-400" />
                    ) : (
                      <Laptop className="h-5 w-5 text-cyan-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-white">{sess.device}</p>
                      {sess.isCurrent && (
                        <span className="rounded bg-blue-500/20 px-2 py-0.5 font-mono text-[9px] font-bold text-blue-300">
                          CURRENT DEVICE
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      IP: <span className="font-mono text-slate-300">{sess.ip}</span> • Location: {sess.location} • Last active: {new Date(sess.lastActive).toLocaleTimeString()}
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
