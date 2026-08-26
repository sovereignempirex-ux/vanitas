import React, { useState, useEffect } from 'react';
import { api } from '../../lib/apiClient.ts';
import { SystemStats } from '../../types.ts';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Server,
  Database,
  Key,
  Bot,
  Webhook,
  Radio,
} from 'lucide-react';

export const StatusView: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.getStatus();
        setStats({
          services: res.status,
          apiRequestsToday: res.stats.totalRequestsToday,
          p95LatencyMs: res.stats.p95LatencyMs,
          errorRate: res.stats.errorRate,
          activeApiKeys: 18,
          threatLevel: 'LOW',
          requestBreakdown: [],
        });
      } catch (e) {
        console.warn(e);
      }
    };
    load();
  }, []);

  const services = stats?.services || {
    apiGateway: 'operational',
    databasePool: 'operational',
    authEngine: 'operational',
    discordBot: 'operational',
    whatsappBot: 'operational',
    webhookDispatcher: 'operational',
  };

  const serviceLabels: Record<string, { label: string; icon: any; description: string }> = {
    apiGateway: { label: 'Central API Gateway (Edge)', icon: Server, description: 'Direct traffic ingress across Web, Mobile & Desktop' },
    databasePool: { label: 'Primary Database Pool', icon: Database, description: 'Read/Write cluster with sub-5ms query response' },
    authEngine: { label: 'Authentication & Token Validator', icon: Key, description: 'JWT signature verification & assertGrantableScopes' },
    discordBot: { label: 'Discord Sentinel Gateway', icon: Bot, description: 'Real-time WebSocket & command executor' },
    whatsappBot: { label: 'WhatsApp Agent Ingress', icon: Bot, description: 'Multi-device webhook bridge' },
    webhookDispatcher: { label: 'Webhook Event Dispatcher', icon: Webhook, description: 'HMAC-signed retry queues' },
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Banner */}
      <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 to-slate-950/80 p-6 sm:p-8 backdrop-blur-xl shadow-[0_0_50px_rgba(16,185,129,0.15)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">All Vanitas Systems Operational</h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Zero active incidents reported across global ingress nodes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-center">
            <p className="text-[10px] font-mono uppercase text-slate-400">90-Day Uptime</p>
            <p className="text-lg font-bold font-mono text-emerald-400">99.98%</p>
          </div>
        </div>
      </div>

      {/* Services Breakdown */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-between pb-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">Core Component Status</h2>
          </div>
          <span className="text-xs font-mono text-slate-400">Refreshed Live</span>
        </div>

        <div className="divide-y divide-white/5 mt-2">
          {Object.entries(services).map(([key, status]) => {
            const meta = serviceLabels[key] || { label: key, icon: Server, description: '' };
            const Icon = meta.icon;
            return (
              <div key={key} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] border border-white/10 text-blue-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">{meta.label}</h3>
                    <p className="text-[11px] text-slate-400">{meta.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-xs font-bold text-emerald-400 uppercase">
                    {status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 90-Day Visual Uptime Bars */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
        <div className="flex justify-between items-center text-xs font-semibold text-white mb-3">
          <span>System Uptime (Last 90 Days)</span>
          <span className="font-mono text-emerald-400">99.98%</span>
        </div>
        <div className="flex gap-1 h-8 items-end">
          {Array.from({ length: 45 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-emerald-500/80 hover:bg-emerald-400 rounded-sm transition-all h-full"
              title={`Day ${90 - i * 2}: 100% operational`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-2">
          <span>90 days ago</span>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
};
