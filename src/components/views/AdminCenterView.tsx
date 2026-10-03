import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../lib/apiClient.ts';
import {
  User,
  UserRole,
  FeatureFlag,
  SecurityThreat,
  SystemStats,
  DocComment,
  ProductSuggestion,
  PermissionScope,
  AdminInvite,
} from '../../types.ts';
import {
  Users,
  Shield,
  Lock,
  AlertOctagon,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Search,
  Zap,
  MessageSquare,
  Sparkles,
  Link2,
  Copy,
  Ban,
} from 'lucide-react';
import { VerifiedBadge } from '../VerifiedBadge.tsx';

type ScopeEntry = { scope: PermissionScope; label: string; group: string; adminOnly: boolean };

/** Each admin sidebar entry maps to its own focused section of this center. */
const SECTION_META: Record<string, { title: string; subtitle: string; icon: React.ElementType }> = {
  'admin-center': {
    title: 'Admin Control Center',
    subtitle:
      'Global ecosystem oversight: live platform statistics, user role elevation and threat intelligence.',
    icon: Shield,
  },
  'admin-moderation': {
    title: 'Moderation & Suggestions',
    subtitle: 'Review every comment across the docs and triage product suggestions from real users.',
    icon: MessageSquare,
  },
  'admin-permissions': {
    title: 'System Permissions Matrix',
    subtitle: 'Every grantable API scope — grouped, with administrator-only capabilities flagged.',
    icon: Lock,
  },
  'admin-flags': {
    title: 'Feature Flags',
    subtitle: 'Toggle platform capabilities in real time across every client of the gateway.',
    icon: Sliders,
  },
  'admin-emergency': {
    title: 'Emergency Controls',
    subtitle: 'Maintenance mode and incident killswitches — high-severity actions affect all tenants.',
    icon: AlertOctagon,
  },
};

/** Live status of an invite link, derived from revoked/uses/expiry. */
const inviteStatus = (inv: AdminInvite): { label: string; cls: string } => {
  if (inv.revoked) return { label: 'Revoked', cls: 'text-red-300 bg-red-500/15 border-red-500/30' };
  if (inv.uses >= inv.maxUses) return { label: 'Used', cls: 'text-slate-400 bg-slate-500/15 border-slate-500/30' };
  if (Date.parse(inv.expiresAt) <= Date.now()) return { label: 'Expired', cls: 'text-amber-300 bg-amber-500/15 border-amber-500/30' };
  return { label: 'Active', cls: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' };
};

export const AdminCenterView: React.FC = () => {
  const { role, user, activeView } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [threats, setThreats] = useState<SecurityThreat[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [comments, setComments] = useState<DocComment[]>([]);
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [allScopes, setAllScopes] = useState<ScopeEntry[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  /** Just-created invite link — highlighted for copying until the next one. */
  const [freshLink, setFreshLink] = useState<string | null>(null);
  // Developer invite form
  const [inviteRole, setInviteRole] = useState('ADMIN');
  const [inviteBadge, setInviteBadge] = useState('');
  const [inviteUses, setInviteUses] = useState(1);
  const [inviteNote, setInviteNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search filters
  const [search, setSearch] = useState('');
  const [modSearch, setModSearch] = useState('');

  const section = SECTION_META[activeView] ? activeView : 'admin-center';
  const meta = SECTION_META[section];
  const SectionIcon = meta.icon;

  const loadAdminData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersData, flagsData, statsData, invitesData] = await Promise.all([
        api.getAdminUsers(),
        api.getFeatureFlags(),
        api.getAdminStatistics(),
        api.listAdminInvites(),
      ]);
      setUsers(usersData.users);
      setFlags(flagsData.featureFlags);
      setThreats(statsData.threats);
      setStats(statsData.stats);
      setInvites(invitesData.invites);
    } catch (err: any) {
      setError(err.message || 'Failed loading admin control center');
    } finally {
      setLoading(false);
    }
  };

  const loadModeration = async () => {
    try {
      const [commentsData, suggestionsData] = await Promise.all([
        api.listAdminComments(),
        api.getAdminSuggestions(),
      ]);
      setComments(commentsData.comments);
      setSuggestions(suggestionsData.suggestions);
    } catch (err: any) {
      setError(err.message || 'Failed loading moderation queue');
    }
  };

  const loadScopes = async () => {
    try {
      const data = await api.getApiKeys();
      setAllScopes(data.allScopes || []);
    } catch (err: any) {
      setError(err.message || 'Failed loading permission scopes');
    }
  };

  const refreshAll = async () => {
    await loadAdminData();
    if (section === 'admin-moderation') await loadModeration();
    if (section === 'admin-permissions') await loadScopes();
  };

  useEffect(() => {
    if (role === 'ADMIN') {
      loadAdminData();
    }
  }, [role]);

  useEffect(() => {
    if (role !== 'ADMIN') return;
    if (section === 'admin-moderation') loadModeration();
    if (section === 'admin-permissions') loadScopes();
  }, [role, section]);

  const flashSuccess = (msg: string, ms = 3000) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), ms);
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      setError(null);
      await api.updateUserRole(userId, newRole);
      flashSuccess(`User role updated to ${newRole}`);
      loadAdminData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleVerificationChange = async (u: User, value: string) => {
    const current = u.verification || '';
    if (value === current) return;
    if (!confirm(`Set verification badge for ${u.name} to "${value || 'none'}"?`)) return;
    try {
      setError(null);
      await api.updateUserVerification(u.id, value);
      flashSuccess(`Badge for ${u.name}: ${value || 'revoked'}.`);
      loadAdminData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateInvite = async () => {
    try {
      setError(null);
      const data = await api.createAdminInvite({
        role: inviteRole,
        verification: inviteBadge,
        note: inviteNote.trim(),
        maxUses: Number(inviteUses) || 1,
      });
      setFreshLink(`${window.location.origin}/invite/${data.invite.token}`);
      setInviteNote('');
      flashSuccess('Invite link created — copy it and send it to the person');
      loadAdminData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRevokeInvite = async (inv: AdminInvite) => {
    if (
      !confirm(
        `Revoke this invite link (${inv.role}${inv.verification ? ' + ' + inv.verification : ''})? It stops working immediately.`,
      )
    )
      return;
    try {
      setError(null);
      await api.revokeAdminInvite(inv.id);
      if (freshLink && freshLink.endsWith(inv.token)) setFreshLink(null);
      flashSuccess('Invite revoked');
      loadAdminData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (!confirm(`Permanently delete ${u.name}? Their account, API keys, chat history and comments will be removed.`)) return;
    try {
      setError(null);
      await api.deleteAdminUser(u.id);
      flashSuccess(`Account ${u.name} deleted.`);
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
      const detail =
        action === 'PURGE_SUSPICIOUS_KEYS'
          ? ` — ${res.revokedCount ?? 0} tokens revoked`
          : action === 'TOGGLE_MAINTENANCE'
          ? ` — maintenance ${res.maintenanceMode ? 'ON' : 'OFF'}`
          : '';
      flashSuccess(`Emergency action ${action} completed${detail}.`, 4000);
      loadAdminData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteComment = async (c: DocComment) => {
    if (!confirm(`Delete ${c.authorName}'s comment on "${c.docId}"?`)) return;
    try {
      setError(null);
      await api.deleteComment(c.id);
      flashSuccess('Comment deleted.');
      loadModeration();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSuggestionStatus = async (s: ProductSuggestion, status: ProductSuggestion['status']) => {
    try {
      setError(null);
      await api.updateSuggestionStatus(s.id, status);
      flashSuccess(`Suggestion moved to "${status}".`);
      loadModeration();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAiFix = async (s: ProductSuggestion) => {
    try {
      setError(null);
      await api.requestSuggestionAiFix(s.id);
      flashSuccess('AI repair proposal generated — suggestion moved to "reviewing".', 4000);
      loadModeration();
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
        <p className="mt-4 text-[11px] text-slate-500">
          Roles are decided by the server, never by the client — sign in with a real ADMIN account to open this center.
        </p>
      </div>
    );
  }

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.id.toLowerCase().includes(search.toLowerCase())
  );

  const filteredComments = comments.filter((c) => {
    const q = modSearch.toLowerCase().trim();
    return (
      !q ||
      c.authorName.toLowerCase().includes(q) ||
      c.body.toLowerCase().includes(q) ||
      c.docId.toLowerCase().includes(q)
    );
  });

  // Group scopes by their capability family for the permissions matrix.
  const scopeGroups: { name: string; items: ScopeEntry[] }[] = [];
  for (const s of allScopes) {
    let g = scopeGroups.find((x) => x.name === s.group);
    if (!g) {
      g = { name: s.group, items: [] };
      scopeGroups.push(g);
    }
    g.items.push(s);
  }

  const maintenanceFlag = flags.find((f) => f.key === 'SYSTEM_MAINTENANCE_MODE');

  const statTiles = stats
    ? [
        { label: 'Total Users', value: String(stats.totalUsers) },
        { label: 'Active (7d)', value: String(stats.activeUsers) },
        { label: 'Active API Keys', value: String(stats.activeApiKeys) },
        { label: 'Requests Today', value: String(stats.apiRequestsToday) },
        { label: 'Requests (Month)', value: String(stats.apiRequestsThisMonth) },
        { label: 'Error Rate', value: `${(stats.errorRate * 100).toFixed(1)}%` },
        { label: 'P95 Latency', value: `${stats.p95LatencyMs} ms` },
        {
          label: 'Daily Quota Used',
          value: `${Math.min(100, Math.round((stats.apiRequestsToday / Math.max(stats.apiQuotaLimit, 1)) * 100))}%`,
        },
      ]
    : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header — title follows the active sidebar section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <SectionIcon className="h-6 w-6 text-amber-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-white">{meta.title}</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">{meta.subtitle}</p>
        </div>

        <button
          onClick={refreshAll}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.05] transition-all disabled:opacity-50"
        >
          <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing…' : 'Refresh Data'}</span>
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

      {/* ============================ OVERVIEW & USERS ============================ */}
      {section === 'admin-center' && (
        <>
          {/* Live Platform Statistics — real numbers from GET /admin/statistics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statTiles.map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 backdrop-blur-xl">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{s.label}</p>
                <p className="mt-1 text-lg font-bold text-white">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Service Health — all six platform services at a glance */}
          {stats && (
            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4 backdrop-blur-xl">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-3">Service Health</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.services).map(([name, status]) => (
                  <span
                    key={name}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-semibold capitalize ${
                      status === 'operational'
                        ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                        : status === 'degraded'
                        ? 'border-amber-500/30 bg-amber-950/20 text-amber-300'
                        : 'border-rose-500/30 bg-rose-950/20 text-rose-300'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        status === 'operational'
                          ? 'bg-emerald-400'
                          : status === 'degraded'
                          ? 'bg-amber-400'
                          : 'bg-rose-400'
                      }`}
                    />
                    {name} · {status}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* User Management Section */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl overflow-hidden shadow-2xl">
            <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                <h2 className="text-sm font-bold text-white">Registered Users & Role Authorization</h2>
                <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-slate-400">
                  {users.length}
                </span>
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
                            <p className="font-semibold text-white">
                              {u.name}
                              <VerifiedBadge type={u.verification} className="ml-1.5" />
                              {u.id === user?.id && (
                                <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-emerald-300">
                                  you
                                </span>
                              )}
                            </p>
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
                        <div className="flex items-center justify-end gap-2">
                          <select
                            value={u.verification || ''}
                            onChange={(e) => handleVerificationChange(u, e.target.value)}
                            title="Verification badge — only admins can grant it"
                            className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 focus:border-amber-500 focus:outline-none"
                          >
                            <option value="">No badge</option>
                            <option value="USER">Verified</option>
                            <option value="DEVELOPER">Developer</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                          {u.id === user?.id ? (
                            <span className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                              You
                            </span>
                          ) : (
                            <>
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
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-900/30 transition-all"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-slate-500">
                        {users.length === 0 ? 'No users found.' : 'No users match this filter.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Developer Invite Links — hand a not-yet-registered person a URL */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
            <div className="flex items-center gap-2 pb-4 border-b border-white/10">
              <Link2 className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Developer Invite Links</h3>
              <span className="ml-auto rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-slate-400">
                {invites.length} {invites.length === 1 ? 'link' : 'links'}
              </span>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              رابط خاص لشخص <b className="text-slate-200">غير مسجَّل بعد</b> — عند إنشائه للحساب عبر الرابط يحصل
              فوراً على الصلاحيات والتوثيق المحددين هنا. صالح 7 أيام ويُلغى بضغطة واحدة.
            </p>

            {/* Create form */}
            <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-3">
              <label className="text-[11px] text-slate-400">
                Role
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="mt-1 block rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="ADMIN">ADMIN — أدمن</option>
                  <option value="USER">USER — مستخدم</option>
                </select>
              </label>
              <label className="text-[11px] text-slate-400">
                Badge
                <select
                  value={inviteBadge}
                  onChange={(e) => setInviteBadge(e.target.value)}
                  className="mt-1 block rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">No badge</option>
                  <option value="USER">Verified</option>
                  <option value="DEVELOPER">Developer</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
              <label className="text-[11px] text-slate-400">
                Uses
                <select
                  value={inviteUses}
                  onChange={(e) => setInviteUses(Number(e.target.value))}
                  className="mt-1 block rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 focus:border-cyan-500 focus:outline-none"
                >
                  <option value={1}>1 use</option>
                  <option value={5}>5 uses</option>
                  <option value={10}>10 uses</option>
                </select>
              </label>
              <label className="grow min-w-[180px] text-[11px] text-slate-400">
                Note (optional)
                <input
                  value={inviteNote}
                  onChange={(e) => setInviteNote(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. co-developer for the bot"
                  className="mt-1 block w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </label>
              <button
                onClick={handleCreateInvite}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-[11px] font-semibold text-white transition-all hover:from-cyan-400 hover:to-blue-500"
              >
                <Link2 className="h-3.5 w-3.5" /> Create link
              </button>
            </div>

            {/* Just-created link, ready to copy */}
            {freshLink && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2.5">
                <Link2 className="h-4 w-4 shrink-0 text-cyan-300" />
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-cyan-100">{freshLink}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(freshLink);
                    flashSuccess('Link copied to clipboard');
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-cyan-400/40 bg-slate-950/60 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 transition-all hover:bg-slate-900"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
              </div>
            )}

            {/* Invite list */}
            <div className="mt-4 space-y-2">
              {invites.length === 0 && (
                <p className="text-xs text-slate-500">No invite links yet — create one above.</p>
              )}
              {invites.map((inv) => {
                const st = inviteStatus(inv);
                return (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2.5"
                  >
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${st.cls}`}
                    >
                      {st.label}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                      {inv.role === 'ADMIN' ? 'ADMIN' : 'USER'}
                      {inv.verification && <VerifiedBadge type={inv.verification} />}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {inv.uses}/{inv.maxUses} uses
                    </span>
                    <span className="min-w-0 truncate text-[11px] text-slate-400">
                      by {inv.createdByName}
                      {inv.note ? ` — ${inv.note}` : ''}
                    </span>
                    <span className="font-mono text-[10px] text-slate-600">
                      exp {new Date(inv.expiresAt).toLocaleDateString()}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      {!inv.revoked && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`);
                            flashSuccess('Invite link copied to clipboard');
                          }}
                          className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-200 transition-all hover:bg-cyan-500/20"
                        >
                          <Copy className="h-3 w-3" /> Copy link
                        </button>
                      )}
                      {!inv.revoked && (
                        <button
                          onClick={() => handleRevokeInvite(inv)}
                          className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] text-red-300 transition-all hover:bg-red-500/20"
                        >
                          <Ban className="h-3 w-3" /> Revoke
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Security Threat Feed — live entries from the statistics endpoint */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
            <div className="flex items-center gap-2 pb-4 border-b border-white/10">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Security Threat Feed</h3>
              <span className="ml-auto rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-slate-400">
                {threats.length} {threats.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {threats.length === 0 && (
                <p className="text-xs text-slate-500">No security threats recorded — the platform is clean.</p>
              )}
              {threats.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                  <div>
                    <p className="text-xs font-semibold text-white">{t.title}</p>
                    <p className="text-[11px] text-slate-400">{t.description}</p>
                    <p className="mt-1 font-mono text-[10px] text-slate-500">
                      {t.source} · {t.ip} · {new Date(t.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase border ${
                      t.level === 'CRITICAL'
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        : t.level === 'HIGH'
                        ? 'bg-orange-500/10 text-orange-300 border-orange-500/30'
                        : t.level === 'MEDIUM'
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                    }`}
                  >
                    {t.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ============================ MODERATION ============================ */}
      {section === 'admin-moderation' && (
        <>
          {/* Comments Across All Docs */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl overflow-hidden shadow-2xl">
            <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-400" />
                <h2 className="text-sm font-bold text-white">Comments Across All Docs</h2>
                <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-slate-400">
                  {comments.length}
                </span>
              </div>

              <div className="w-full sm:w-64 relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by author, doc or text..."
                  value={modSearch}
                  onChange={(e) => setModSearch(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="divide-y divide-white/5">
              {filteredComments.length === 0 && (
                <p className="p-6 text-xs text-slate-500">
                  {comments.length === 0 ? 'No comments yet — nothing to moderate.' : 'No comments match this filter.'}
                </p>
              )}
              {filteredComments.map((c) => (
                <div key={c.id} className="p-4 flex items-start justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    {c.authorAvatar ? (
                      <img
                        src={c.authorAvatar}
                        alt={c.authorName}
                        className="h-8 w-8 shrink-0 rounded-lg object-cover border border-white/10"
                      />
                    ) : (
                      <div className="h-8 w-8 shrink-0 rounded-lg bg-blue-950/40 border border-blue-500/30 flex items-center justify-center text-[11px] font-bold text-blue-300">
                        {(c.authorName || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white">
                        {c.authorName}
                        <span className="ml-2 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
                          {c.docId}
                        </span>
                        <span className="ml-2 font-mono text-[10px] text-slate-500">
                          {new Date(c.createdAt).toLocaleString()}
                        </span>
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400 break-words">{c.body}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteComment(c)}
                    className="shrink-0 rounded-lg border border-rose-500/30 bg-rose-950/20 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-900/30 transition-all"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Product Suggestion Review Queue */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl overflow-hidden shadow-2xl">
            <div className="p-4 sm:p-6 border-b border-white/10 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white">Product Suggestion Review Queue</h2>
              <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-slate-400">
                {suggestions.length}
              </span>
            </div>

            <div className="divide-y divide-white/5">
              {suggestions.length === 0 && (
                <p className="p-6 text-xs text-slate-500">No suggestions submitted yet.</p>
              )}
              {suggestions.map((s) => (
                <div key={s.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {s.title}
                        <span
                          className={`ml-2 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                            s.status === 'open'
                              ? 'bg-blue-500/15 text-blue-300'
                              : s.status === 'reviewing'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {s.status}
                        </span>
                        <span className="ml-1.5 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-400">
                          {s.category}
                        </span>
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">{s.details}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">
                        {s.authorName} · {new Date(s.createdAt).toLocaleString()}
                        {s.code ? ' · includes code sample' : ''}
                      </p>
                      {s.adminNote && (
                        <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-1.5 text-[11px] text-amber-200">
                          Admin note: {s.adminNote}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
                      {s.status === 'open' && (
                        <button
                          onClick={() => handleSuggestionStatus(s, 'reviewing')}
                          className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-900/30 transition-all"
                        >
                          Start Review
                        </button>
                      )}
                      {s.status !== 'resolved' && (
                        <button
                          onClick={() => handleSuggestionStatus(s, 'resolved')}
                          className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-900/30 transition-all"
                        >
                          Resolve
                        </button>
                      )}
                      {s.status !== 'open' && (
                        <button
                          onClick={() => handleSuggestionStatus(s, 'open')}
                          className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-white transition-all"
                        >
                          Reopen
                        </button>
                      )}
                      {s.code && (
                        <button
                          onClick={() => handleAiFix(s)}
                          className="rounded-lg border border-blue-500/30 bg-blue-950/20 px-2.5 py-1 text-[11px] font-semibold text-blue-300 hover:bg-blue-900/30 transition-all"
                        >
                          AI Repair
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ============================ PERMISSIONS MATRIX ============================ */}
      {section === 'admin-permissions' && (
        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
          <div className="flex items-center gap-2 pb-4 border-b border-white/10">
            <Lock className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white">Grantable API Scopes</h3>
            <span className="ml-auto rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-slate-400">
              {allScopes.length} scopes
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Every scope grantable on API keys, grouped by capability family.{' '}
            <span className="text-amber-300 font-semibold">ADMIN</span> sessions hold ALL scopes automatically —
            amber rows are administrator-only capabilities.
          </p>

          {allScopes.length === 0 && (
            <p className="mt-4 text-xs text-slate-500">Loading scopes…</p>
          )}

          <div className="mt-5 space-y-5">
            {scopeGroups.map((g) => (
              <div key={g.name}>
                <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{g.name}</p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {g.items.map((s) => (
                    <div
                      key={s.scope}
                      className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white">{s.label}</p>
                        <p className="font-mono text-[10px] text-slate-500">{s.scope}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                          s.adminOnly ? 'bg-amber-500/15 text-amber-300' : 'bg-blue-500/15 text-blue-300'
                        }`}
                      >
                        {s.adminOnly ? 'admin only' : 'grantable'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================ FEATURE FLAGS ============================ */}
      {section === 'admin-flags' && (
        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
          <div className="flex items-center gap-2 pb-4 border-b border-white/10">
            <Sliders className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white">Dynamic Feature Flags</h3>
            <span className="ml-auto rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-slate-400">
              {flags.length} flags
            </span>
          </div>

          {maintenanceFlag?.enabled && (
            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-950/30 p-3 text-[11px] text-amber-200">
              ⚠ Maintenance mode is ACTIVE — non-admin traffic is being rejected with 503.
            </div>
          )}

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
            {flags.length === 0 && <p className="text-xs text-slate-500">No feature flags found.</p>}
          </div>
        </div>
      )}

      {/* ============================ EMERGENCY ============================ */}
      {section === 'admin-emergency' && (
        <div className="max-w-2xl rounded-3xl border border-rose-500/20 bg-rose-950/10 p-6 backdrop-blur-xl">
          <div className="flex items-center gap-2 pb-4 border-b border-rose-500/20">
            <AlertOctagon className="h-4 w-4 text-rose-400" />
            <h3 className="text-sm font-bold text-rose-200">Emergency & Incident Controls</h3>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${
                maintenanceFlag?.enabled ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
              }`}
            >
              Maintenance: {maintenanceFlag?.enabled ? 'ON' : 'OFF'}
            </span>
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
      )}
    </div>
  );
};
