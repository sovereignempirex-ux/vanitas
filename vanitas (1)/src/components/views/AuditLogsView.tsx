import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../lib/apiClient.ts';
import { AuditLog } from '../../types.ts';
import {
  ScrollText,
  Download,
  Filter,
  Search,
  RotateCw,
  Shield,
  Lock,
  Globe,
  Bot,
  Smartphone,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
} from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const { role, toggleRole } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | 'all'>('24h');
  const [category, setCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  // Inspect Modal
  const [inspectedLog, setInspectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getAdminLogs({
        limit,
        offset: page * limit,
        from: timeframe === 'all' ? undefined : timeframe,
        category: category === 'ALL' ? undefined : category,
        search: search.trim() || undefined,
      });
      setLogs(res.logs);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed fetching audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'ADMIN') {
      fetchLogs();
    }
  }, [role, timeframe, category, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchLogs();
  };

  if (role !== 'ADMIN') {
    return (
      <div className="rounded-3xl border border-rose-500/30 bg-slate-950/80 p-8 sm:p-12 text-center backdrop-blur-xl animate-in zoom-in-95">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-white">403 Forbidden: Audit Logs Protected</h2>
        <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          Audit logs contain security telemetry and are restricted to users with <code className="font-mono text-rose-300 font-bold">logs.read</code> and <code className="font-mono text-rose-300 font-bold">ADMIN</code> privileges.
        </p>
        <div className="mt-6 flex justify-center">
          <button
            onClick={toggleRole}
            className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-amber-500 transition-all"
          >
            <Shield className="h-4 w-4" />
            <span>Switch to ADMIN Role</span>
          </button>
        </div>
      </div>
    );
  }

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'BOT':
        return <Bot className="h-3.5 w-3.5 text-emerald-400" />;
      case 'MOBILE':
        return <Smartphone className="h-3.5 w-3.5 text-purple-400" />;
      case 'DESKTOP':
        return <Laptop className="h-3.5 w-3.5 text-cyan-400" />;
      default:
        return <Globe className="h-3.5 w-3.5 text-blue-400" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-blue-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-white">Security & API Audit Logs</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Immutable ledger capturing every authentication event, key rotation, and administrative change.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={api.getAdminLogsExportUrl()}
            download
            className="flex items-center gap-2 rounded-xl bg-blue-600/20 border border-blue-500/30 px-4 py-2.5 text-xs font-semibold text-blue-300 hover:bg-blue-600/30 transition-all"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 sm:p-5 backdrop-blur-xl shadow-2xl space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Timeframe selector */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-900 p-1 border border-white/10">
            {(['24h', '7d', '30d', 'all'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTimeframe(t);
                  setPage(0);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-mono font-medium transition-all ${
                  timeframe === t ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
            {['ALL', 'AUTH', 'API', 'ADMIN', 'SECURITY', 'BOT'].map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setCategory(cat);
                  setPage(0);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  category === cat
                    ? 'bg-white/10 text-white border border-white/20 font-semibold'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search action, actor, or target..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </form>
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.01] text-[10px] font-mono uppercase text-slate-400">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4">Target</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-[11px]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-slate-500 font-sans">
                    Loading audit events...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-slate-500 font-sans">
                    No matching audit records found for selected filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                      <span className="block text-[9px] text-slate-600">{new Date(log.timestamp).toLocaleDateString()}</span>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-200">
                      <span className="font-semibold">{log.actorName}</span>
                      <span className="block font-mono text-[10px] text-slate-500">{log.actorEmail}</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-blue-300">{log.action}</td>
                    <td className="py-3 px-4">
                      <span className="rounded bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-slate-300">
                        {log.category}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 text-[10px] text-slate-300">
                        {getSourceIcon(log.source)}
                        <span>{log.source}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300 max-w-[180px] truncate" title={log.target}>
                      {log.target}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : log.status === 'WARNING'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setInspectedLog(log)}
                        className="rounded p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        title="Inspect full JSON metadata"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between p-4 border-t border-white/10 text-xs text-slate-400">
          <span>
            Showing <strong className="text-white">{logs.length}</strong> of <strong className="text-white">{total}</strong> total logs
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded-lg border border-white/10 px-3 py-1 text-xs disabled:opacity-30 hover:bg-white/5"
            >
              Previous
            </button>
            <span className="font-mono text-xs text-blue-400">Page {page + 1}</span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={(page + 1) * limit >= total}
              className="rounded-lg border border-white/10 px-3 py-1 text-xs disabled:opacity-30 hover:bg-white/5"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* INSPECT LOG MODAL */}
      {inspectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in zoom-in-95">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-slate-950 p-6 backdrop-blur-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="text-sm font-bold text-white">Audit Event: {inspectedLog.action}</h3>
                <p className="font-mono text-[10px] text-slate-500">ID: {inspectedLog.id} • Request: {inspectedLog.requestId}</p>
              </div>
              <button onClick={() => setInspectedLog(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Actor:</span>
                <span className="text-white font-medium">{inspectedLog.actorName} ({inspectedLog.actorEmail})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">IP Address:</span>
                <span className="font-mono text-cyan-300">{inspectedLog.ipAddress}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Target:</span>
                <span className="text-slate-200">{inspectedLog.target}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Source:</span>
                <span className="font-mono text-blue-300">{inspectedLog.source}</span>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Metadata Payload</label>
              <pre className="rounded-xl border border-white/10 bg-black/70 p-3 font-mono text-[11px] text-emerald-300/90 overflow-auto max-h-48">
                <code>{JSON.stringify(inspectedLog.metadata || {}, null, 2)}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
