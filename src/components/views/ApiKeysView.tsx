import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../lib/apiClient.ts';
import { ApiKey, PermissionScope } from '../../types.ts';
import { ApiKeyUsageChart } from './ApiKeyUsageChart.tsx';
import {
  Key,
  Plus,
  RotateCw,
  Trash2,
  Copy,
  Check,
  Shield,
  Clock,
  AlertTriangle,
  Lock,
  CheckCircle2,
  Gauge,
  Activity,
  Zap,
  Sliders,
  ShieldAlert,
  TrendingUp,
  BarChart2,
  Settings2,
  Flame,
  RefreshCw,
  Play,
  Server,
  Info,
  SlidersHorizontal,
  Layers,
  Sparkles,
  Download,
  FileSpreadsheet,
  Search,
  Filter,
  Bot,
  Terminal,
} from 'lucide-react';

interface RateLimitPreset {
  id: string;
  name: string;
  rpm: number;
  burst: number;
  algorithm: 'sliding_window' | 'token_bucket' | 'fixed_window';
  action: 'reject_429' | 'throttle_delay' | 'alert_only';
  quota: number;
  description: string;
}

const RATE_LIMIT_PRESETS: RateLimitPreset[] = [
  {
    id: 'dev',
    name: 'Developer Sandbox',
    rpm: 120,
    burst: 15,
    algorithm: 'fixed_window',
    action: 'alert_only',
    quota: 50000,
    description: 'Permissive development tier for local testing and debugging.',
  },
  {
    id: 'standard',
    name: 'Standard Application',
    rpm: 600,
    burst: 30,
    algorithm: 'sliding_window',
    action: 'reject_429',
    quota: 200000,
    description: 'Recommended for standard production web & mobile clients.',
  },
  {
    id: 'high',
    name: 'High-Throughput Ingress',
    rpm: 1800,
    burst: 90,
    algorithm: 'token_bucket',
    action: 'reject_429',
    quota: 500000,
    description: 'Optimized for high-concurrency microservices and batch jobs.',
  },
  {
    id: 'bot',
    name: 'Autonomous Bot Dispatch',
    rpm: 3600,
    burst: 180,
    algorithm: 'token_bucket',
    action: 'throttle_delay',
    quota: 1000000,
    description: 'High capacity token bucket with adaptive throttling for bots.',
  },
];

export const ApiKeysView: React.FC = () => {
  const { role } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [allScopes, setAllScopes] = useState<{ scope: PermissionScope; label: string; group: string; adminOnly: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRotateConfirm, setIsRotateConfirm] = useState<ApiKey | null>(null);
  const [isRevokeConfirm, setIsRevokeConfirm] = useState<ApiKey | null>(null);
  const [revokeInputText, setRevokeInputText] = useState('');
  const [isScopesModalOpen, setIsScopesModalOpen] = useState<ApiKey | null>(null);
  const [selectedScopesForEdit, setSelectedScopesForEdit] = useState<PermissionScope[]>([]);

  // Rate Limit Configuration Modal state
  const [isRateLimitModalOpen, setIsRateLimitModalOpen] = useState<ApiKey | null>(null);
  const [editRpm, setEditRpm] = useState<number>(600);
  const [editBurst, setEditBurst] = useState<number>(30);
  const [editAlgorithm, setEditAlgorithm] = useState<'sliding_window' | 'token_bucket' | 'fixed_window'>('sliding_window');
  const [editAction, setEditAction] = useState<'reject_429' | 'throttle_delay' | 'alert_only'>('reject_429');
  const [editQuota, setEditQuota] = useState<number>(200000);
  const [savingRateLimit, setSavingRateLimit] = useState(false);

  // Simulation state
  const [simulatingKeyId, setSimulatingKeyId] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<{
    keyId: string;
    keyName: string;
    batch: number;
    currentRpm: number;
    isThrottled: boolean;
    headers: {
      'x-ratelimit-limit': number;
      'x-ratelimit-remaining': number;
      'x-ratelimit-reset': number;
      'retry-after': number;
    };
  } | null>(null);

  // One-time reveal modal
  const [revealedSecret, setRevealedSecret] = useState<{ key: ApiKey; rawSecret: string; note: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Create form state
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyEnv, setNewKeyEnv] = useState<'live' | 'test'>('live');
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(600);
  const [newKeyBurst, setNewKeyBurst] = useState(30);
  const [newKeyAlgorithm, setNewKeyAlgorithm] = useState<'sliding_window' | 'token_bucket' | 'fixed_window'>('sliding_window');
  const [newKeyAction, setNewKeyAction] = useState<'reject_429' | 'throttle_delay' | 'alert_only'>('reject_429');
  const [newKeyQuota, setNewKeyQuota] = useState(200000);
  const [newKeyScopes, setNewKeyScopes] = useState<PermissionScope[]>(['api.read', 'keys.read', 'bot.execute']);

  // Rate Limit Filter / Tab
  const [rateLimitSearch, setRateLimitSearch] = useState('');

  // AI-Powered Natural Language Search & Smart Filter
  const [aiSearchQuery, setAiSearchQuery] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const loadKeys = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getApiKeys();
      setKeys(data.keys);
      setAllScopes(data.allScopes);
    } catch (err: any) {
      setError(err.message || 'Failed loading keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, [role]);

  const showNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const res = await api.createApiKey({
        name: newKeyName,
        environment: newKeyEnv,
        rateLimitPerMin: newKeyRateLimit,
        scopes: newKeyScopes,
      });

      // Also set rate limit properties if custom
      if (res.key && (newKeyBurst || newKeyAlgorithm !== 'sliding_window' || newKeyAction !== 'reject_429' || newKeyQuota)) {
        await api.updateApiKeyRateLimit(res.key.id, {
          rateLimitPerMin: newKeyRateLimit,
          burstLimit: newKeyBurst,
          rateLimitAlgorithm: newKeyAlgorithm,
          actionOnExceed: newKeyAction,
          monthlyQuota: newKeyQuota,
        });
      }

      setIsCreateOpen(false);
      setNewKeyName('');
      setRevealedSecret({
        key: res.key,
        rawSecret: res.rawSecret,
        note: res.revealNote,
      });
      loadKeys();
      showNotification(`API Key "${res.key.name}" successfully created with ${newKeyRateLimit} req/min rate limit.`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRotate = async () => {
    if (!isRotateConfirm) return;
    try {
      setError(null);
      const res = await api.rotateApiKey(isRotateConfirm.id);
      setIsRotateConfirm(null);
      setRevealedSecret({
        key: res.key,
        rawSecret: res.rawSecret,
        note: res.revealNote,
      });
      loadKeys();
      showNotification(`API Key "${res.key.name}" secrets successfully rotated and previous token invalidated.`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRevoke = async () => {
    if (!isRevokeConfirm || revokeInputText !== 'REVOKE') return;
    try {
      setError(null);
      await api.revokeApiKey(isRevokeConfirm.id, 'User manually revoked key via UI');
      setIsRevokeConfirm(null);
      setRevokeInputText('');
      loadKeys();
      showNotification(`API Key "${isRevokeConfirm.name}" permanently revoked.`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openScopesModal = (k: ApiKey) => {
    setIsScopesModalOpen(k);
    setSelectedScopesForEdit([...k.scopes]);
  };

  const handleSaveScopes = async () => {
    if (!isScopesModalOpen) return;
    try {
      setError(null);
      await api.updateApiKeyScopes(isScopesModalOpen.id, selectedScopesForEdit);
      setIsScopesModalOpen(null);
      loadKeys();
      showNotification(`Scopes updated for "${isScopesModalOpen.name}".`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openRateLimitModal = (k: ApiKey) => {
    setIsRateLimitModalOpen(k);
    setEditRpm(k.rateLimitPerMin || 600);
    setEditBurst(k.burstLimit || Math.round((k.rateLimitPerMin || 600) * 0.05));
    setEditAlgorithm(k.rateLimitAlgorithm || 'sliding_window');
    setEditAction(k.actionOnExceed || 'reject_429');
    setEditQuota(k.monthlyQuota || (k.rateLimitPerMin || 600) * 500);
  };

  const applyPreset = (preset: RateLimitPreset) => {
    setEditRpm(preset.rpm);
    setEditBurst(preset.burst);
    setEditAlgorithm(preset.algorithm);
    setEditAction(preset.action);
    setEditQuota(preset.quota);
  };

  const handleSaveRateLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRateLimitModalOpen) return;
    try {
      setSavingRateLimit(true);
      setError(null);
      await api.updateApiKeyRateLimit(isRateLimitModalOpen.id, {
        rateLimitPerMin: editRpm,
        burstLimit: editBurst,
        rateLimitAlgorithm: editAlgorithm,
        actionOnExceed: editAction,
        monthlyQuota: editQuota,
      });

      setIsRateLimitModalOpen(null);
      loadKeys();
      showNotification(`Rate limit updated to ${editRpm.toLocaleString()} req/min for "${isRateLimitModalOpen.name}".`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingRateLimit(false);
    }
  };

  const handleSimulateTraffic = async (key: ApiKey, count: number) => {
    try {
      setSimulatingKeyId(key.id);
      setError(null);
      const res = await api.simulateApiKeyTraffic(key.id, count);
      setSimulationResult({
        keyId: key.id,
        keyName: key.name,
        batch: count,
        currentRpm: res.currentRpm,
        isThrottled: res.isThrottled,
        headers: res.headers,
      });

      // Update local state without full reload
      setKeys((prev) =>
        prev.map((k) =>
          k.id === key.id
            ? {
                ...k,
                currentRpmUsage: res.currentRpm,
                usageCount: k.usageCount + count,
                currentUsageThisMonth: (k.currentUsageThisMonth || 0) + count,
              }
            : k
        )
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSimulatingKeyId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleScopeSelection = (scope: PermissionScope) => {
    if (newKeyScopes.includes(scope)) {
      setNewKeyScopes(newKeyScopes.filter((s) => s !== scope));
    } else {
      setNewKeyScopes([...newKeyScopes, scope]);
    }
  };

  const toggleEditScopeSelection = (scope: PermissionScope) => {
    if (selectedScopesForEdit.includes(scope)) {
      setSelectedScopesForEdit(selectedScopesForEdit.filter((s) => s !== scope));
    } else {
      setSelectedScopesForEdit([...selectedScopesForEdit, scope]);
    }
  };

  // Compute Telemetry Aggregates
  const activeKeys = keys.filter((k) => k.status === 'active');
  const totalCapacityRpm = activeKeys.reduce((acc, k) => acc + (k.rateLimitPerMin || 0), 0);
  const totalCurrentRpm = activeKeys.reduce((acc, k) => acc + (k.currentRpmUsage || 0), 0);
  const totalMonthlyQuota = activeKeys.reduce((acc, k) => acc + (k.monthlyQuota || 0), 0);
  const totalMonthlyUsage = activeKeys.reduce((acc, k) => acc + (k.currentUsageThisMonth || 0), 0);
  const globalCapacityPercent = totalCapacityRpm > 0 ? Math.min(100, Math.round((totalCurrentRpm / totalCapacityRpm) * 100)) : 0;

  // AI-Powered Natural Language Search & Smart Filter Parser
  const parseAiKeyQuery = (query: string, keyList: ApiKey[]) => {
    if (!query.trim()) return { filtered: keyList, tags: [] as string[] };

    const q = query.toLowerCase().trim();
    const tags: string[] = [];
    let result = [...keyList];

    // Check environment
    if (q.includes('live') || q.includes('production') || q.includes('مباشر') || q.includes('إنتاج')) {
      result = result.filter((k) => k.environment === 'live');
      tags.push('Env: Live');
    } else if (q.includes('test') || q.includes('sandbox') || q.includes('تجريب') || q.includes('اختبار')) {
      result = result.filter((k) => k.environment === 'test');
      tags.push('Env: Test Sandbox');
    }

    // Check status
    if (q.includes('active') || q.includes('نشط') || q.includes('فعال')) {
      result = result.filter((k) => k.status === 'active');
      tags.push('Status: Active');
    } else if (q.includes('revoked') || q.includes('معطل') || q.includes('ملغ')) {
      result = result.filter((k) => k.status === 'revoked');
      tags.push('Status: Revoked');
    } else if (q.includes('suspended') || q.includes('معلق')) {
      result = result.filter((k) => k.status === 'suspended');
      tags.push('Status: Suspended');
    }

    // Check RPM limits
    const rpmMatch = q.match(/(?:>|over|above|أكثر من|أعلى من)\s*(\d+)/i) || q.match(/(\d+)\s*(?:rpm|req|طلب)/i);
    if (rpmMatch && Number(rpmMatch[1])) {
      const minRpm = Number(rpmMatch[1]);
      result = result.filter((k) => (k.rateLimitPerMin || 0) >= minRpm);
      tags.push(`RPM >= ${minRpm}`);
    }

    // Check Scopes
    if (q.includes('bot') || q.includes('بوت') || q.includes('automation')) {
      result = result.filter((k) => k.scopes.some((s) => s.includes('bot')));
      tags.push('Scope: bot.execute');
    }
    if (q.includes('admin') || q.includes('أدمن') || q.includes('مدير') || q.includes('manage')) {
      result = result.filter((k) => k.scopes.some((s) => s.includes('manage') || s.includes('delete') || s.includes('admin')));
      tags.push('Scope: Admin Manage');
    }
    if (q.includes('webhook') || q.includes('ويب هوك')) {
      result = result.filter((k) => k.scopes.some((s) => s.includes('webhook')));
      tags.push('Scope: webhooks.manage');
    }

    // Check Algorithms
    if (q.includes('token') || q.includes('توكن')) {
      result = result.filter((k) => k.rateLimitAlgorithm === 'token_bucket');
      tags.push('Algo: Token Bucket');
    } else if (q.includes('sliding') || q.includes('نافذة')) {
      result = result.filter((k) => k.rateLimitAlgorithm === 'sliding_window');
      tags.push('Algo: Sliding Window');
    }

    // If no specific semantic tag matched, perform fuzzy full-text keyword match
    if (tags.length === 0) {
      result = result.filter(
        (k) =>
          k.name.toLowerCase().includes(q) ||
          k.keyPrefix.toLowerCase().includes(q) ||
          k.ownerName.toLowerCase().includes(q) ||
          k.maskedSecret.toLowerCase().includes(q) ||
          k.scopes.some((s) => s.toLowerCase().includes(q))
      );
      tags.push(`Keyword: "${query}"`);
    }

    return { filtered: result, tags };
  };

  const aiSearchResult = parseAiKeyQuery(aiSearchQuery, keys);
  const keysForTable = aiSearchResult.filtered;

  // Filtered keys for Rate Limit section
  const filteredKeys = keys.filter(
    (k) =>
      k.name.toLowerCase().includes(rateLimitSearch.toLowerCase()) ||
      k.keyPrefix.toLowerCase().includes(rateLimitSearch.toLowerCase()) ||
      k.ownerName.toLowerCase().includes(rateLimitSearch.toLowerCase())
  );

  // CSV Export Logic
  const handleExportCsv = (filterType: 'all' | 'active' | 'live' | 'test' = 'all') => {
    setExportMenuOpen(false);
    let targetKeys = keys;
    if (filterType === 'active') targetKeys = keys.filter((k) => k.status === 'active');
    else if (filterType === 'live') targetKeys = keys.filter((k) => k.environment === 'live');
    else if (filterType === 'test') targetKeys = keys.filter((k) => k.environment === 'test');

    if (targetKeys.length === 0) {
      showNotification('No API keys matched the selected export filter.');
      return;
    }

    const headers = [
      'Key ID',
      'Key Name',
      'Key Prefix',
      'Masked Secret',
      'Owner Name',
      'Environment',
      'Status',
      'Rate Limit (RPM)',
      'Burst Limit',
      'Algorithm',
      'Action on Exceed',
      'Monthly Quota',
      'Total Requests Count',
      'Current Month Usage',
      'Configured Scopes',
      'Created At',
      'Last Used At',
      'Expires At',
    ];

    const rows = targetKeys.map((k) => [
      `"${k.id}"`,
      `"${k.name.replace(/"/g, '""')}"`,
      `"${k.keyPrefix}"`,
      `"${k.maskedSecret}"`,
      `"${k.ownerName.replace(/"/g, '""')}"`,
      `"${k.environment}"`,
      `"${k.status}"`,
      k.rateLimitPerMin || 0,
      k.burstLimit || 0,
      `"${k.rateLimitAlgorithm || 'sliding_window'}"`,
      `"${k.actionOnExceed || 'reject_429'}"`,
      k.monthlyQuota || 0,
      k.usageCount || 0,
      k.currentUsageThisMonth || 0,
      `"${k.scopes.join('; ')}"`,
      `"${k.createdAt}"`,
      `"${k.lastUsedAt || 'Never'}"`,
      `"${k.expiresAt || 'Never'}"`,
    ]);

    // Prepend UTF-8 BOM so Excel & Sheets open Arabic / Unicode characters seamlessly
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `vanitas_api_keys_${filterType}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showNotification(`Exported ${targetKeys.length} API keys to CSV file successfully (${filterType.toUpperCase()})`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Key className="h-6 w-6 text-blue-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">API Keys & Rate Limit Governance</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Manage granular tokens, enforce permission scopes, configure algorithmic rate limits, and prevent resource abuse.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* CSV Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800 transition-all shadow-sm"
              title="Export API key metadata and rate limits to CSV"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
              <span>Export CSV</span>
              <Download className="h-3 w-3 text-slate-400" />
            </button>

            {exportMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-white/10 bg-slate-950/95 backdrop-blur-xl p-2 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Download Formats
                </div>
                <button
                  onClick={() => handleExportCsv('all')}
                  className="w-full text-left flex items-center justify-between rounded-xl px-2.5 py-2 text-xs text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                    All API Keys
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">({keys.length})</span>
                </button>
                <button
                  onClick={() => handleExportCsv('active')}
                  className="w-full text-left flex items-center justify-between rounded-xl px-2.5 py-2 text-xs text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
                    Active Only
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">({activeKeys.length})</span>
                </button>
                <button
                  onClick={() => handleExportCsv('live')}
                  className="w-full text-left flex items-center justify-between rounded-xl px-2.5 py-2 text-xs text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-amber-400" />
                    Production (Live)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ({keys.filter((k) => k.environment === 'live').length})
                  </span>
                </button>
                <button
                  onClick={() => handleExportCsv('test')}
                  className="w-full text-left flex items-center justify-between rounded-xl px-2.5 py-2 text-xs text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-purple-400" />
                    Test / Sandbox
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ({keys.filter((k) => k.environment === 'test').length})
                  </span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={loadKeys}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
            title="Refresh keys and rate limit telemetry"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Generate New Key</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs text-emerald-300 flex items-center justify-between shadow-lg shadow-emerald-950/50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300 flex items-center justify-between shadow-lg shadow-rose-950/50">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* SECTION 1: RATE LIMITS & RESOURCE ALLOCATION DASHBOARD */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-indigo-400" />
              <h2 className="text-base sm:text-lg font-bold text-white">Rate Limits & Resource Allocation</h2>
              <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/20">
                Live Protection
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Visualize real-time request ingress, configure per-key rate limits, burst buffers, and throttle policies.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Filter by key or owner..."
                value={rateLimitSearch}
                onChange={(e) => setRateLimitSearch(e.target.value)}
                className="w-48 sm:w-60 rounded-xl border border-white/10 bg-slate-900/90 py-1.5 pl-3 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Global Capacity Overview Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4.5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Total Configured Ingress</span>
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                <Gauge className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-white">{totalCapacityRpm.toLocaleString()}</span>
              <span className="text-xs text-slate-400 font-mono">req/min</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Across {activeKeys.length} active authorized tokens</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4.5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Live Ingress Load</span>
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-emerald-400">{totalCurrentRpm.toLocaleString()}</span>
              <span className="text-xs text-slate-400 font-mono">req/min ({globalCapacityPercent}%)</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full transition-all duration-500 ${
                  globalCapacityPercent > 80 ? 'bg-rose-500' : globalCapacityPercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${globalCapacityPercent}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4.5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Monthly Quota Pool</span>
              <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
                <BarChart2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-white">{(totalMonthlyUsage / 1000).toFixed(1)}k</span>
              <span className="text-xs text-slate-400 font-mono">/ {(totalMonthlyQuota / 1000).toFixed(0)}k reqs</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {totalMonthlyQuota > 0 ? ((totalMonthlyUsage / totalMonthlyQuota) * 100).toFixed(1) : 0}% aggregate monthly usage
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4.5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Abuse Protection</span>
              <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
                <ShieldAlert className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-purple-300">Sliding Window & Token Bucket</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Auto HTTP 429 & Retry-After headers enforced</p>
          </div>
        </div>

        {/* Live Simulation Response Toast / Banner */}
        {simulationResult && (
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/50 p-4 backdrop-blur-xl animate-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border flex-shrink-0 ${
                    simulationResult.isThrottled
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  {simulationResult.isThrottled ? <ShieldAlert className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white">
                      Traffic Simulation: {simulationResult.batch} Requests dispatched to "{simulationResult.keyName}"
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                        simulationResult.isThrottled
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {simulationResult.isThrottled ? '429 Rate Limit Exceeded (Throttled)' : '200 OK (Allowed)'}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-300">
                    <span>
                      X-RateLimit-Limit: <strong>{simulationResult.headers['x-ratelimit-limit']}</strong>
                    </span>
                    <span>
                      X-RateLimit-Remaining: <strong className="text-indigo-300">{simulationResult.headers['x-ratelimit-remaining']}</strong>
                    </span>
                    <span>
                      X-RateLimit-Reset: <strong>in {simulationResult.headers['x-ratelimit-reset'] - Math.floor(Date.now() / 1000)}s</strong>
                    </span>
                    {simulationResult.isThrottled && (
                      <span className="text-rose-400 font-bold">
                        Retry-After: {simulationResult.headers['retry-after']}s
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSimulationResult(null)}
                className="self-end md:self-center rounded-lg bg-white/10 px-3 py-1 text-xs text-slate-300 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Per-Key Rate Limit Visualizer Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredKeys.map((k) => {
            const rpm = k.rateLimitPerMin || 600;
            const currentRpm = k.currentRpmUsage || 0;
            const usagePercent = Math.min(100, Math.round((currentRpm / rpm) * 100));
            const isThrottled = currentRpm >= rpm;

            const monthlyQuota = k.monthlyQuota || rpm * 500;
            const currentMonthUsage = k.currentUsageThisMonth || k.usageCount || 0;
            const quotaPercent = Math.min(100, Math.round((currentMonthUsage / monthlyQuota) * 100));

            return (
              <div
                key={`rl_${k.id}`}
                className={`rounded-2xl border bg-slate-950/70 p-5 backdrop-blur-xl transition-all shadow-xl ${
                  k.status === 'revoked'
                    ? 'border-white/5 opacity-60'
                    : isThrottled
                    ? 'border-rose-500/40 shadow-rose-950/30'
                    : usagePercent > 70
                    ? 'border-amber-500/30 shadow-amber-950/20'
                    : 'border-white/10 hover:border-indigo-500/30'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{k.name}</span>
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[9px] uppercase font-semibold border ${
                          k.environment === 'live'
                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {k.environment}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[9px] uppercase font-semibold ${
                          k.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {k.status}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-slate-400 mt-1">{k.maskedSecret}</p>
                  </div>

                  <button
                    onClick={() => openRateLimitModal(k)}
                    disabled={k.status === 'revoked'}
                    className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-950/30 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-900/40 hover:text-white transition-all disabled:opacity-40"
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    <span>Configure Policy</span>
                  </button>
                </div>

                {/* Live Minute Ingress Gauge */}
                <div className="mt-4 rounded-xl border border-white/5 bg-slate-900/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-indigo-400" />
                      Live Minute Consumption
                    </span>
                    <span className="font-mono text-xs">
                      <strong
                        className={
                          isThrottled
                            ? 'text-rose-400'
                            : usagePercent > 70
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }
                      >
                        {currentRpm.toLocaleString()}
                      </strong>
                      <span className="text-slate-500"> / {rpm.toLocaleString()} req/m ({usagePercent}%)</span>
                    </span>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isThrottled
                          ? 'bg-rose-500'
                          : usagePercent > 70
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                    <span>
                      Algorithm: <strong className="text-slate-300 capitalize">{k.rateLimitAlgorithm?.replace('_', ' ') || 'Sliding Window'}</strong>
                    </span>
                    <span>
                      Burst Buffer: <strong className="text-indigo-300 font-mono">+{k.burstLimit || Math.round(rpm * 0.05)} reqs</strong>
                    </span>
                  </div>
                </div>

                {/* Monthly Quota & Action Policy */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/5 bg-slate-900/40 p-2.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span>Monthly Quota</span>
                      <span className="font-mono text-slate-300 font-medium">{quotaPercent}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${quotaPercent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400 font-mono">
                      {currentMonthUsage.toLocaleString()} / {monthlyQuota.toLocaleString()}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-slate-900/40 p-2.5">
                    <span className="block text-[11px] text-slate-400">On Exceed Action</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                          k.actionOnExceed === 'throttle_delay'
                            ? 'bg-amber-500/10 text-amber-300'
                            : k.actionOnExceed === 'alert_only'
                            ? 'bg-blue-500/10 text-blue-300'
                            : 'bg-rose-500/10 text-rose-300'
                        }`}
                      >
                        {k.actionOnExceed === 'throttle_delay'
                          ? 'Throttle Delay'
                          : k.actionOnExceed === 'alert_only'
                          ? 'Audit Alert'
                          : '429 Reject'}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500 truncate">
                      {k.actionOnExceed === 'throttle_delay'
                        ? 'Adaptive backoff'
                        : k.actionOnExceed === 'alert_only'
                        ? 'Non-blocking audit'
                        : 'Hard HTTP 429 block'}
                    </p>
                  </div>
                </div>

                {/* Simulation Trigger Bar */}
                {k.status === 'active' && (
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Flame className="h-3.5 w-3.5 text-amber-400" />
                      Simulate Ingress:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleSimulateTraffic(k, 50)}
                        disabled={simulatingKeyId === k.id}
                        className="rounded-lg bg-white/[0.05] hover:bg-white/10 px-2.5 py-1 text-[11px] font-mono text-slate-200 border border-white/10 hover:border-indigo-400/40 transition-all flex items-center gap-1"
                      >
                        <Play className="h-2.5 w-2.5 text-emerald-400" />
                        +50 Reqs
                      </button>
                      <button
                        onClick={() => handleSimulateTraffic(k, 200)}
                        disabled={simulatingKeyId === k.id}
                        className="rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 px-2.5 py-1 text-[11px] font-mono text-indigo-200 border border-indigo-500/30 hover:border-indigo-400 transition-all flex items-center gap-1"
                      >
                        <Zap className="h-2.5 w-2.5 text-indigo-400" />
                        +200 Reqs (Burst)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: USAGE STATISTICS RECHARTS TIME-SERIES VISUALIZATION */}
      <ApiKeyUsageChart keys={keys} onRefreshKeys={loadKeys} />

      {/* SECTION 3: AUTHORIZED API KEYS TABLE & CREDENTIAL LIFECYCLE */}
      <div className="crystal-card rounded-3xl p-6 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="crystal-gem p-2 rounded-xl text-blue-400">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  Active Authorized Keys & Credentials
                  <span className="crystal-badge text-[10px] text-cyan-300 py-0.5 px-2">
                    {keysForTable.length} of {keys.length} Keys
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage cryptographically signed credentials, scope permissions, and query via AI search.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Export Action */}
          <button
            onClick={() => handleExportCsv('all')}
            className="self-start md:self-auto flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/30 hover:bg-emerald-900/40 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition-all shadow-sm"
            title="Download full CSV report of all credentials"
          >
            <Download className="h-3.5 w-3.5 text-emerald-400" />
            <span>Download CSV Report</span>
          </button>
        </div>

        {/* AI-Powered Natural Language Search & Smart Filter Bar */}
        <div className="rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-4 space-y-3 shadow-inner">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
              <Sparkles className="h-4 w-4 text-cyan-400 animate-pulse" />
              <span>AI Smart Search & Intent Filter</span>
            </div>
            {aiSearchQuery && (
              <button
                onClick={() => setAiSearchQuery('')}
                className="text-[11px] text-slate-400 hover:text-white transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cyan-400/70" />
            <input
              type="text"
              value={aiSearchQuery}
              onChange={(e) => setAiSearchQuery(e.target.value)}
              placeholder="e.g., 'active keys with bot permissions', 'RPM > 500', 'live environment', 'مفاتيح بيئة الإنتاج'..."
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 py-2.5 pl-10 pr-10 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 focus:outline-none transition-all"
            />
            {aiSearchQuery && (
              <button
                onClick={() => setAiSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick AI Search Suggestions & Filter Tags */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
              <Filter className="h-3 w-3" /> Quick Prompts:
            </span>
            <button
              onClick={() => setAiSearchQuery('high capacity > 500 rpm')}
              className="rounded-lg bg-white/[0.04] hover:bg-cyan-500/10 hover:border-cyan-500/30 border border-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:text-cyan-200 transition-all font-mono"
            >
              ⚡ RPM &gt; 500
            </button>
            <button
              onClick={() => setAiSearchQuery('bot execution keys')}
              className="rounded-lg bg-white/[0.04] hover:bg-cyan-500/10 hover:border-cyan-500/30 border border-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:text-cyan-200 transition-all font-mono"
            >
              🤖 Bot Automation
            </button>
            <button
              onClick={() => setAiSearchQuery('live production')}
              className="rounded-lg bg-white/[0.04] hover:bg-cyan-500/10 hover:border-cyan-500/30 border border-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:text-cyan-200 transition-all font-mono"
            >
              🛡️ Live Production
            </button>
            <button
              onClick={() => setAiSearchQuery('test sandbox')}
              className="rounded-lg bg-white/[0.04] hover:bg-cyan-500/10 hover:border-cyan-500/30 border border-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:text-cyan-200 transition-all font-mono"
            >
              🧪 Test Sandbox
            </button>
            <button
              onClick={() => setAiSearchQuery('token bucket algorithm')}
              className="rounded-lg bg-white/[0.04] hover:bg-cyan-500/10 hover:border-cyan-500/30 border border-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:text-cyan-200 transition-all font-mono"
            >
              ⏱️ Token Bucket
            </button>
          </div>

          {/* AI Interpretation Badge */}
          {aiSearchResult.tags.length > 0 && (
            <div className="flex items-center gap-2 pt-1 text-[11px] text-cyan-300">
              <Bot className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-slate-400">AI parsed intent:</span>
              <div className="flex flex-wrap gap-1">
                {aiSearchResult.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="rounded bg-cyan-950/80 px-2 py-0.5 font-mono text-[10px] text-cyan-300 border border-cyan-500/30"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Keys List */}
        <div className="divide-y divide-white/5 border border-white/5 rounded-2xl overflow-hidden bg-slate-950/40">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading authorized API keys...</div>
          ) : keysForTable.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 space-y-2">
              <p>No API keys match your AI search query: "{aiSearchQuery}"</p>
              <button
                onClick={() => setAiSearchQuery('')}
                className="text-cyan-400 hover:underline text-xs"
              >
                Reset search filter
              </button>
            </div>
          ) : (
            keysForTable.map((k) => (
              <div key={k.id} className="p-4 sm:p-6 hover:bg-white/[0.02] transition-colors">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Info */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-bold text-white">{k.name}</span>
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase font-semibold border ${
                          k.environment === 'live'
                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {k.environment}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase font-semibold ${
                          k.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : k.status === 'suspended'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {k.status}
                      </span>
                    </div>

                    {/* Masked Secret Key Display */}
                    <div className="flex items-center gap-2">
                      <code className="rounded-lg bg-black/40 px-2.5 py-1 font-mono text-xs text-slate-300 border border-white/10">
                        {k.maskedSecret}
                      </code>
                      <button
                        onClick={() => copyToClipboard(k.maskedSecret)}
                        className="rounded p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        title="Copy Key Reference"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-4 text-[11px] text-slate-400 flex-wrap">
                      <span>
                        Owner: <strong className="text-slate-300">{k.ownerName}</strong>
                      </span>
                      <span>Created: {new Date(k.createdAt).toLocaleDateString()}</span>
                      <span>Last Used: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleTimeString() : 'Never'}</span>
                      <span>
                        Rate Limit: <strong className="font-mono text-blue-400">{k.rateLimitPerMin} req/m</strong>
                      </span>
                      <span>
                        Total Requests: <strong className="font-mono text-slate-300">{k.usageCount.toLocaleString()}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-end md:self-center flex-wrap">
                    <button
                      onClick={() => openRateLimitModal(k)}
                      disabled={k.status === 'revoked'}
                      className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-950/20 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-900/30 transition-all disabled:opacity-40"
                      title="Configure rate limits & quotas"
                    >
                      <Gauge className="h-3.5 w-3.5" />
                      <span>{k.rateLimitPerMin} RPM</span>
                    </button>

                    <button
                      onClick={() => openScopesModal(k)}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-400/40 hover:bg-white/[0.08] transition-all"
                    >
                      <span>{k.scopes.length} Scopes</span>
                    </button>

                    {k.status === 'active' && (
                      <>
                        <button
                          onClick={() => setIsRotateConfirm(k)}
                          className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-900/30 transition-all"
                          title="Rotate key secret safely"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Rotate</span>
                        </button>

                        <button
                          onClick={() => {
                            setIsRevokeConfirm(k);
                            setRevokeInputText('');
                          }}
                          className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/30 transition-all"
                          title="Permanently revoke key"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Revoke</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Scopes Badges */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {k.scopes.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-slate-400 border border-white/5"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* MODAL 1: CONFIGURE RATE LIMIT & POLICY MODAL */}
      {isRateLimitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl rounded-3xl border border-indigo-500/30 bg-slate-950 shadow-2xl p-6 sm:p-8 backdrop-blur-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Configure Rate Limit Policy</h3>
                  <p className="text-xs text-slate-400">{isRateLimitModalOpen.name}</p>
                </div>
              </div>
              <button onClick={() => setIsRateLimitModalOpen(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {/* Presets Bar */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-300 mb-2">Preset Resource Tiers</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {RATE_LIMIT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      editRpm === p.rpm
                        ? 'border-indigo-500 bg-indigo-600/20 text-white shadow-md shadow-indigo-600/20'
                        : 'border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-[11px] font-bold truncate">{p.name}</div>
                    <div className="text-[10px] font-mono text-indigo-300 mt-0.5">{p.rpm} RPM</div>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSaveRateLimit} className="mt-5 space-y-4">
              {/* Sliders: Rate Limit RPM & Burst */}
              <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-slate-200 flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5 text-indigo-400" />
                      Rate Limit (Requests / Minute)
                    </span>
                    <span className="font-mono font-bold text-indigo-400 text-sm">{editRpm.toLocaleString()} RPM</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={10000}
                    step={60}
                    value={editRpm}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditRpm(val);
                      setEditBurst(Math.round(val * 0.05));
                    }}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                    <span>60 RPM (Low)</span>
                    <span>1,800 RPM (Standard)</span>
                    <span>10,000 RPM (High)</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-slate-200 flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-amber-400" />
                      Burst Allowance (Instantaneous Concurrency Buffer)
                    </span>
                    <span className="font-mono font-bold text-amber-400 text-sm">+{editBurst} reqs</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={500}
                    step={5}
                    value={editBurst}
                    onChange={(e) => setEditBurst(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Allows brief traffic spikes above the sliding threshold without triggering immediate 429 rejections.
                  </p>
                </div>
              </div>

              {/* Rate Limiting Algorithm */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Rate Limiting Algorithm</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div
                    onClick={() => setEditAlgorithm('sliding_window')}
                    className={`cursor-pointer rounded-xl border p-3 text-xs transition-all ${
                      editAlgorithm === 'sliding_window'
                        ? 'border-indigo-500 bg-indigo-600/20 text-white'
                        : 'border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <div className="font-bold">Sliding Window</div>
                    <p className="text-[10px] text-slate-400 mt-1">Smooth distribution, prevents edge spikes at 00s.</p>
                  </div>

                  <div
                    onClick={() => setEditAlgorithm('token_bucket')}
                    className={`cursor-pointer rounded-xl border p-3 text-xs transition-all ${
                      editAlgorithm === 'token_bucket'
                        ? 'border-indigo-500 bg-indigo-600/20 text-white'
                        : 'border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <div className="font-bold">Token Bucket</div>
                    <p className="text-[10px] text-slate-400 mt-1">Allows bursts while maintaining average rate.</p>
                  </div>

                  <div
                    onClick={() => setEditAlgorithm('fixed_window')}
                    className={`cursor-pointer rounded-xl border p-3 text-xs transition-all ${
                      editAlgorithm === 'fixed_window'
                        ? 'border-indigo-500 bg-indigo-600/20 text-white'
                        : 'border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <div className="font-bold">Fixed Window</div>
                    <p className="text-[10px] text-slate-400 mt-1">Standard 60-second discrete bucket intervals.</p>
                  </div>
                </div>
              </div>

              {/* Action on Exceed */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Action on Limit Exceeded</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div
                    onClick={() => setEditAction('reject_429')}
                    className={`cursor-pointer rounded-xl border p-3 text-xs transition-all ${
                      editAction === 'reject_429'
                        ? 'border-rose-500 bg-rose-600/20 text-white'
                        : 'border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <div className="font-bold text-rose-300">429 Reject (Strict)</div>
                    <p className="text-[10px] text-slate-400 mt-1">Returns HTTP 429 with Retry-After header.</p>
                  </div>

                  <div
                    onClick={() => setEditAction('throttle_delay')}
                    className={`cursor-pointer rounded-xl border p-3 text-xs transition-all ${
                      editAction === 'throttle_delay'
                        ? 'border-amber-500 bg-amber-600/20 text-white'
                        : 'border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <div className="font-bold text-amber-300">Throttle Delay</div>
                    <p className="text-[10px] text-slate-400 mt-1">Queues request with exponential delay backoff.</p>
                  </div>

                  <div
                    onClick={() => setEditAction('alert_only')}
                    className={`cursor-pointer rounded-xl border p-3 text-xs transition-all ${
                      editAction === 'alert_only'
                        ? 'border-blue-500 bg-blue-600/20 text-white'
                        : 'border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <div className="font-bold text-blue-300">Alert Only</div>
                    <p className="text-[10px] text-slate-400 mt-1">Permits ingress but logs security anomaly.</p>
                  </div>
                </div>
              </div>

              {/* Monthly Hard Quota */}
              <div>
                <label className="block text-xs font-semibold text-slate-300">Monthly Request Quota Cap</label>
                <div className="mt-1 flex items-center gap-3">
                  <input
                    type="number"
                    min={1000}
                    max={10000000}
                    step={10000}
                    value={editQuota}
                    onChange={(e) => setEditQuota(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                  />
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    ~{(editQuota / 30).toFixed(0)} reqs/day
                  </span>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsRateLimitModalOpen(null)}
                  className="rounded-xl px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRateLimit}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all disabled:opacity-50"
                >
                  {savingRateLimit ? 'Saving Policy...' : 'Save Rate Limit Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE API KEY MODAL (With Integrated Rate Limit Configuration) */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl rounded-3xl border border-white/15 bg-slate-950/95 shadow-2xl p-6 sm:p-8 backdrop-blur-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Generate Scoped API Key</h3>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300">Key Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Discord Bot Agent / Production Ingress"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Environment</label>
                  <select
                    value={newKeyEnv}
                    onChange={(e: any) => setNewKeyEnv(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="live">Live (Production)</option>
                    <option value="test">Test (Sandbox)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Rate Limit (req/min)</label>
                  <input
                    type="number"
                    min={60}
                    max={10000}
                    value={newKeyRateLimit}
                    onChange={(e) => setNewKeyRateLimit(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Rate Limit Presets */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Rate Limit Preset</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {RATE_LIMIT_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setNewKeyRateLimit(p.rpm);
                        setNewKeyBurst(p.burst);
                        setNewKeyAlgorithm(p.algorithm);
                        setNewKeyAction(p.action);
                        setNewKeyQuota(p.quota);
                      }}
                      className={`rounded-xl border p-2 text-left transition-all ${
                        newKeyRateLimit === p.rpm
                          ? 'border-blue-500 bg-blue-600/20 text-white'
                          : 'border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <div className="text-[10px] font-bold truncate">{p.name}</div>
                      <div className="text-[9px] font-mono text-blue-300">{p.rpm} RPM</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Scopes Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Permission Scopes (assertGrantableScopes checked server-side)
                </label>
                <div className="max-h-40 overflow-y-auto space-y-2 rounded-2xl border border-white/10 bg-slate-900/40 p-3">
                  {allScopes.map((s) => {
                    const isSelected = newKeyScopes.includes(s.scope);
                    const isForbidden = s.adminOnly && role !== 'ADMIN';

                    return (
                      <div
                        key={s.scope}
                        onClick={() => !isForbidden && toggleScopeSelection(s.scope)}
                        className={`flex items-start justify-between rounded-xl p-2 text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-600/20 border border-blue-500/30 text-blue-200'
                            : isForbidden
                            ? 'opacity-40 cursor-not-allowed text-slate-600'
                            : 'hover:bg-white/[0.04] text-slate-300'
                        }`}
                      >
                        <div>
                          <p className="font-mono font-medium text-[11px]">{s.scope}</p>
                          <p className="text-[10px] text-slate-400">{s.label}</p>
                        </div>
                        {isForbidden ? (
                          <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-mono text-rose-400">Admin only</span>
                        ) : (
                          <div
                            className={`h-4 w-4 rounded flex items-center justify-center border ${
                              isSelected ? 'bg-blue-500 border-blue-400 text-white' : 'border-white/20'
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all"
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT SCOPES MODAL */}
      {isScopesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-slate-950/95 shadow-2xl p-6 sm:p-8 backdrop-blur-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-blue-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Modify Granted Scopes</h3>
                  <p className="text-xs text-slate-400">{isScopesModalOpen.name}</p>
                </div>
              </div>
              <button onClick={() => setIsScopesModalOpen(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Active Permissions Matrix
              </label>
              <div className="max-h-60 overflow-y-auto space-y-2 rounded-2xl border border-white/10 bg-slate-900/40 p-3">
                {allScopes.map((s) => {
                  const isSelected = selectedScopesForEdit.includes(s.scope);
                  const isForbidden = s.adminOnly && role !== 'ADMIN';

                  return (
                    <div
                      key={s.scope}
                      onClick={() => !isForbidden && toggleEditScopeSelection(s.scope)}
                      className={`flex items-start justify-between rounded-xl p-2.5 text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-600/20 border border-blue-500/30 text-blue-200'
                          : isForbidden
                          ? 'opacity-40 cursor-not-allowed text-slate-600'
                          : 'hover:bg-white/[0.04] text-slate-300'
                      }`}
                    >
                      <div>
                        <p className="font-mono font-medium text-[11px]">{s.scope}</p>
                        <p className="text-[10px] text-slate-400">{s.label}</p>
                      </div>
                      {isForbidden ? (
                        <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-mono text-rose-400">Admin only</span>
                      ) : (
                        <div
                          className={`h-4 w-4 rounded flex items-center justify-center border ${
                            isSelected ? 'bg-blue-500 border-blue-400 text-white' : 'border-white/20'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setIsScopesModalOpen(null)}
                className="rounded-xl px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveScopes}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all"
              >
                Save Scopes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: ONE-TIME SECRET REVEAL MODAL */}
      {revealedSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in zoom-in-95 duration-200">
          <div className="relative w-full max-w-lg rounded-3xl border border-emerald-500/40 bg-slate-950 shadow-[0_0_50px_rgba(16,185,129,0.2)] p-6 sm:p-8 backdrop-blur-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">API Key Generated & Ready</h3>
                <p className="text-xs text-emerald-400 font-medium">One-Time Secret Reveal</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-950/30 p-3.5 text-xs text-amber-300 leading-relaxed">
              <strong>Security Notice:</strong> {revealedSecret.note} You will NOT be able to view this raw secret again after closing this window.
            </div>

            {/* Secret display */}
            <div className="mt-4">
              <label className="block text-[11px] font-mono uppercase text-slate-400">Raw Secret Key</label>
              <div className="mt-1 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-black/70 p-3">
                <code className="font-mono text-xs text-emerald-300 break-all">{revealedSecret.rawSecret}</code>
                <button
                  onClick={() => copyToClipboard(revealedSecret.rawSecret)}
                  className="ml-3 rounded-lg bg-emerald-600/20 border border-emerald-500/30 p-2 text-emerald-300 hover:bg-emerald-600/40 transition-colors flex-shrink-0"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Code integration snippet */}
            <div className="mt-4">
              <label className="block text-[11px] font-mono uppercase text-slate-400">Environment Snippet (.env)</label>
              <div className="mt-1 rounded-xl border border-white/10 bg-slate-900/90 p-3 font-mono text-[11px] text-slate-300">
                <code>VANITAS_API_KEY="{revealedSecret.rawSecret}"</code>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setRevealedSecret(null)}
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
              >
                I have saved this secret
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ROTATE CONFIRMATION MODAL */}
      {isRotateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-3xl border border-amber-500/30 bg-slate-950 p-6 backdrop-blur-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <RotateCw className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Rotate API Key Secret</h3>
                <p className="text-xs text-slate-400">Key: {isRotateConfirm.name}</p>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-300 leading-relaxed">
              Rotating this key will <strong>immediately invalidate</strong> the current token. Any active bots or desktop services using this key will experience authorization errors until updated.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsRotateConfirm(null)}
                className="rounded-xl px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRotate}
                className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-semibold text-white hover:bg-amber-500 shadow-lg shadow-amber-600/30"
              >
                Confirm Rotation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: REVOKE CONFIRMATION MODAL */}
      {isRevokeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-3xl border border-rose-500/30 bg-slate-950 p-6 backdrop-blur-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Revoke Key Authorization</h3>
                <p className="text-xs text-rose-400 font-medium">Irreversible Destructive Action</p>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-300 leading-relaxed">
              To permanently revoke <strong>{isRevokeConfirm.name}</strong>, type <code className="font-mono text-rose-300 font-bold">REVOKE</code> in the field below:
            </p>

            <input
              type="text"
              placeholder="Type REVOKE to confirm"
              value={revokeInputText}
              onChange={(e) => setRevokeInputText(e.target.value)}
              className="mt-3 w-full rounded-xl border border-rose-500/30 bg-slate-900 py-2.5 px-3 text-center text-xs font-mono text-white placeholder:text-slate-600 focus:border-rose-400 focus:outline-none"
            />

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsRevokeConfirm(null)}
                className="rounded-xl px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRevoke}
                disabled={revokeInputText !== 'REVOKE'}
                className={`rounded-xl px-5 py-2 text-xs font-semibold text-white shadow-lg transition-all ${
                  revokeInputText === 'REVOKE'
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30 cursor-pointer'
                    : 'bg-rose-950/60 text-slate-500 cursor-not-allowed'
                }`}
              >
                Permanently Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
