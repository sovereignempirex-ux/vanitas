import React, { useState, useEffect } from 'react';
import { api } from '../../lib/apiClient.ts';
import { WebhookEndpoint, WebhookDeliveryLog } from '../../types.ts';
import {
  Webhook,
  Plus,
  Play,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Send,
  Radio,
} from 'lucide-react';

export const WebhooksView: React.FC = () => {
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [logs, setLogs] = useState<WebhookDeliveryLog[]>([]);
  const [loading, setLoading] = useState(true);

  // New webhook modal
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['key.rotated', 'user.login']);
  const [testingId, setTestingId] = useState<string | null>(null);

  const loadWebhooks = async () => {
    try {
      setLoading(true);
      const res = await api.getWebhooks();
      setWebhooks(res.webhooks);
      setLogs(res.logs);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWebhooks();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createWebhook(name, url, events);
      setIsOpen(false);
      setName('');
      setUrl('');
      loadWebhooks();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleTestPing = async (id: string) => {
    try {
      setTestingId(id);
      await api.testWebhook(id);
      loadWebhooks();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Webhook className="h-6 w-6 text-blue-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-white">Webhooks Ingress & Event Dispatcher</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Stream real-time security events, auth logs, and key rotations to external endpoints with HMAC-SHA256 signatures.
          </p>
        </div>

        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>Add Webhook Endpoint</span>
        </button>
      </div>

      {/* Webhooks List */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl overflow-hidden shadow-2xl">
        <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between">
          <span className="text-sm font-bold text-white">Registered Endpoints</span>
          <span className="text-xs font-mono text-slate-400">{webhooks.length} Active</span>
        </div>

        <div className="divide-y divide-white/5">
          {webhooks.map((wh) => (
            <div key={wh.id} className="p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-sm font-bold text-white">{wh.name}</h3>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400 font-bold uppercase">
                    {wh.status}
                  </span>
                </div>
                <code className="block mt-1 font-mono text-xs text-blue-300">{wh.url}</code>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {wh.events.map((ev) => (
                    <span key={ev} className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-slate-400 border border-white/5">
                      {ev}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleTestPing(wh.id)}
                  disabled={testingId === wh.id}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-400/40 hover:bg-white/[0.08] transition-all"
                >
                  <Send className="h-3.5 w-3.5 text-blue-400" />
                  <span>{testingId === wh.id ? 'Sending Ping...' : 'Test Ping'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Delivery Logs */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl overflow-hidden shadow-2xl">
        <div className="p-4 sm:p-6 border-b border-white/10">
          <h2 className="text-sm font-bold text-white">Recent Webhook Deliveries</h2>
        </div>

        <div className="divide-y divide-white/5 font-mono text-xs">
          {logs.map((l) => (
            <div key={l.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  {l.statusCode} OK
                </span>
                <span className="font-bold text-white">{l.event}</span>
                <span className="text-slate-500 text-[11px]">Latency: {l.latencyMs}ms</span>
              </div>
              <span className="text-slate-400 text-[11px]">{new Date(l.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
