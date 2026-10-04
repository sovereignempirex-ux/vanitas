import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../lib/apiClient.ts';
import { getPortalUrl } from '../../lib/runtime.ts';
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

// Real HTTP reason phrases — the badge never falls back to a blanket
// "ERROR" for perfectly meaningful codes like 429 or 404.
const HTTP_REASONS: Record<number, string> = {
  200: 'OK',
  201: 'CREATED',
  202: 'ACCEPTED',
  204: 'NO CONTENT',
  301: 'MOVED',
  302: 'FOUND',
  304: 'NOT MODIFIED',
  400: 'BAD REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT FOUND',
  405: 'METHOD NOT ALLOWED',
  408: 'REQUEST TIMEOUT',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'PAYLOAD TOO LARGE',
  415: 'UNSUPPORTED MEDIA TYPE',
  422: 'UNPROCESSABLE',
  429: 'TOO MANY REQUESTS',
  500: 'SERVER ERROR',
  502: 'BAD GATEWAY',
  503: 'UNAVAILABLE',
  504: 'GATEWAY TIMEOUT',
};

export const PlaygroundView: React.FC = () => {
  const { role, clientSource } = useAuth();
  // Whether requests will actually carry a session Bearer token.
  const sessionActive = !!api.getSessionToken();

  const presets: PresetEndpoint[] = [
    {
      name: 'System Health Check',
      method: 'GET',
      path: '/api/v1/health',
      description: 'Check uptime and core gateway operational health',
      category: 'System',
    },
    {
      name: 'Platform Status (Public)',
      method: 'GET',
      path: '/api/v1/status',
      description: 'Public live telemetry: uptime, p95 latency, 24h traffic and component evidence',
      category: 'System',
    },
    {
      name: 'Public Ping (API-Key)',
      method: 'GET',
      path: '/api/v1/public/ping',
      description: 'Verify x-api-key auth and read rate-limit headers (paste a key below)',
      category: 'Auth',
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
  // Optional API key sent as x-api-key (for key-auth endpoints like
  // /api/v1/public/ping). Empty by default — we never prefill a fake token.
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);

  // Response state
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseLatency, setResponseLatency] = useState<number | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseBody, setResponseBody] = useState<string | null>(null);
  // Set when NO HTTP response exists (network failure or playground-side
  // rejection). Never dressed up as a fabricated status code like 500.
  const [dispatchError, setDispatchError] = useState<string | null>(null);

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
    // Same-origin API only: a free-form URL would turn this console into a
    // request gadget pointed anywhere the browser can reach.
    if (!endpoint.startsWith('/api/v1/')) {
      const message = 'Endpoint must start with /api/v1/ — the playground only calls this API';
      setResponseStatus(null);
      setResponseLatency(0);
      setResponseHeaders({});
      setDispatchError(message);
      setResponseBody(JSON.stringify({ error: message }, null, 2));
      return;
    }
    setLoading(true);
    setDispatchError(null);
    const start = performance.now();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-client-source': clientSource,
      };
      // Real auth: the signed-in session's Bearer token. Role/permissions
      // are decided by the server from this session — never sent as a
      // spoofable header.
      const sessionToken = api.getSessionToken();
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
      // Optional key auth: only sent when the user pasted a real key.
      const key = apiKey.trim();
      if (key) headers['x-api-key'] = key;
      const options: RequestInit = { method, headers };

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
      // A thrown fetch is NOT an HTTP 500 — no server answered at all.
      // Report it as what it is instead of fabricating a status code.
      const message = err?.message || 'Request dispatch failed';
      setResponseStatus(null);
      setResponseLatency(Math.round(performance.now() - start));
      setResponseHeaders({});
      setDispatchError(message);
      setResponseBody(
        JSON.stringify(
          {
            error: message,
            note: 'No HTTP response was received (network failure, blocked request, or server unreachable).',
          },
          null,
          2
        ),
      );
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
    const fullUrl = `${getPortalUrl()}${endpoint}`;
    if (codeTab === 'curl') {
      let cmd = `curl -X ${method} "${fullUrl}" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "x-client-source: ${clientSource}" \\\n  -H "Content-Type: application/json"`;
      // Reflect the optional key header actually configured above — with a
      // placeholder, never the pasted secret itself.
      if (apiKey.trim()) {
        cmd += ` \\\n  -H "x-api-key: YOUR_API_KEY"`;
      }
      if (['POST', 'PATCH'].includes(method)) {
        cmd += ` \\\n  -d '${payload.replace(/\n\s*/g, '')}'`;
      }
      return cmd;
    }

    if (codeTab === 'typescript') {
      // Plain fetch only — there is no published @vanitas/sdk package, and
      // an example that imports a package that does not exist is useless.
      return `// Vanitas API over plain fetch — no SDK required.
async function main() {
  const response = await fetch('${fullUrl}', {
    method: '${method}',
    headers: {
      'Authorization': \`Bearer \${process.env.VANITAS_API_KEY}\`,
      'Content-Type': 'application/json',
      'x-client-source': '${clientSource}'
    },${['POST', 'PATCH'].includes(method) ? `\n    body: JSON.stringify(${payload.replace(/\n\s*/g, ' ') || '{}'}),` : ''}
  });

  if (!response.ok) {
    throw new Error(\`Vanitas API \${response.status}: \${await response.text()}\`);
  }

  const data = await response.json();
  console.log(data);
}

main().catch(console.error);`;
    }

    if (codeTab === 'python') {
      // The payload is embedded as a JSON string and parsed with json.loads
      // — inline JSON (true/false) is not valid Python on its own.
      return `import json
import requests

url = "${fullUrl}"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "x-client-source": "${clientSource}",
    "Content-Type": "application/json"
}
${['POST', 'PATCH'].includes(method) ? `payload = json.loads(${JSON.stringify(payload)})\nresponse = requests.${method.toLowerCase()}(url, headers=headers, json=payload)` : `response = requests.${method.toLowerCase()}(url, headers=headers)`}

response.raise_for_status()
print(response.status_code)
print(json.dumps(response.json(), indent=2))`;
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
                  <span>Authorization</span>
                  <span className={role === 'ADMIN' ? 'text-amber-400' : 'text-blue-400'}>{sessionActive ? `Bearer •••• (${role})` : 'not signed in'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>x-api-key</span>
                  <span className={apiKey.trim() ? 'text-emerald-300' : 'text-slate-500'}>
                    {apiKey.trim() ? 'set •••• (sent with request)' : 'not set — paste a key to test key auth'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Content-Type</span>
                  <span className="text-slate-300">application/json</span>
                </div>
              </div>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Optional API key (sent as x-api-key) — try /api/v1/public/ping"
                autoComplete="off"
                spellCheck={false}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
              />
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

              {responseStatus !== null ? (
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-lg px-2.5 py-0.5 font-mono text-xs font-bold ${
                      responseStatus >= 200 && responseStatus < 300
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : responseStatus >= 300 && responseStatus < 400
                        ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                        : responseStatus === 401 || responseStatus === 403 || responseStatus === 429
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {responseStatus} {HTTP_REASONS[responseStatus] || 'RESPONSE'}
                  </span>
                  {responseLatency !== null && (
                    <span className="font-mono text-xs text-slate-400">{responseLatency}ms</span>
                  )}
                </div>
              ) : dispatchError ? (
                <div className="flex items-center gap-2">
                  <span className="rounded-lg px-2.5 py-0.5 font-mono text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                    NO RESPONSE
                  </span>
                  {responseLatency !== null && (
                    <span className="font-mono text-xs text-slate-400">{responseLatency}ms</span>
                  )}
                </div>
              ) : null}
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
                    <span>Response Body</span>
                    <span>{new TextEncoder().encode(responseBody).length} bytes</span>
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
