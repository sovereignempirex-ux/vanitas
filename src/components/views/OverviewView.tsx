import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../lib/apiClient.ts';
import { BRAND_ASSETS } from '../../data/assets.ts';
import { SystemStats, VideoTutorialItem, ExternalDatabaseConfig, YouTubeVideoItem } from '../../types.ts';
import { detectUserPlatform } from '../../lib/platformDetector.ts';
import {
  Activity,
  Layers,
  Key,
  Shield,
  Bot,
  Globe,
  Smartphone,
  Laptop,
  Database,
  Terminal,
  ArrowUpRight,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Server,
  Cpu,
  Download,
  QrCode,
  Play,
  Search,
  ExternalLink,
  Youtube,
  Plus,
  RefreshCw,
  Clock,
  Tag,
  X,
  Radio,
  Sliders,
} from 'lucide-react';

export const OverviewView: React.FC = () => {
  const { setActiveView, role } = useAuth();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [tutorials, setTutorials] = useState<VideoTutorialItem[]>([]);
  const [databases, setDatabases] = useState<ExternalDatabaseConfig[]>([]);
  const [activeVideoModal, setActiveVideoModal] = useState<VideoTutorialItem | null>(null);
  const [loading, setLoading] = useState(true);

  // YouTube Live Search State
  const [ytQuery, setYtQuery] = useState('Vanitas API Gateway Supabase');
  const [ytVideos, setYtVideos] = useState<YouTubeVideoItem[]>([]);
  const [isSearchingYt, setIsSearchingYt] = useState(false);
  const [ytAiSummary, setYtAiSummary] = useState('');

  // New Database Modal State
  const [isAddDbOpen, setIsAddDbOpen] = useState(false);
  const [dbName, setDbName] = useState('');
  const [dbProvider, setDbProvider] = useState<'supabase' | 'neon' | 'upstash' | 'render'>('supabase');
  const [dbConnectionUrl, setDbConnectionUrl] = useState('');
  const [dbRegion, setDbRegion] = useState('eu-central-1 (Frankfurt)');
  const [testingDbId, setTestingDbId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; msg: string; latency: number } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [statsData, tutData, dbData] = await Promise.all([
          api.getAdminStatistics().catch(() => ({ stats: null })),
          api.getVideoTutorials().catch(() => ({ tutorials: [] })),
          api.getExternalDatabases().catch(() => ({ databases: [] })),
        ]);

        if (statsData?.stats) setStats(statsData.stats);
        if (tutData?.tutorials) setTutorials(tutData.tutorials);
        if (dbData?.databases) setDatabases(dbData.databases);
      } catch (e) {
        console.warn('Using base status:', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Handle YouTube Search
  const handleSearchYouTube = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ytQuery.trim()) return;

    setIsSearchingYt(true);
    try {
      const res = await api.searchYouTubeVideos(ytQuery.trim(), 4);
      if (res && res.videos) {
        setYtVideos(res.videos);
        if (res.aiSummary) setYtAiSummary(res.aiSummary);
      }
    } catch (err) {
      console.warn('YouTube search failed:', err);
    } finally {
      setIsSearchingYt(false);
    }
  };

  const handleTestDatabase = async (id: string) => {
    setTestingDbId(id);
    try {
      const res = await api.testExternalDatabase(id);
      if (res.success) {
        setTestResult({ id, msg: res.message, latency: res.latencyMs });
        // Refresh local database list
        const updated = await api.getExternalDatabases();
        if (updated?.databases) setDatabases(updated.databases);
      }
    } catch (err: any) {
      setTestResult({ id, msg: err.message || 'Connection test failed', latency: 0 });
    } finally {
      setTestingDbId(null);
    }
  };

  const handleCreateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbName || !dbConnectionUrl) return;

    try {
      await api.addExternalDatabase({
        name: dbName,
        provider: dbProvider,
        connectionUrl: dbConnectionUrl,
        region: dbRegion,
      });
      const updated = await api.getExternalDatabases();
      if (updated?.databases) setDatabases(updated.databases);
      setIsAddDbOpen(false);
      setDbName('');
      setDbConnectionUrl('');
    } catch (err) {
      console.error('Failed to create database:', err);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Glass Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-r from-[#0a1024] via-[#091533] to-[#0a0e1a] p-6 sm:p-10 shadow-[0_0_50px_rgba(59,130,246,0.15)]">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 h-60 w-60 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-mono font-medium text-blue-300">
              <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping" />
              <span>CENTRALIZED API & CLOUD ECOSYSTEM</span>
            </div>
            <h1 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
              One Unified Gateway.<br />
              <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-200 bg-clip-text text-transparent">
                Every Client. Total Security.
              </span>
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
              Vanitas connects web applications, Discord/WhatsApp bots, mobile apps, and desktop agents through a single secure API with granular scope validation, live audit tracking, and AI-powered intelligence.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {/* Dynamic device download button */}
              {(() => {
                const detected = detectUserPlatform();
                return (
                  <button
                    onClick={() => setActiveView('downloads')}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30 hover:from-blue-500 hover:to-cyan-500 transition-all active:scale-95"
                  >
                    <Download className="h-4 w-4" />
                    <span>
                      {detected.isMobile ? 'Download Android APK (ARM64)' : 'Download Windows EXE (DirectX)'}
                    </span>
                  </button>
                );
              })()}
              <button
                onClick={() => setActiveView('keys')}
                className="flex items-center gap-2 rounded-xl bg-slate-800/80 border border-white/10 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 transition-all"
              >
                <Key className="h-4 w-4 text-blue-400" />
                <span>Manage API Keys</span>
              </button>
              <button
                onClick={() => setActiveView('playground')}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.1] hover:border-blue-400/40 transition-all"
              >
                <Terminal className="h-4 w-4 text-blue-400" />
                <span>API Playground</span>
              </button>
              <button
                onClick={() => setActiveView('ai')}
                className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-4 py-2.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/40 transition-all"
              >
                <Sparkles className="h-4 w-4 text-cyan-400" />
                <span>Vanitas AI Copilot</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Capsule */}
          <div className="w-full md:w-auto flex-shrink-0 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl">
              <p className="text-[11px] font-mono text-slate-400">Requests Today</p>
              <p className="text-2xl font-bold font-mono text-white mt-1">
                {stats?.apiRequestsToday?.toLocaleString() || '8,420'}
              </p>
              <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-400">
                <ArrowUpRight className="h-3 w-3" />
                <span>+14.2% vs yesterday</span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl">
              <p className="text-[11px] font-mono text-slate-400">p95 Latency</p>
              <p className="text-2xl font-bold font-mono text-cyan-300 mt-1">
                {stats?.p95LatencyMs || 24}ms
              </p>
              <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                <span>Nominal performance</span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl">
              <p className="text-[11px] font-mono text-slate-400">Active Keys</p>
              <p className="text-2xl font-bold font-mono text-blue-300 mt-1">
                {stats?.activeApiKeys || 18}
              </p>
              <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-400">
                <span>Scoped tokens</span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl">
              <p className="text-[11px] font-mono text-slate-400">Error Rate</p>
              <p className="text-2xl font-bold font-mono text-emerald-300 mt-1">
                {((stats?.errorRate || 0.0004) * 100).toFixed(2)}%
              </p>
              <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                <span>99.98% uptime</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 1. VIDEO TUTORIALS & WELCOME WALKTHROUGHS (مع قسم الفيديوهات الترحيبية) */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-3xl border border-white/15 bg-slate-950/70 p-6 sm:p-8 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
                <Youtube className="h-4 w-4" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                Video Tutorials & Developer Walkthroughs
              </h2>
              <span className="rounded-full bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 text-[10px] font-mono text-blue-300">
                فيديوهات الشرح والتحميل
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Watch step-by-step guides on setting up credentials, connecting free cloud databases, and downloading the latest Android APK and Windows EXE.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveView('downloads')}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 transition-all active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Direct Downloads Hub (تحميل مباشر)</span>
            </button>
          </div>
        </div>

        {/* Video Cards Grid */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {tutorials.map((vid) => (
            <div
              key={vid.id}
              className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-blue-500/40 p-4 transition-all backdrop-blur-xl shadow-lg"
            >
              <div>
                {/* Thumbnail with Glass Play Button */}
                <div
                  onClick={() => setActiveVideoModal(vid)}
                  className="relative aspect-video w-full rounded-xl overflow-hidden cursor-pointer border border-white/10 bg-slate-900 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all"
                >
                  <img
                    src={vid.thumbnailUrl}
                    alt={vid.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-center justify-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/90 text-white shadow-lg shadow-blue-500/50 group-hover:scale-110 transition-transform">
                      <Play className="h-4 w-4 fill-white ml-0.5" />
                    </div>
                  </div>
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-0.5 text-[10px] font-mono text-white backdrop-blur-md">
                    {vid.duration}
                  </span>
                  {vid.badge && (
                    <span className="absolute top-2 left-2 rounded bg-blue-600/80 px-2 py-0.5 text-[9px] font-semibold text-white uppercase tracking-wider backdrop-blur-md border border-blue-400/30">
                      {vid.badge}
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <h3 className="text-xs font-bold text-slate-100 group-hover:text-blue-300 line-clamp-1 transition-colors">
                    {vid.title}
                  </h3>
                  {vid.titleArabic && (
                    <p className="text-[11px] text-slate-300 font-medium line-clamp-1 mt-0.5" dir="rtl">
                      {vid.titleArabic}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-snug">
                    {vid.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                <button
                  onClick={() => setActiveVideoModal(vid)}
                  className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                >
                  <Play className="h-3 w-3" />
                  <span>Watch Walkthrough</span>
                </button>
                <button
                  onClick={() => setActiveView('downloads')}
                  className="rounded-lg bg-white/5 hover:bg-blue-600/20 border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-blue-200 transition-colors flex items-center gap-1"
                >
                  <Download className="h-3 w-3 text-blue-400" />
                  <span>Download</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 2. EXTERNAL CLOUD DATABASES & SERVERS (SUPABASE / NEON / UPSTASH) */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-3xl border border-white/15 bg-slate-950/70 p-6 sm:p-8 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <Database className="h-4 w-4" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                External Cloud Databases & Free Servers
              </h2>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-mono text-emerald-300">
                سيرفر وقواعد بيانات مجانية
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Connect and monitor zero-cost PostgreSQL, Redis, and backend service instances (Supabase, Neon Postgres, Upstash Redis, Render).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddDbOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-emerald-600/30 border border-emerald-500/40 hover:bg-emerald-600/40 px-3.5 py-2 text-xs font-bold text-emerald-200 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Connect External DB</span>
            </button>
          </div>
        </div>

        {/* Database List */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {databases.map((db) => (
            <div
              key={db.id}
              className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] p-4 transition-all backdrop-blur-xl"
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    {db.provider.toUpperCase()} • {db.tier.toUpperCase()}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-mono text-slate-400">{db.latencyMs}ms</span>
                  </div>
                </div>

                <h3 className="text-xs font-bold text-white mt-3">{db.name}</h3>
                <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">{db.region}</p>
                <p className="text-[10px] font-mono text-blue-300 mt-1 bg-black/40 px-2 py-1 rounded border border-white/5 truncate">
                  {db.connectionUrlMasked}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                  <div className="bg-white/[0.02] p-2 rounded-lg border border-white/5">
                    <span className="block text-slate-500">Tables</span>
                    <span className="font-bold text-slate-200">{db.tablesCount} schema tables</span>
                  </div>
                  <div className="bg-white/[0.02] p-2 rounded-lg border border-white/5">
                    <span className="block text-slate-500">Storage</span>
                    <span className="font-bold text-slate-200">{db.storageUsedMb} / {db.storageMaxMb} MB</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                <button
                  onClick={() => handleTestDatabase(db.id)}
                  disabled={testingDbId === db.id}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`h-3 w-3 ${testingDbId === db.id ? 'animate-spin' : ''}`} />
                  <span>{testingDbId === db.id ? 'Testing...' : 'Test Connection'}</span>
                </button>
                <span className="text-[10px] font-mono text-slate-500">SSL Active</span>
              </div>
            </div>
          ))}
        </div>

        {testResult && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{testResult.msg}</span>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 3. YOUTUBE VIDEO SEARCH & AI COPILOT GROUNDING */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-3xl border border-white/15 bg-slate-950/70 p-6 sm:p-8 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                YouTube Video Intelligence & Search
              </h2>
              <span className="rounded-full bg-purple-500/10 border border-purple-500/30 px-2.5 py-0.5 text-[10px] font-mono text-purple-300">
                بحث يوتيوب الذكي
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Search any developer topic, tutorial, or architecture pattern on YouTube using Gemini's search grounding.
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchYouTube} className="mt-6 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={ytQuery}
              onChange={(e) => setYtQuery(e.target.value)}
              placeholder="Search tutorials on YouTube (e.g. 'Supabase PostgreSQL setup', 'Discord Bot Webhooks')..."
              className="w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-purple-500/50 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={isSearchingYt}
            className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-purple-600/30 transition-all disabled:opacity-50"
          >
            {isSearchingYt ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span>Search YouTube</span>
          </button>
        </form>

        {ytAiSummary && (
          <div className="mt-4 p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/20 text-purple-200 text-xs flex items-start gap-2.5">
            <Sparkles className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-purple-300">AI Synthesis & Guidance:</p>
              <p className="text-slate-300 mt-0.5 leading-relaxed">{ytAiSummary}</p>
            </div>
          </div>
        )}

        {ytVideos.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {ytVideos.map((vid) => (
              <div
                key={vid.id}
                className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] p-3.5 transition-all"
              >
                <div>
                  <div
                    onClick={() => {
                      setActiveVideoModal({
                        id: vid.id,
                        title: vid.title,
                        description: vid.description,
                        category: 'getting_started',
                        duration: vid.duration || '15:00',
                        thumbnailUrl: vid.thumbnailUrl,
                        videoEmbedUrl: vid.embedUrl,
                        youtubeId: vid.id,
                        badge: 'YouTube Guide',
                        author: vid.channelTitle,
                        tags: vid.tags || [],
                      });
                    }}
                    className="relative aspect-video w-full rounded-xl overflow-hidden cursor-pointer border border-white/10 bg-slate-900"
                  >
                    <img src={vid.thumbnailUrl} alt={vid.title} className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="h-8 w-8 text-white fill-white" />
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-white mt-2.5 line-clamp-2 group-hover:text-purple-300 transition-colors">
                    {vid.title}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1">{vid.channelTitle} • {vid.views || '10K'} views</p>
                  {vid.aiTakeaway && (
                    <p className="text-[10px] text-cyan-300 mt-1.5 bg-cyan-950/40 p-1.5 rounded border border-cyan-500/20">
                      💡 {vid.aiTakeaway}
                    </p>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                  <a
                    href={vid.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-medium text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    <span>Open on YouTube</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <button
                    onClick={() => setActiveView('downloads')}
                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300"
                  >
                    Get Client
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 4. MODAL: VIDEO PLAYER POPUP */}
      {/* ---------------------------------------------------------------- */}
      {activeVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in">
          <div className="relative w-full max-w-4xl rounded-3xl border border-white/20 bg-slate-950 shadow-2xl overflow-hidden backdrop-blur-2xl">
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-900/60">
              <div className="flex items-center gap-2">
                <Youtube className="h-5 w-5 text-red-500" />
                <h3 className="text-sm font-bold text-white truncate max-w-lg">{activeVideoModal.title}</h3>
              </div>
              <button
                onClick={() => setActiveVideoModal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Video Frame */}
            <div className="aspect-video w-full bg-black">
              <iframe
                src={activeVideoModal.videoEmbedUrl}
                title={activeVideoModal.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            {/* Details & Actions Footer */}
            <div className="p-6 bg-slate-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-300 max-w-xl leading-relaxed">{activeVideoModal.description}</p>
                {activeVideoModal.highlights && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {activeVideoModal.highlights.map((h, i) => (
                      <span key={i} className="text-[10px] font-mono text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20">
                        ✓ {h}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setActiveVideoModal(null);
                    setActiveView('downloads');
                  }}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition-all"
                >
                  <Download className="h-4 w-4" />
                  <span>Go to Downloads (تحميل المباشر)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 5. MODAL: CONNECT EXTERNAL DATABASE */}
      {/* ---------------------------------------------------------------- */}
      {isAddDbOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl border border-white/20 bg-slate-950 shadow-2xl p-6 backdrop-blur-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Connect External Cloud Database</h3>
              </div>
              <button onClick={() => setIsAddDbOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDatabase} className="mt-4 space-y-4">
              <div>
                <label className="text-[11px] font-mono text-slate-400">Database Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. My Supabase Production Cluster"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400">Free Tier Provider</label>
                <select
                  value={dbProvider}
                  onChange={(e) => setDbProvider(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="supabase">Supabase PostgreSQL (500MB Free)</option>
                  <option value="neon">Neon Serverless Postgres (Scale-to-Zero)</option>
                  <option value="upstash">Upstash Serverless Redis (10K Cmds/day)</option>
                  <option value="render">Render / Railway Free Backend Service</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400">Connection URI (Masked & Encrypted)</label>
                <input
                  type="password"
                  required
                  placeholder="postgresql://postgres:password@db.supabase.co:5432/postgres"
                  value={dbConnectionUrl}
                  onChange={(e) => setDbConnectionUrl(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400">Region</label>
                <input
                  type="text"
                  value={dbRegion}
                  onChange={(e) => setDbRegion(e.target.value)}
                  placeholder="eu-central-1 (Frankfurt)"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none font-mono"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddDbOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-400 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/30"
                >
                  Save Connection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 6. BOTTOM TELEMETRY GRID & CONTROLS */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Traffic Breakdown */}
        <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Endpoint Traffic Breakdown</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Live Telemetry</span>
          </div>

          <div className="mt-4 space-y-3">
            {stats?.requestBreakdown.map((ep) => (
              <div key={ep.endpoint} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-medium text-slate-200">{ep.endpoint}</span>
                  <span className="font-mono text-blue-400">{ep.count.toLocaleString()} calls</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Avg Latency: {ep.avgLatencyMs}ms</span>
                  <span>Errors: {ep.errorCount}</span>
                </div>
                {/* Progress bar */}
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${Math.min(100, (ep.count / (stats.apiRequestsToday || 10000)) * 100 * 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security & Quick Controls Card */}
        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Security Posture</h3>
              </div>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-400">
                ACTIVE
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Granular RBAC</span>
                <span className="font-mono text-blue-400">Enforced</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Secret Masking</span>
                <span className="font-mono text-blue-400">One-Time Reveal</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>assertGrantableScopes</span>
                <span className="font-mono text-emerald-400">Validated</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Rate Limiting</span>
                <span className="font-mono text-blue-400">600 req/min</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 space-y-2">
            <button
              onClick={() => setActiveView('security')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08] transition-colors"
            >
              <Shield className="h-3.5 w-3.5 text-blue-400" />
              <span>Open Security Center</span>
            </button>
            <button
              onClick={() => setActiveView('ai')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600/20 border border-blue-500/30 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-600/30 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
              <span>Ask Vanitas AI Analyst</span>
            </button>
          </div>
        </div>
      </div>

      {/* Centralized Architecture Visualizer */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-bold text-white">Vanitas Centralized Architecture</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Live ingress topology routing all external endpoints through server-side authorization
            </p>
          </div>
          <span className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 font-mono text-xs text-blue-300">
            https://vanitas-bot.vercel.app/api/v1/
          </span>
        </div>

        {/* Dynamic Topology Chart */}
        <div className="mt-8 relative flex flex-col items-center">
          {/* Top: Master Vanitas Logo & Core */}
          <div className="flex flex-col items-center group cursor-pointer" onClick={() => setActiveView('overview')}>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/20 border-2 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.4)] group-hover:scale-105 transition-all">
              <img src={BRAND_ASSETS.logo} alt="Vanitas" className="h-10 w-10 object-contain" />
            </div>
            <span className="mt-2 font-display text-sm font-bold tracking-wider text-white">VANITAS CORE</span>
            <span className="text-[10px] font-mono text-blue-400">Central API Gateway & Auth</span>
          </div>

          {/* Connecting Trunk */}
          <div className="w-0.5 h-10 bg-gradient-to-b from-blue-500 to-blue-400/50 my-1" />

          {/* Ingress Bus */}
          <div className="relative w-full max-w-3xl">
            <div className="h-0.5 w-full bg-gradient-to-r from-blue-500/20 via-blue-400 to-blue-500/20" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              {/* Client 1: Website */}
              <div
                onClick={() => setActiveView('playground')}
                className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-center hover:border-blue-400/50 hover:bg-slate-900/90 transition-all cursor-pointer group"
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                  <Globe className="h-5 w-5" />
                </div>
                <h3 className="mt-2.5 text-xs font-semibold text-white">Website & Portal</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">SPA + Developer Portal</p>
                <span className="inline-block mt-2 rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[9px] text-blue-300">
                  Active Ingress
                </span>
              </div>

              {/* Client 2: Bot */}
              <div
                onClick={() => setActiveView('bot-gateway')}
                className="rounded-2xl border border-emerald-500/20 bg-slate-900/70 p-4 text-center hover:border-emerald-400/50 hover:bg-slate-900/90 transition-all cursor-pointer group"
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                  <Bot className="h-5 w-5" />
                </div>
                <h3 className="mt-2.5 text-xs font-semibold text-white">Bot Gateway</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Discord & WhatsApp</p>
                <span className="inline-block mt-2 rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] text-emerald-300">
                  bot.execute
                </span>
              </div>

              {/* Client 3: Mobile Native */}
              <div
                onClick={() => setActiveView('keys')}
                className="rounded-2xl border border-purple-500/20 bg-slate-900/70 p-4 text-center hover:border-purple-400/50 hover:bg-slate-900/90 transition-all cursor-pointer group"
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
                  <Smartphone className="h-5 w-5" />
                </div>
                <h3 className="mt-2.5 text-xs font-semibold text-white">Mobile Clients</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">iOS & Android SDKs</p>
                <span className="inline-block mt-2 rounded bg-purple-500/10 px-2 py-0.5 font-mono text-[9px] text-purple-300">
                  Bearer Auth
                </span>
              </div>

              {/* Client 4: Desktop Agent */}
              <div
                onClick={() => setActiveView('keys')}
                className="rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-4 text-center hover:border-cyan-400/50 hover:bg-slate-900/90 transition-all cursor-pointer group"
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
                  <Laptop className="h-5 w-5" />
                </div>
                <h3 className="mt-2.5 text-xs font-semibold text-white">Desktop Client</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">macOS & Windows CLI</p>
                <span className="inline-block mt-2 rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[9px] text-cyan-300">
                  Rate Limited
                </span>
              </div>
            </div>
          </div>

          {/* Down to Storage & Security Engine */}
          <div className="w-0.5 h-8 bg-gradient-to-b from-blue-400/50 to-blue-500 mt-4" />
          <div className="rounded-2xl border border-blue-500/30 bg-blue-950/30 px-6 py-3 text-center backdrop-blur-xl">
            <div className="flex items-center gap-2 justify-center text-xs font-semibold text-blue-200">
              <Database className="h-4 w-4 text-blue-400" />
              <span>DURABLE STORAGE & RBAC AUDIT LOG ENGINE</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Row Level Security • assertGrantableScopes • Token Hashing</p>
          </div>
        </div>
      </div>

      {/* Companion Native Applications Showcase */}
      <div className="rounded-3xl border border-blue-500/20 bg-gradient-to-r from-blue-950/20 via-slate-950/60 to-cyan-950/20 p-6 sm:p-8 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-cyan-400" />
              <h2 className="text-lg font-bold text-white">Native Client Applications & Binaries</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Download the official Vanitas client for Android (.APK) or Windows PC (.EXE) to pair with the Central API.
            </p>
          </div>
          <button
            onClick={() => setActiveView('downloads')}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600/20 border border-blue-500/30 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-600/30 transition-all"
          >
            <span>View All Downloads</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Android APK Card */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-5 hover:border-cyan-500/40 transition-all group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Smartphone className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Android Mobile App (.APK)</h3>
                  <p className="text-xs text-slate-400">v1.4.2 • 28.4 MB • arm64-v8a</p>
                </div>
              </div>
              <span className="rounded bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 font-mono text-[10px] text-cyan-300">
                APK
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-300 leading-relaxed">
              Fingerprint biometric auth, offline token vault, push alarms, and direct bot execution triggers.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => {
                  api.triggerDirectDownload('apk');
                }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-xs font-bold text-white transition-all shadow-md shadow-blue-600/20"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download APK</span>
              </button>
              <button
                onClick={() => setActiveView('downloads')}
                className="px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-all"
                title="Scan QR Code from phone camera"
              >
                <QrCode className="h-4 w-4 text-cyan-400" />
              </button>
            </div>
          </div>

          {/* Windows EXE Card */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-5 hover:border-blue-500/40 transition-all group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                  <Laptop className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Windows Desktop Client (.EXE)</h3>
                  <p className="text-xs text-slate-400">v1.4.2 • 64.8 MB • Windows 10/11 x64</p>
                </div>
              </div>
              <span className="rounded bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 font-mono text-[10px] text-blue-300">
                EXE
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-300 leading-relaxed">
              System Tray background daemon, global hotkey (Ctrl+Shift+V), and local reverse proxy cache.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => {
                  api.triggerDirectDownload('exe');
                }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 py-2.5 text-xs font-bold text-white transition-all shadow-md shadow-blue-600/20"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Setup.EXE</span>
              </button>
              <button
                onClick={() => setActiveView('downloads')}
                className="px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-all"
              >
                <span>Docs</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Live Traffic & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Traffic Breakdown */}
        <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Endpoint Traffic Breakdown</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Live Telemetry</span>
          </div>

          <div className="mt-4 space-y-3">
            {stats?.requestBreakdown.map((ep) => (
              <div key={ep.endpoint} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-medium text-slate-200">{ep.endpoint}</span>
                  <span className="font-mono text-blue-400">{ep.count.toLocaleString()} calls</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Avg Latency: {ep.avgLatencyMs}ms</span>
                  <span>Errors: {ep.errorCount}</span>
                </div>
                {/* Progress bar */}
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${Math.min(100, (ep.count / (stats.apiRequestsToday || 10000)) * 100 * 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security & Quick Controls Card */}
        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Security Posture</h3>
              </div>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-400">
                ACTIVE
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Granular RBAC</span>
                <span className="font-mono text-blue-400">Enforced</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Secret Masking</span>
                <span className="font-mono text-blue-400">One-Time Reveal</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>assertGrantableScopes</span>
                <span className="font-mono text-emerald-400">Validated</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Rate Limiting</span>
                <span className="font-mono text-blue-400">600 req/min</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 space-y-2">
            <button
              onClick={() => setActiveView('security')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08] transition-colors"
            >
              <Shield className="h-3.5 w-3.5 text-blue-400" />
              <span>Open Security Center</span>
            </button>
            <button
              onClick={() => setActiveView('ai')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600/20 border border-blue-500/30 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-600/30 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
              <span>Ask Vanitas AI Analyst</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
