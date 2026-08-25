import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../lib/apiClient.ts';
import { User, UserRole, FeatureFlag, SecurityThreat } from '../../types.ts';
import {
  Users,
  Shield,
  Lock,
  AlertOctagon,
  Sliders,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCw,
  Search,
  UserCheck,
  UserX,
  Zap,
} from 'lucide-react';

export const AdminCenterView: React.FC = () => {
  const { role, toggleRole } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [threats, setThreats] = useState<SecurityThreat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search filter
  const [search, setSearch] = useState('');

  const loadAdminData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersData, flagsData, statsData] = await Promise.all([
        api.getAdminUsers(),
        api.getFeatureFlags(),
        api.getAdminStatistics(),
      ]);
      setUsers(usersData.users);
      setFlags(flagsData.featureFlags);
      setThreats(statsData.threats);
    } catch (err: any) {
      setError(err.message || 'Failed loading admin control center');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'ADMIN') {
      loadAdminData();
    }
  }, [role]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      setError(null);
      await api.updateUserRole(userId, newRole);
      setSuccessMsg(`User role updated to ${newRole}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      loadAdminData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleFlag = async (flagId: string, currentEnabled: boolean) => {
    try {
      await api.toggleFeatureFlag(flagId, !currentEnabled);
      setFlags(
        flags.map((f) => (f.id === flagId ? { ...f, enabled: !currentEnabled } : f))
      );
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEmergencyAction = async (action: string) => {
    if (!confirm(`Are you sure you want to trigger emergency action: ${action}?`)) return;
    try {
      setError(null);
      const res = await api.triggerEmergencyAction(action);
      setSuccessMsg(`Emergency action ${action} completed successfully.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      loadAdminData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // If not admin, render 403 Forbidden Screen
  if (role !== 'ADMIN') {
    return (
      <div className="rounded-3xl border border-rose-500/30 bg-slate-950/80 p-8 sm:p-12 text-center backdrop-blur-xl animate-in zoom-in-95">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-white">403 Forbidden: Admin Privileges Required</h2>
        <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          The Vanitas Central API has rejected this view because your current token context does not hold the <code className="font-mono text-rose-300 font-bold">admin.users</code> or <code className="font-mono text-rose-300 font-bold">admin.emergency</code> scopes.
        </p>

        <div className="mt-6 flex justify-center">
          <button
            onClick={toggleRole}
            className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-amber-600/30 hover:bg-amber-500 transition-all"
          >
            <Shield className="h-4 w-4" />
            <span>Elevate Role to ADMIN (Preview)</span>
          </button>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-amber-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-white">Admin Control Center</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Global ecosystem oversight, user role elevation, feature flags, and emergency killswitches.
          </p>
        </div>

        <button
          onClick={loadAdminData}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.05] transition-all"
        >
          <RotateCw className="h-3.5 w-3.5" />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Notifications / Alerts */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {successMsg && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* User Management Section */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl overflow-hidden shadow-2xl">
        <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white">Registered Users & Role Authorization</h2>
          </div>

          <div className="w-full sm:w-64 relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search user name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.01] text-[10px] font-mono uppercase text-slate-400">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">2FA Status</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <img src={u.avatarUrl} alt={u.name} className="h-8 w-8 rounded-lg object-cover border border-blue-500/30" />
                      <div>
                        <p className="font-semibold text-white">{u.name}</p>
                        <p className="font-mono text-[11px] text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase border ${
                        u.role === 'ADMIN'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{u.twoFactorEnabled ? 'Enabled (TOTP)' : 'Disabled'}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400 uppercase">
                      {u.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {u.role === 'USER' ? (
                      <button
                        onClick={() => handleRoleChange(u.id, 'ADMIN')}
                        className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-900/30 transition-all"
                      >
                        Promote to Admin
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRoleChange(u.id, 'USER')}
                        className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-white transition-all"
                      >
                        Demote to User
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feature Flags & Emergency Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feature Flags */}
        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
          <div className="flex items-center gap-2 pb-4 border-b border-white/10">
            <Sliders className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white">Dynamic Feature Flags</h3>
          </div>

          <div className="mt-4 space-y-3">
            {flags.map((flag) => (
              <div key={flag.id} className="flex items-center justify-between p-3 rounded-2xl border border-white/5 bg-white/[0.02]">
                <div>
                  <p className="text-xs font-semibold text-white">{flag.name}</p>
                  <p className="text-[11px] text-slate-400">{flag.description}</p>
                  <span className="font-mono text-[9px] text-slate-500">{flag.key}</span>
                </div>

                <button
                  onClick={() => handleToggleFlag(flag.id, flag.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    flag.enabled ? 'bg-blue-600' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      flag.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency Killswitches */}
        <div className="rounded-3xl border border-rose-500/20 bg-rose-950/10 p-6 backdrop-blur-xl">
          <div className="flex items-center gap-2 pb-4 border-b border-rose-500/20">
            <AlertOctagon className="h-4 w-4 text-rose-400" />
            <h3 className="text-sm font-bold text-rose-200">Emergency & Incident Controls</h3>
          </div>

          <p className="mt-4 text-xs text-slate-300 leading-relaxed">
            High-severity actions that immediately affect Central API routing, key authorization, and ingress traffic across all clients.
          </p>

          <div className="mt-6 space-y-3">
            <button
              onClick={() => handleEmergencyAction('TOGGLE_MAINTENANCE')}
              className="flex w-full items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs text-amber-200 hover:bg-amber-900/30 transition-all text-left"
            >
              <div>
                <p className="font-bold">Toggle Global Maintenance Mode</p>
                <p className="text-[11px] text-amber-400/80">Rejects all non-admin client traffic with 503 Service Unavailable</p>
              </div>
              <Zap className="h-4 w-4 text-amber-400" />
            </button>

            <button
              onClick={() => handleEmergencyAction('PURGE_SUSPICIOUS_KEYS')}
              className="flex w-full items-center justify-between rounded-2xl border border-rose-500/30 bg-rose-950/20 p-3.5 text-xs text-rose-200 hover:bg-rose-900/30 transition-all text-left"
            >
              <div>
                <p className="font-bold">Purge Sandbox / Test Tokens</p>
                <p className="text-[11px] text-rose-400/80">Permanently revokes all sandbox tokens across all tenants</p>
              </div>
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
