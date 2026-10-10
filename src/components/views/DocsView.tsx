import React, { useState } from 'react';
import { getApiBaseUrl } from '../../lib/runtime.ts';
import { CommentsSection } from './CommentsSection.tsx';
import {
  FileCode2,
  Shield,
  Key,
  Bot,
  Zap,
  Lock,
  Layers,
  Code,
  Copy,
  Check,
  Search,
  BookOpen,
} from 'lucide-react';

export const DocsView: React.FC = () => {
  const apiBaseUrl = getApiBaseUrl();
  const [activeSection, setActiveSection] = useState('getting-started');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copySnippet = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const sections = [
    { id: 'getting-started', label: '1. Getting Started' },
    { id: 'authentication', label: '2. Authentication & Headers' },
    { id: 'scopes', label: '3. Scopes & RBAC Permissions' },
    { id: 'endpoints', label: '4. Central Endpoints' },
    { id: 'bots', label: '5. Bot Gateway Integration' },
    { id: 'errors', label: '6. Error Codes & Limits' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-blue-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-white">Vanitas Developer Documentation</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Complete technical specification for integrating with the Vanitas Centralized API Gateway.
          </p>
        </div>
      </div>

      {/* Abstract brand banner (bundled in /public/images) */}
      <div className="relative h-32 sm:h-40 overflow-hidden rounded-3xl border border-white/10">
        <img
          src="/images/docs-banner.jpg"
          alt="Faceted Vanitas crystal rendered as a wireframe"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/70 to-transparent" />
        <div className="relative z-10 flex h-full items-center gap-3 px-6">
          <BookOpen className="h-7 w-7 text-blue-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-white">Vanitas API Handbook</p>
            <p className="text-xs text-slate-300">6 sections · real endpoints · every page accepts comments from registered users</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Navigation Index (3 cols) */}
        <div className="lg:col-span-3 space-y-1">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3 backdrop-blur-xl sticky top-24">
            <p className="px-3 py-1.5 text-[10px] font-mono uppercase font-bold text-slate-400">Documentation Index</p>
            <div className="space-y-0.5 mt-1">
              {sections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => {
                    setActiveSection(sec.id);
                    document.getElementById(sec.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-left transition-colors ${
                    activeSection === sec.id
                      ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30'
                      : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                  }`}
                >
                  <span>{sec.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content Body (9 cols) */}
        <div className="lg:col-span-9 space-y-8">
          {/* Section 1: Getting Started */}
          <div id="getting-started" className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
              <Layers className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-bold text-white">1. Getting Started with Vanitas</h2>
            </div>

            <p className="mt-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
              Vanitas serves as the single source of truth for the entire ecosystem. Regardless of whether your client is a Web frontend, Discord bot, WhatsApp agent, iOS application, or Desktop CLI, all actions pass through the Central Gateway at:
            </p>

            <div className="mt-3 rounded-2xl border border-blue-500/30 bg-black/50 p-3.5 font-mono text-xs text-blue-300 flex justify-between items-center">
              <span>{apiBaseUrl}</span>
              <button
                onClick={() => copySnippet('base-url', apiBaseUrl)}
                className="text-slate-400 hover:text-white"
              >
                {copiedSection === 'base-url' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <CommentsSection docId="getting-started" />
          </div>

          {/* Section 2: Authentication & Headers */}
          <div id="authentication" className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
              <Key className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-bold text-white">2. Authentication & Header Standards</h2>
            </div>

            <p className="mt-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
              Every request to protected endpoints requires a Bearer token or API key in the <code className="font-mono text-blue-300">Authorization</code> header:
            </p>

            <div className="mt-3 rounded-2xl border border-white/10 bg-black/60 p-4 font-mono text-xs text-slate-300">
              <code>Authorization: Bearer sk_live_vanitas_••••••••••••••••</code><br />
              <code>x-client-source: BOT | WEB | MOBILE | DESKTOP</code><br />
              <code>Content-Type: application/json</code>
            </div>

            <CommentsSection docId="authentication" />
          </div>

          {/* Section 3: Scopes & Permissions */}
          <div id="scopes" className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
              <Shield className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-bold text-white">3. Scopes & RBAC Permissions Matrix</h2>
            </div>

            <p className="mt-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
              Permissions are governed by <code className="font-mono text-emerald-400">assertGrantableScopes</code>. Non-admin users cannot grant scopes beyond their role authority:
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 font-mono text-[11px]">
                    <th className="py-2.5 px-3">Scope ID</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Minimum Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px] text-slate-300">
                  <tr>
                    <td className="py-2.5 px-3 text-blue-300 font-bold">api.read</td>
                    <td className="py-2.5 px-3 font-sans text-xs">Read general platform metrics and status</td>
                    <td className="py-2.5 px-3 text-slate-400">USER</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-blue-300 font-bold">keys.create</td>
                    <td className="py-2.5 px-3 font-sans text-xs">Generate new scoped API keys</td>
                    <td className="py-2.5 px-3 text-slate-400">USER</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-emerald-300 font-bold">bot.execute</td>
                    <td className="py-2.5 px-3 font-sans text-xs">Dispatch commands to Discord/WhatsApp bots</td>
                    <td className="py-2.5 px-3 text-slate-400">USER</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-amber-300 font-bold">admin.users</td>
                    <td className="py-2.5 px-3 font-sans text-xs">Modify user roles & permission assignments</td>
                    <td className="py-2.5 px-3 text-amber-400 font-bold">ADMIN</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-amber-300 font-bold">admin.emergency</td>
                    <td className="py-2.5 px-3 font-sans text-xs">Trigger platform maintenance mode & key purges</td>
                    <td className="py-2.5 px-3 text-amber-400 font-bold">ADMIN</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <CommentsSection docId="scopes" />
          </div>

          {/* Section 4: Bot Gateway */}
          <div id="bots" className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
              <Bot className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white">5. Bot Gateway Integration</h2>
            </div>

            <p className="mt-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
              Bot agents authenticate via <code className="font-mono text-emerald-300">POST /api/v1/bot/execute</code>:
            </p>

            <pre className="mt-3 rounded-2xl border border-white/10 bg-black/60 p-4 font-mono text-xs text-slate-300 overflow-x-auto">
              <code>{`curl -X POST ${apiBaseUrl}/bot/execute \\
  -H "Authorization: Bearer sk_live_discord_••••••••" \\
  -H "x-client-source: BOT" \\
  -H "Content-Type: application/json" \\
  -d '{
    "platform": "discord",
    "command": "system_status",
    "payload": { "target": "all" }
  }'`}</code>
            </pre>

            <CommentsSection docId="bots" />
          </div>

          {/* Section 4 (sidebar): Central Endpoints */}
          <div id="endpoints" className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
              <Zap className="h-5 w-5 text-yellow-400" />
              <h2 className="text-lg font-bold text-white">4. Central Endpoints</h2>
            </div>

            <p className="mt-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
              Every client targets one base URL, then the route it needs:
            </p>

            <div className="mt-4 space-y-1.5 font-mono text-[11px] text-slate-300">
              <div className="flex flex-wrap gap-x-3 gap-y-1"><span className="w-12 shrink-0 text-emerald-400 font-bold">GET</span><span>/health</span><span className="text-slate-500 font-sans text-xs">— liveness probe (public)</span></div>
              <div className="flex flex-wrap gap-x-3 gap-y-1"><span className="w-12 shrink-0 text-emerald-400 font-bold">GET</span><span>/status</span><span className="text-slate-500 font-sans text-xs">— service status summary (public)</span></div>
              <div className="flex flex-wrap gap-x-3 gap-y-1"><span className="w-12 shrink-0 text-emerald-400 font-bold">GET</span><span>/auth/me</span><span className="text-slate-500 font-sans text-xs">— current session user (session Bearer)</span></div>
              <div className="flex flex-wrap gap-x-3 gap-y-1"><span className="w-12 shrink-0 text-blue-400 font-bold">POST</span><span>/auth/register</span><span className="text-slate-500 font-sans text-xs">— create account (admin role requires ADMIN_EMAILS)</span></div>
              <div className="flex flex-wrap gap-x-3 gap-y-1"><span className="w-12 shrink-0 text-blue-400 font-bold">POST</span><span>/api-keys</span><span className="text-slate-500 font-sans text-xs">— create a scoped key (session)</span></div>
              <div className="flex flex-wrap gap-x-3 gap-y-1"><span className="w-12 shrink-0 text-emerald-400 font-bold">GET</span><span>/public/ping</span><span className="text-slate-500 font-sans text-xs">— key-authenticated ping (sk_… key)</span></div>
              <div className="flex flex-wrap gap-x-3 gap-y-1"><span className="w-12 shrink-0 text-blue-400 font-bold">POST</span><span>/ai/chat</span><span className="text-slate-500 font-sans text-xs">— AI assistant (free model, session)</span></div>
            </div>

            <CommentsSection docId="endpoints" />
          </div>

          {/* Section 6 (sidebar): Error Codes & Limits */}
          <div id="errors" className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
              <Lock className="h-5 w-5 text-red-400" />
              <h2 className="text-lg font-bold text-white">6. Error Codes & Limits</h2>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 font-mono text-[11px]">
                    <th className="py-2.5 px-3">Code</th>
                    <th className="py-2.5 px-3">Meaning</th>
                    <th className="py-2.5 px-3">What to do</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px] text-slate-300">
                  <tr>
                    <td className="py-2.5 px-3 text-amber-300 font-bold">400</td>
                    <td className="py-2.5 px-3 font-sans text-xs">Validation failed</td>
                    <td className="py-2.5 px-3 font-sans text-xs text-slate-400">Fix the request body or parameters</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-amber-300 font-bold">401</td>
                    <td className="py-2.5 px-3 font-sans text-xs">Missing or invalid credentials</td>
                    <td className="py-2.5 px-3 font-sans text-xs text-slate-400">Sign in, or send a valid sk_… API key</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-amber-300 font-bold">403</td>
                    <td className="py-2.5 px-3 font-sans text-xs">Scope or role not granted</td>
                    <td className="py-2.5 px-3 font-sans text-xs text-slate-400">Request allowed scopes (admin scopes need ADMIN)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-slate-400 font-bold">404</td>
                    <td className="py-2.5 px-3 font-sans text-xs">Resource not found</td>
                    <td className="py-2.5 px-3 font-sans text-xs text-slate-400">Check the id and route spelling</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-amber-300 font-bold">409</td>
                    <td className="py-2.5 px-3 font-sans text-xs">Duplicate email on register</td>
                    <td className="py-2.5 px-3 font-sans text-xs text-slate-400">Use another address or sign in instead</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-red-300 font-bold">429</td>
                    <td className="py-2.5 px-3 font-sans text-xs">Rate limit exceeded</td>
                    <td className="py-2.5 px-3 font-sans text-xs text-slate-400">Honor Retry-After + X-RateLimit-Reset headers</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-red-300 font-bold">500</td>
                    <td className="py-2.5 px-3 font-sans text-xs">Unexpected server error</td>
                    <td className="py-2.5 px-3 font-sans text-xs text-slate-400">Retry with exponential backoff</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <CommentsSection docId="errors" />
          </div>
        </div>
      </div>
    </div>
  );
};
