import React, { useState, useEffect } from 'react';
import { api } from '../../lib/apiClient.ts';
import { BotIntegration } from '../../types.ts';
import {
  Bot,
  Play,
  Terminal,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Radio,
  Copy,
  Check,
  Send,
} from 'lucide-react';

export const BotGatewayView: React.FC = () => {
  const [bots, setBots] = useState<BotIntegration[]>([]);
  const [loading, setLoading] = useState(true);

  // Command Runner State
  const [selectedPlatform, setSelectedPlatform] = useState('discord');
  const [command, setCommand] = useState('system_status');
  const [channelId, setChannelId] = useState('general-ops');
  const [customPayload, setCustomPayload] = useState('{\n  "target": "all"\n}');
  const [executing, setExecuting] = useState(false);
  const [executionOutput, setExecutionOutput] = useState<string | null>(null);

  const loadBots = async () => {
    try {
      setLoading(true);
      const res = await api.getBots();
      setBots(res.bots);
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBots();
  }, []);

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    setExecuting(true);
    setExecutionOutput(null);

    try {
      let parsed = {};
      try {
        parsed = JSON.parse(customPayload);
      } catch {
        // ignore
      }

      const res = await api.executeBotCommand(selectedPlatform, command, {
        channelId,
        ...parsed,
      });

      setExecutionOutput(
        JSON.stringify(
          {
            status: '200 OK',
            executionId: res.executionId,
            platform: res.platform,
            command: res.command,
            output: res.output,
            timestamp: res.timestamp,
          },
          null,
          2
        )
      );
      loadBots();
    } catch (err: any) {
      setExecutionOutput(
        JSON.stringify({ error: err.message || 'Execution dispatch failed' }, null, 2)
      );
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-emerald-400" />
          <h1 className="text-xl sm:text-2xl font-bold text-white">Bot Gateway & Multi-Client Ingress</h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Unified command broker connecting WhatsApp agents, Discord sentinels, and Telegram bots directly to Vanitas Central API.
        </p>
      </div>

      {/* Bots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {bots.map((b) => (
          <div
            key={b.id}
            className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl hover:border-emerald-500/30 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{b.name}</h3>
                    <p className="text-[11px] font-mono text-slate-400 uppercase">{b.platform}</p>
                  </div>
                </div>

                <span
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                    b.status === 'online'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {b.status.toUpperCase()}
                </span>
              </div>

              <div className="mt-5 space-y-2 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Commands Executed:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{b.commandsExecuted.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Avg Latency:</span>
                  <span className="font-mono text-slate-200">{b.latencyMs}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Last Ping:</span>
                  <span className="text-slate-200">{new Date(b.lastPingAt).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
              <span className="font-mono text-[10px] text-slate-500">{b.id}</span>
              <button
                onClick={() => {
                  setSelectedPlatform(b.platform);
                  setCommand('ping');
                }}
                className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                Test Ingress
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Interactive Command Runner */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Interactive Bot Ingress Dispatcher</h2>
          </div>
          <span className="font-mono text-xs text-emerald-400">POST /api/v1/bot/execute</span>
        </div>

        <form onSubmit={handleExecute} className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300">Target Bot Platform</label>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="discord">Discord Sentinel (bot.discord.vanitas)</option>
                <option value="whatsapp">WhatsApp Agent Ingress (bot.whatsapp.vanitas)</option>
                <option value="telegram">Telegram Relay (bot.tg.vanitas)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Bot Command</label>
              <input
                type="text"
                required
                placeholder="e.g. system_status, rotate_key, purge_cache"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-mono text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Payload Parameters (JSON)</label>
              <textarea
                rows={4}
                value={customPayload}
                onChange={(e) => setCustomPayload(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 p-3 font-mono text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={executing}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 transition-all cursor-pointer"
            >
              <Send className="h-4 w-4" />
              <span>{executing ? 'Dispatching...' : 'Dispatch Bot Command'}</span>
            </button>
          </div>

          {/* Right: Output Console */}
          <div className="lg:col-span-6 flex flex-col">
            <label className="block text-xs font-medium text-slate-300 mb-1">Execution Response Stream</label>
            <div className="flex-1 rounded-2xl border border-white/10 bg-black/60 p-4 font-mono text-xs text-emerald-300 overflow-auto min-h-[220px]">
              {executing ? (
                <div className="flex items-center gap-2 text-emerald-400 animate-pulse">
                  <Zap className="h-4 w-4" />
                  <span>Transmitting command across secure bot socket...</span>
                </div>
              ) : executionOutput ? (
                <pre><code>{executionOutput}</code></pre>
              ) : (
                <p className="text-slate-600">Awaiting bot execution dispatch...</p>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
