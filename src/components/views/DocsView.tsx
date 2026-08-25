import React, { useState } from 'react';
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Navigation Index (3 cols) */}
        <div className="lg:col-span-3 space-y-1">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3 backdrop-blur-xl sticky top-24">
            <p className="px-3 py-1.5 text-[10px] font-mono uppercase font-bold text-slate-400">Documentation Index</p>
            <div className="space-y-0.5 mt-1">
              {sections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
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
              <span>https://vanitas-bot.vercel.app/api/v1</span>
              <button
                onClick={() => copySnippet('base-url', 'https://vanitas-bot.vercel.app/api/v1')}
                className="text-slate-400 hover:text-white"
              >
                {copiedSection === 'base-url' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
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
          </div>

          {/* Section 4: Bot Gateway */}
          <div id="bots" className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
              <Bot className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white">4. Bot Gateway Integration</h2>
            </div>

            <p className="mt-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
              Bot agents authenticate via <code className="font-mono text-emerald-300">POST /api/v1/bot/execute</code>:
            </p>

            <pre className="mt-3 rounded-2xl border border-white/10 bg-black/60 p-4 font-mono text-xs text-slate-300 overflow-x-auto">
              <code>{`curl -X POST https://vanitas-bot.vercel.app/api/v1/bot/execute \\
  -H "Authorization: Bearer sk_live_discord_••••••••" \\
  -H "x-client-source: BOT" \\
  -H "Content-Type: application/json" \\
  -d '{
    "platform": "discord",
    "command": "system_status",
    "payload": { "target": "all" }
  }'`}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
