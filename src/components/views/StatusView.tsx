import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/apiClient.ts';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  Database,
  Key,
  RefreshCw,
  Server,
  Webhook,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Live status view — consumes GET /api/v1/status. Every number on this screen
// is counted by the gateway itself: request totals, the 24-hour traffic
// series, p95, error rate, sign-in counts and the per-component evidence
// strings. There are no hand-painted uptime percentages and no decorative
// bars — an hour with no traffic renders as a real zero, and the banner
// verdict is derived from the live signals rather than assumed green.
// ---------------------------------------------------------------------------

type ComponentStatus = 'operational' | 'degraded' | 'outage';
type Verdict = ComponentStatus | 'loading' | 'error';

interface StatusPayload {
  database: 'connected' | 'unreachable' | 'in-memory-fallback';
  stats: {
    totalRequestsToday: number;
    requests24h: number;
    errors24h: number;
    p95LatencyMs: number;
    errorRate: number;
    activeApiKeys: number;
    logins24h: number;
    failedLogins24h: number;
  };
  hourlyTraffic: { hour: string; requests: number; errors: number }[];
  components: { id: string; status: ComponentStatus; detail: string }[];
  uptimeSeconds: number;
  serverTime: string;
}

const COMPONENT_META: Record<string, { label: string; icon: typeof Server; blurb: string }> = {
  api: { label: 'Central API Gateway', icon: Server, blurb: 'Traffic ingress for web, bots, mobile & desktop' },
  database: { label: 'Data Store', icon: Database, blurb: 'PostgreSQL in production · in-process store in dev' },
  auth: { label: 'Authentication & Sessions', icon: Key, blurb: 'scrypt hashing · TOTP 2FA · session control' },
  ai: { label: 'AI Copilot', icon: Cpu, blurb: 'Streaming answers with site-aware context' },
  bot: { label: 'Bot Gateway', icon: Bot, blurb: 'WhatsApp · Discord · Telegram command dispatch' },
  webhooks: { label: 'Webhook Dispatcher', icon: Webhook, blurb: 'HMAC-signed, owner-scoped event delivery' },
};

const STATUS_STYLE: Record<ComponentStatus, { dot: string; text: string; animate: string }> = {
  operational: { dot: 'bg-emerald-400', text: 'text-emerald-400', animate: 'animate-pulse' },
  degraded: { dot: 'bg-amber-400', text: 'text-amber-400', animate: '' },
  outage: { dot: 'bg-rose-500', text: 'text-rose-400', animate: '' },
};

const TONE_STYLE: Record<string, { box: string; icon: string; chip: string }> = {
  emerald: { box: 'border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 to-slate-950/80', icon: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', chip: 'text-emerald-400' },
  amber: { box: 'border-amber-500/30 bg-gradient-to-r from-amber-950/40 to-slate-950/80', icon: 'bg-amber-500/20 text-amber-400 border-amber-500/30', chip: 'text-amber-400' },
  rose: { box: 'border-rose-500/30 bg-gradient-to-r from-rose-950/40 to-slate-950/80', icon: 'bg-rose-500/20 text-rose-400 border-rose-500/30', chip: 'text-rose-400' },
  slate: { box: 'border-white/10 bg-slate-950/70', icon: 'bg-white/5 text-slate-400 border-white/10', chip: 'text-slate-400' },
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

const VERDICTS: Record<Verdict, { title: string; sub: (s: StatusPayload | null) => string; icon: typeof CheckCircle2; tone: keyof typeof TONE_STYLE }> = {
  loading: { title: 'Loading live status…', sub: () => 'Querying gateway telemetry', icon: RefreshCw, tone: 'slate' },
  error: {
    title: 'Status endpoint unreachable',
    sub: () => 'Could not load /api/v1/status — use retry below',
    icon: AlertTriangle,
    tone: 'rose',
  },
  operational: {
    title: 'Gateway operational',
    sub: (s) =>
      `${(s?.stats.requests24h ?? 0).toLocaleString('en-US')} requests · 24h — ${s?.stats.errors24h ?? 0} errors (${((s?.stats.errorRate ?? 0) * 100).toFixed(2)}%)`,
    icon: CheckCircle2,
    tone: 'emerald',
  },
  degraded: {
    title: 'Elevated error rate',
    sub: (s) =>
      `${s?.stats.errors24h ?? 0} errors of ${(s?.stats.requests24h ?? 0).toLocaleString('en-US')} requests · 24h (${((s?.stats.errorRate ?? 0) * 100).toFixed(2)}%)`,
    icon: AlertTriangle,
    tone: 'amber',
  },
  outage: {
    title: 'Data store unreachable',
    sub: () => 'PostgreSQL probe failed — API ingress is still answering',
    icon: AlertTriangle,
    tone: 'rose',
  },
};

export const StatusView: React.FC = () => {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      setStatus(await api.getStatus());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Verdict derived from real signals — never a blanket green claim.
  const stats = status?.stats;
  const dbDown = status?.database === 'unreachable';
  const requests24h = stats?.requests24h ?? 0;
  const errors24h = stats?.errors24h ?? 0;
  const errorRate = stats?.errorRate ?? 0;
  const elevated = !dbDown && requests24h >= 20 && errorRate >= 0.05;
  const verdict: Verdict = !status
    ? loadError
      ? 'error'
      : 'loading'
    : dbDown
      ? 'outage'
      : elevated
        ? 'degraded'
        : 'operational';
  const view = VERDICTS[verdict];
  const tone = TONE_STYLE[view.tone];
  const VerdictIcon = view.icon;

  const traffic = status?.hourlyTraffic || [];
  const maxBucket = Math.max(1, ...traffic.map((b) => b.requests));
  const firstHour = traffic[0]?.hour.slice(11) || '--';
  const lastHour = traffic[traffic.length - 1]?.hour.slice(11) || '--';

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* ================= Verdict banner — derived from live signals ================= */}
      <div className={`rounded-3xl border p-6 sm:p-8 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.35)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${tone.box}`}>
        <div className="flex items-center gap-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${tone.icon}`}>
            <VerdictIcon className={`h-8 w-8 ${verdict === 'loading' && refreshing ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{view.title}</h1>
            <p className="text-xs text-slate-300 mt-0.5">{view.sub(status)}</p>
            {verdict === 'error' && (
              <button
                onClick={load}
                className="mt-2 rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-cyan-400/40 transition-all"
              >
                Retry
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-center">
            <p className="text-[10px] font-mono uppercase text-slate-400">Instance Uptime</p>
            <p className="text-lg font-bold font-mono text-emerald-400">
              {status ? formatUptime(status.uptimeSeconds) : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-center">
            <p className="text-[10px] font-mono uppercase text-slate-400">Requests · 24h</p>
            <p className="text-lg font-bold font-mono text-white">{status ? requests24h.toLocaleString('en-US') : '—'}</p>
          </div>
        </div>
      </div>

      {/* ================= Real KPI row ================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {[
          { label: 'Requests Today', value: status ? stats!.totalRequestsToday.toLocaleString('en-US') : '—', tone: 'text-blue-300' },
          { label: 'Error Rate · 24h', value: status ? `${(errorRate * 100).toFixed(2)}%` : '—', tone: errorRate >= 0.05 ? 'text-amber-300' : 'text-emerald-400' },
          { label: 'P95 Latency', value: status ? (stats!.p95LatencyMs > 0 ? `${stats!.p95LatencyMs} ms` : '—') : '—', tone: 'text-cyan-300' },
          { label: 'Active API Keys', value: status ? stats!.activeApiKeys.toLocaleString('en-US') : '—', tone: 'text-indigo-300' },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-white/5 bg-slate-900/50 p-4 space-y-1">
            <span className="text-[11px] text-slate-400">{kpi.label}</span>
            <div className={`text-lg sm:text-xl font-bold font-mono ${kpi.tone}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* ================= Components — real evidence per row ================= */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-between pb-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">Core Component Status</h2>
          </div>
          <div className="flex items-center gap-3">
            {status && (
              <span className="text-xs font-mono text-slate-500">
                As of {new Date(status.serverTime).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={load}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:text-white transition-all"
              title="Refresh status"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {!status && !loadError && (
          <div className="divide-y divide-white/5 mt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 vnt-skeleton rounded-xl mt-2" />
            ))}
          </div>
        )}

        {status && (
          <div className="divide-y divide-white/5 mt-2">
            {status.components.map((c) => {
              const meta = COMPONENT_META[c.id] || { label: c.id, icon: Server, blurb: '' };
              const style = STATUS_STYLE[c.status] || STATUS_STYLE.operational;
              const Icon = meta.icon;
              return (
                <div key={c.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] border border-white/10 text-blue-400">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white">{meta.label}</h3>
                      <p className="text-[11px] text-slate-400">{meta.blurb}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4">
                    <span className="font-mono text-[11px] text-slate-400">{c.detail}</span>
                    <span className={`h-2 w-2 rounded-full ${style.dot} ${style.animate}`} />
                    <span className={`font-mono text-xs font-bold uppercase w-24 text-right ${style.text}`}>
                      {c.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= Real 24-hour traffic ================= */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
        <div className="flex justify-between items-center text-xs font-semibold text-white mb-1">
          <span>API Traffic — Last 24 Hours (counted live)</span>
          <span className="font-mono text-emerald-400">
            {status ? `${requests24h.toLocaleString('en-US')} req · ${errors24h} err` : '—'}
          </span>
        </div>
        <p className="text-[10px] text-slate-500 mb-3">
          One bar per clock hour; amber bars contained at least one ≥400 response. Empty hours are real zeros.
        </p>
        <div className="flex gap-1 h-8 items-end">
          {traffic.length === 0 ? (
            <div className="flex-1 vnt-skeleton rounded-sm h-full" />
          ) : (
            traffic.map((b) => (
              <div
                key={b.hour}
                className={`flex-1 rounded-sm transition-all ${
                  b.errors > 0 ? 'bg-amber-400 hover:bg-amber-300' : 'bg-emerald-500/80 hover:bg-emerald-400'
                }`}
                style={{ height: `${b.requests === 0 ? 3 : Math.max(8, Math.round((b.requests / maxBucket) * 100))}%` }}
                title={`${b.hour}:00 — ${b.requests} requests, ${b.errors} errors`}
              />
            ))
          )}
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-2">
          <span>{firstHour}:00</span>
          <span>{requests24h === 0 && status ? 'No requests recorded in this window' : 'now'}</span>
          <span>{lastHour}:00</span>
        </div>
      </div>
    </div>
  );
};
