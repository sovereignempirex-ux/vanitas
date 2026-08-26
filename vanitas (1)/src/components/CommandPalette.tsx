import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../lib/apiClient.ts';
import { SemanticSearchHit, SemanticSearchResponse } from '../types.ts';
import {
  Search,
  Key,
  Terminal,
  FileCode2,
  Activity,
  Sparkles,
  Bot,
  Webhook,
  User,
  Shield,
  Users,
  ScrollText,
  Lock,
  Sliders,
  AlertOctagon,
  X,
  ArrowRight,
  Download,
  Smartphone,
  Laptop,
  Database,
  Loader2,
  Cpu,
  CheckCircle2,
  ExternalLink,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const { setActiveView, role, toggleRole } = useAuth();
  const [search, setSearch] = useState('');
  const [semanticMode, setSemanticMode] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResponse | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'commands' | 'semantic' | 'docs' | 'keys' | 'downloads' | 'database'>('all');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced AI Semantic Search
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSemanticResults(null);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!search.trim() || search.length < 2) {
      setSemanticResults(null);
      setIsSearching(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.semanticSearch(search.trim());
        if (res && res.hits) {
          setSemanticResults(res);
        }
      } catch (err) {
        console.warn('Semantic search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 320);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [search, isOpen]);

  if (!isOpen) return null;

  const baseCommands = [
    { id: 'downloads', label: 'Download Vanitas Clients (Android APK / Windows EXE)', category: 'Clients & Downloads', icon: Download, view: 'downloads' },
    { id: 'download-apk', label: 'Download Android Mobile App (.APK - Modern ARM64)', category: 'Clients & Downloads', icon: Smartphone, view: 'downloads' },
    { id: 'download-exe', label: 'Download Windows Desktop Client (.EXE - DirectX Glass)', category: 'Clients & Downloads', icon: Laptop, view: 'downloads' },
    { id: 'overview', label: 'Welcome Center & Video Tutorials', category: 'Platform', icon: Layers, view: 'overview' },
    { id: 'keys', label: 'Create or Rotate API Key & Scopes', category: 'API Keys', icon: Key, view: 'keys' },
    { id: 'playground', label: 'Open Interactive API Playground', category: 'Developer', icon: Terminal, view: 'playground' },
    { id: 'ai', label: 'Ask Vanitas AI Assistant & Code Diagnostics', category: 'Intelligence', icon: Sparkles, view: 'ai' },
    { id: 'docs', label: 'Search Developer Documentation & Scopes', category: 'Docs', icon: FileCode2, view: 'docs' },
    { id: 'security', label: 'Configure 2FA & Active Sessions', category: 'Security', icon: Shield, view: 'security' },
    { id: 'bot-gateway', label: 'Manage Discord & WhatsApp Bot Ingress', category: 'Ecosystem', icon: Bot, view: 'bot-gateway' },
    { id: 'webhooks', label: 'Configure Webhook Dispatcher', category: 'Ecosystem', icon: Webhook, view: 'webhooks' },
    { id: 'status', label: 'View Public System Uptime & Cloud DB Status', category: 'Platform', icon: Activity, view: 'status' },
    { id: 'profile', label: 'Change Identity & Character Preset', category: 'Account', icon: User, view: 'profile' },
    ...(role === 'ADMIN'
      ? [
          { id: 'admin-center', label: 'Manage Users & RBAC Matrix', category: 'Admin Center', icon: Users, view: 'admin-center' },
          { id: 'admin-logs', label: 'Inspect Audit Logs & Export CSV', category: 'Admin Center', icon: ScrollText, view: 'admin-logs' },
          { id: 'admin-permissions', label: 'System Permissions Matrix', category: 'Admin Center', icon: Lock, view: 'admin-permissions' },
          { id: 'admin-flags', label: 'Toggle Feature Flags', category: 'Admin Center', icon: Sliders, view: 'admin-flags' },
          { id: 'admin-emergency', label: 'Emergency Controls & Killswitch', category: 'Admin Center', icon: AlertOctagon, view: 'admin-emergency' },
        ]
      : []),
  ];

  const filteredCommands = baseCommands.filter(
    (c) =>
      c.label.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (viewId: string) => {
    setActiveView(viewId);
    onClose();
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'api_keys':
        return Key;
      case 'documentation':
        return FileCode2;
      case 'status':
        return Activity;
      case 'bot_gateway':
        return Bot;
      case 'downloads':
        return Download;
      case 'database':
        return Database;
      default:
        return Sparkles;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/20 bg-slate-950/90 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_35px_rgba(59,130,246,0.15)] overflow-hidden backdrop-blur-2xl transition-all">
        
        {/* Crystal Ambient Gradient Header */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 opacity-90" />

        {/* Search Input Box */}
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4 bg-white/[0.02]">
          <div className="relative flex items-center justify-center">
            {isSearching ? (
              <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
            ) : (
              <Search className="h-5 w-5 text-blue-400" />
            )}
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
          </div>

          <input
            type="text"
            placeholder="Search API keys, documentation, status, downloads, or ask AI (English / عربي)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none tracking-wide"
          />

          <div className="flex items-center gap-2">
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  setSemanticResults(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                title="Clear query"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <div className="hidden sm:flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-slate-400">
              <kbd className="font-sans">ESC</kbd>
            </div>
          </div>
        </div>

        {/* Filter Quick Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 bg-slate-900/50 overflow-x-auto text-[11px]">
          <span className="text-slate-500 font-mono mr-1">Scope:</span>
          {[
            { id: 'all', label: 'All Resources' },
            { id: 'semantic', label: '✨ AI Semantic' },
            { id: 'commands', label: 'Commands' },
            { id: 'keys', label: 'API Keys' },
            { id: 'docs', label: 'Docs' },
            { id: 'downloads', label: 'Downloads' },
            { id: 'database', label: 'Databases' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={`rounded-full px-2.5 py-0.5 transition-all whitespace-nowrap ${
                activeFilter === tab.id
                  ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 font-medium'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* AI Intent & Explanation Card (When Semantic Search Has Results) */}
        {semanticResults && (
          <div className="p-3 bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/20 border-b border-blue-500/20 backdrop-blur-md">
            <div className="flex items-start gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-400/30 text-blue-300 mt-0.5">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                    Gemini Semantic Intelligence
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {semanticResults.executionTimeMs}ms • {semanticResults.hits.length} matches
                  </span>
                </div>
                <p className="text-xs text-slate-200 mt-0.5 font-medium leading-relaxed">
                  {semanticResults.aiExplanation}
                </p>
                {semanticResults.intent && (
                  <p className="text-[10px] text-blue-200/70 mt-1 italic">
                    Query intent: {semanticResults.intent}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Results Container */}
        <div className="max-h-[380px] overflow-y-auto p-2 divide-y divide-white/5 space-y-1">
          
          {/* 1. AI Semantic Hits */}
          {semanticResults && semanticResults.hits.length > 0 && activeFilter !== 'commands' && (
            <div className="space-y-1 pb-2">
              <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-blue-400 font-semibold flex items-center justify-between">
                <span>Semantic Matches ({semanticResults.hits.length})</span>
                <span>Sorted by Relevance</span>
              </div>

              {semanticResults.hits.map((hit: SemanticSearchHit) => {
                const Icon = getCategoryIcon(hit.category);
                const confidenceColor =
                  hit.confidenceLevel === 'high'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : hit.confidenceLevel === 'medium'
                    ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                    : 'bg-slate-500/10 text-slate-400 border-slate-500/30';

                return (
                  <button
                    key={hit.id}
                    onClick={() => handleSelect(hit.targetView)}
                    className="flex w-full items-start justify-between rounded-xl p-2.5 text-left bg-white/[0.02] hover:bg-blue-600/15 border border-white/5 hover:border-blue-500/30 transition-all group"
                  >
                    <div className="flex items-start gap-3 min-w-0 pr-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-xs text-slate-100 group-hover:text-white truncate">
                            {hit.title}
                          </p>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono border ${confidenceColor}`}>
                            {Math.round(hit.relevanceScore * 100)}% match
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-snug">
                          {hit.snippet}
                        </p>
                        {hit.tags && hit.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {hit.tags.slice(0, 4).map((t, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.2 rounded bg-white/5 text-[9px] font-mono text-slate-400"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-blue-400 group-hover:text-blue-300 transition-colors">
                      <span className="hidden sm:inline">{hit.actionLabel || 'Open'}</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 2. Platform Navigation Commands */}
          {activeFilter !== 'semantic' && (
            <div className="space-y-1 pt-1">
              {semanticResults && semanticResults.hits.length > 0 && (
                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                  Quick Navigation Commands
                </div>
              )}

              {filteredCommands.length === 0 && (!semanticResults || semanticResults.hits.length === 0) ? (
                <div className="py-10 text-center">
                  <Cpu className="h-8 w-8 text-slate-600 mx-auto mb-2 opacity-50" />
                  <p className="text-xs text-slate-400">No direct command or resource match for "{search}".</p>
                  <p className="text-[11px] text-slate-500 mt-1">Try searching with natural language (e.g., "تنزيل تطبيق أندرويد" or "rotate live keys")</p>
                </div>
              ) : (
                filteredCommands.map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => handleSelect(cmd.view)}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs text-left text-slate-300 hover:bg-blue-600/15 hover:text-blue-200 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] border border-white/10 text-slate-400 group-hover:border-blue-500/30 group-hover:text-blue-400 transition-colors">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-200 group-hover:text-white">{cmd.label}</p>
                          <p className="text-[10px] font-mono text-slate-500">{cmd.category}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-blue-400 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Crystal Glass Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-slate-950/80 px-4 py-2.5 text-[11px] text-slate-400 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-slate-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              AI Search Live
            </span>
            <span className="hidden sm:inline text-slate-600">•</span>
            <span className="hidden sm:inline text-slate-500">Supports English & Arabic queries</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">Role:</span>
            <button
              onClick={() => {
                toggleRole();
                onClose();
              }}
              className="rounded-md border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] text-blue-300 hover:bg-white/10 transition-colors"
            >
              Switch to {role === 'ADMIN' ? 'USER' : 'ADMIN'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

