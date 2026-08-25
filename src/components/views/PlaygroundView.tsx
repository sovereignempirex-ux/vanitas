import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Terminal,
  Play,
  Copy,
  Check,
  Code2,
  Layers,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Zap,
} from 'lucide-react';

interface PresetEndpoint {
  name: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  category: string;
  defaultPayload?: string;
}

export const PlaygroundView: React.FC = () => {
  const { role, clientSource } = useAuth();

  const presets: PresetEndpoint[] = [
    {
      name: 'System Health Check',
      method: 'GET',
      path: '/api/v1/health',
      description: 'Check uptime and core gateway operational health',
      category: 'System',
    },
    {
      name: 'Get Current Authenticated User',
      method: 'GET',
      path: '/api/v1/auth/me',
      description: 'Fetch identity and granted permission scopes',
      category: 'Auth',
    },
    {
      name: 'List Active API Keys',
      method: 'GET',
      path: '/api/v1/api-keys',
      description: 'Fetch all authorized tokens and their granted scopes',
      category: 'Keys',
    },
    {
      name: 'Execute Bot Command',
      method: 'POST',
      path: '/api/v1/bot/execute',
      description: 'Dispatch command to Discord or WhatsApp autonomous agent',
      category: 'Bot',
      defaultPayload: JSON.stringify(
        {
          platform: 'discord',
          command: 'system_status',
          channelId: 'ops-main',
          payload: { target: 'all' },
        },
        null,
        2
      ),
    },
    {
      name: 'Get Admin System Statistics',
      method: 'GET',
      path: '/api/v1/admin/statistics',
      description: 'Query p95 latencies, error distributions, and security threats (Admin Only)',
      category: 'Admin',
    },
    {
      name: 'Fetch Admin Audit Logs',
      method: 'GET',
      path: '/api/v1/admin/logs?limit=10&from=24h',
      description: 'Retrieve immutable server-side security audit logs',
      category: 'Admin',
    },
  ];

  const [selectedPreset, setSelectedPreset] = useState<PresetEndpoint>(presets[0]);
  const [method, setMethod] = useState<'GET' | 'POST' | 'PATCH' | 'DELETE'>('GET');
  const [endpoint, setEndpoint] = useState('/api/v1/health');
  const [payload, setPayload] = useState('{\n  \n}');
  const [customHeaderToken, setCustomHeaderToken] = useState('vnt_live_sk_••••••••••••');
  const [loading, setLoading] = useState(false);

  // Response state
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseLatency, setResponseLatency] = useState<number | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseBody, setResponseBody] = useState<string | null>(null);

  // Code tab state
  const [codeTab, setCodeTab] = useState<'curl' | 'typescript' | 'python'>('curl');
  const [copied, setCopied] = useState(false);

  const handleSelectPreset = (p: PresetEndpoint) => {
    setSelectedPreset(p);
    setMethod(p.method);
    setEndpoint(p.path);
    setPayload(p.defaultPayload || '{\n  \n}');
  };

  const handleExecute = async () => {
    setLoading(true);
    const start = performance.now();

    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
          'x-client-source': clientSource,
        },
      };

      if (['POST', 'PATCH', 'PUT'].includes(method) && payload.trim()) {
        try {
          JSON.parse(payload);
          options.body = payload;
        } catch {
          // If not valid JSON, send as string
          options.body = payload;
        }
      }

      const res = await fetch(endpoint, options);
      const latency = Math.round(performance.now() - start);

      setResponseStatus(res.status);
      setResponseLatency(latency);

      const hdrs: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        hdrs[key] = val;
      });
      setResponseHeaders(hdrs);

      const text = await res.text();
      try {
        const json = JSON.parse(text);
        setResponseBody(JSON.stringify(json, null, 2));
      } catch {
        setResponseBody(text);
      }
    } catch (err: any) {
      setResponseStatus(500);
      setResponseLatency(Math.round(performance.now() - start));
      setResponseBody(JSON.stringify({ error: err.message || 'Request dispatch failed' }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const copyCode = (snippet: string) => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateSnippet = () => {
    const fullUrl = `https://vanitas-bot.vercel.app${endpoint}`;
    if (codeTab === 'curl') {
      let cmd = `curl -X ${method} "${fullUrl}" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "x-client-source: ${clientSource}" \\\n  -H "Content-Type: application/json"`;
      if (['POST', 'PATCH'].includes(method)) {
        cmd += ` \\\n  -d '${payload.replace(/\n\s*/g, '')}'`;
      }
      return cmd;
    }

    if (codeTab === 'typescript') {
      return `import { VanitasClient } from '@vanitas/sdk';

const vanitas = new VanitasClient({
  apiKey: process.env.VANITAS_API_KEY,
  source: '${clientSource}'
});

async function main() {
  const response = await fetch('${fullUrl}', {
    method: '${method}',
    headers: {
      'Authorization': \`Bearer \${process.env.VANITAS_API_KEY}\`,
      'Content-Type': 'application/json',
      'x-client-source': '${clientSource}'
    },${['POST', 'PATCH'].includes(method) ? `\n    body: JSON.stringify(${payload}),` : ''}
  });

  const data = await response.json();
  console.log(data);
}

main();`;
    }

    if (codeTab === 'python') {
      return `import requests
import json

url = "${fullUrl}"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "x-client-source": "${clientSource}",
    "Content-Type": "application/json"
}
${['POST', 'PATCH'].includes(method) ? `payload = ${payload}\nresponse = requests.${method.toLowerCase()}(url, headers=headers, json=payload)` : `response = requests.${method.toLowerCase()}(url, headers=headers)`}

print(response.status_code)
print(response.json())`;
    }

    return '';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="h-6 w-6 text-blue-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-white">Interactive API Playground</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Test live Central API endpoints with real headers, dynamic source detection, and payload inspection.
          </p>
        </div>

        <button
          onClick={handleExecute}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all cursor-pointer"
        >
          <Play className="h-4 w-4 fill-white" />
          <span>{loading ? 'Executing...' : 'Send Request'}</span>
        </button>
      </div>

      {/* Preset Quick Badges */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <span className="text-[11px] font-mono uppercase text-slate-500 flex-shrink-0">Quick Presets:</span>
        {presets.map((p) => (
          <button
            key={p.name}
            onClick={() => handleSelectPreset(p)}
            className={`flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium border transition-all ${
              selectedPreset.name === p.name
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 shadow-sm'
                : 'bg-slate-900/60 text-slate-400 border-white/5 hover:bg-white/[0.04] hover:text-white'
            }`}
          >
            <span className="font-mono text-[10px] uppercase font-bold text-blue-400 mr-1.5">{p.method}</span>
            <span>{p.name}</span>
          </button>
        ))}
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Request Builder (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl shadow-2xl space-y-4">
            {/* Method & URL Input */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Request Endpoint</label>
              <div className="flex rounded-xl border border-white/10 bg-slate-900/80 overflow-hidden focus-within:border-blue-500 transition-colors">
                <select
                  value={method}
                  onChange={(e: any) => setMethod(e.target.value)}
                  className="bg-slate-900 px-3 py-2.5 font-mono text-xs font-bold text-blue-400 border-r border-white/10 focus:outline-none"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="flex-1 bg-transparent px-3 py-2.5 font-mono text-xs text-white placeholder:text-slate-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Request Headers */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Active Client Headers</label>
              <div className="rounded-2xl border border-white/5 bg-black/30 p-3 space-y-2 font-mono text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>x-client-source</span>
                  <span className="text-cyan-300">{clientSource}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>x-user-role (RBAC)</span>
                  <span className={role === 'ADMIN' ? 'text-amber-400' : 'text-blue-400'}>{role}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Content-Type</span>
                  <span className="text-slate-300">application/json</span>
                </div>
              </div>
            </div>

            {/* Request JSON Body (if applicable) */}
            {['POST', 'PATCH', 'PUT'].includes(method) && (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-medium text-slate-300">JSON Request Body</label>
                  <button
                    onClick={() => {
                      try {
                        setPayload(JSON.stringify(JSON.parse(payload), null, 2));
                      } catch {
                        // ignore
                      }
                    }}
                    className="text-[10px] font-mono text-blue-400 hover:underline"
                  >
                    Beautify JSON
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/90 p-3 font-mono text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Generated Client SDK Snippets */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-semibold text-white">SDK Implementation Snippet</span>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 border border-white/10">
                {(['curl', 'typescript', 'python'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setCodeTab(tab)}
                    className={`rounded px-2.5 py-1 text-[10px] font-mono uppercase font-semibold transition-all ${
                      codeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mt-3">
              <pre className="rounded-2xl border border-white/5 bg-black/60 p-4 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-56">
                <code>{generateSnippet()}</code>
              </pre>
              <button
                onClick={() => copyCode(generateSnippet())}
                className="absolute top-3 right-3 rounded-lg bg-slate-800/80 p-2 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title="Copy code snippet"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Response Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl shadow-2xl min-h-[460px] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">Response Inspector</span>
              </div>

              {responseStatus !== null && (
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-lg px-2.5 py-0.5 font-mono text-xs font-bold ${
                      responseStatus >= 200 && responseStatus < 300
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : responseStatus === 403
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {responseStatus} {responseStatus === 200 ? 'OK' : responseStatus === 201 ? 'CREATED' : responseStatus === 403 ? 'FORBIDDEN' : 'ERROR'}
                  </span>
                  {responseLatency !== null && (
                    <span className="font-mono text-xs text-slate-400">{responseLatency}ms</span>
                  )}
                </div>
              )}
            </div>

            {/* Body or Placeholder */}
            <div className="mt-4 flex-1 flex flex-col">
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                  <Zap className="h-8 w-8 text-blue-400 animate-bounce" />
                  <p className="mt-3 text-xs text-slate-400">Dispatching request to Central Gateway...</p>
                </div>
              ) : responseBody ? (
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-center pb-2 text-[10px] font-mono text-slate-500 uppercase">
                    <span>JSON Payload</span>
                    <span>{responseBody.length} bytes</span>
                  </div>
                  <pre className="flex-1 rounded-2xl border border-white/5 bg-black/60 p-4 font-mono text-xs text-emerald-300/90 overflow-auto max-h-[380px] leading-relaxed">
                    <code>{responseBody}</code>
                  </pre>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-16 text-slate-500">
                  <Terminal className="h-10 w-10 text-slate-700 mb-3" />
                  <p className="text-xs">No active response yet.</p>
                  <p className="text-[11px] text-slate-600 mt-1">Select an endpoint and click "Send Request".</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
