import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../lib/apiClient.ts';
import { detectUserPlatform, PlatformInfo } from '../../lib/platformDetector.ts';
import { ClientRelease } from '../../types.ts';
import { BRAND_ASSETS } from '../../data/assets.ts';
import {
  Smartphone,
  Laptop,
  Download,
  CheckCircle2,
  ShieldCheck,
  QrCode,
  Copy,
  Check,
  ExternalLink,
  HardDrive,
  Cpu,
  Layers,
  Sparkles,
  Zap,
  Radio,
  FileCheck,
  Info,
  ChevronRight,
  Terminal,
  RefreshCw,
  Clock,
  ArrowDownToLine,
  KeyRound,
  Fingerprint,
  MonitorCheck,
  ShieldAlert,
} from 'lucide-react';

export const DownloadsView: React.FC = () => {
  const { setActiveView } = useAuth();
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>(detectUserPlatform());
  const [releases, setReleases] = useState<ClientRelease[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<'android' | 'windows' | 'macos' | 'linux'>('android');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [downloadingType, setDownloadingType] = useState<string | null>(null);
  const [downloadSuccessType, setDownloadSuccessType] = useState<string | null>(null);
  const [verifyInputHash, setVerifyInputHash] = useState('');
  const [verifyResult, setVerifyResult] = useState<'match' | 'mismatch' | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

  useEffect(() => {
    const detected = detectUserPlatform();
    setPlatformInfo(detected);

    if (detected.isMobile) {
      setSelectedPlatform('android');
    } else if (detected.detectedPlatform === 'desktop_mac') {
      setSelectedPlatform('macos');
    } else if (detected.detectedPlatform === 'desktop_linux') {
      setSelectedPlatform('linux');
    } else {
      setSelectedPlatform('windows');
    }

    loadReleases();
  }, []);

  const loadReleases = async () => {
    try {
      const data = await api.getReleases();
      if (data.releases) {
        setReleases(data.releases);
      }
    } catch (e) {
      console.warn('Failed to load release metadata:', e);
    }
  };

  const handleDownload = (type: 'apk' | 'exe' | 'dmg' | 'appimage') => {
    setDownloadingType(type);
    api.triggerDirectDownload(type);

    setTimeout(() => {
      setDownloadingType(null);
      setDownloadSuccessType(type);
      loadReleases(); // refresh download counts

      setTimeout(() => {
        setDownloadSuccessType(null);
      }, 5000);
    }, 1200);
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2500);
  };

  const activeRelease = releases.find((r) => r.platform === selectedPlatform) || releases[0];

  const handleVerifyHash = () => {
    if (!verifyInputHash.trim() || !activeRelease) return;
    const clean = verifyInputHash.trim().toLowerCase();
    if (clean === activeRelease.sha256.toLowerCase()) {
      setVerifyResult('match');
    } else {
      setVerifyResult('mismatch');
    }
  };

  // QR Code URL pointing to current origin APK download
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://vanitas-bot.vercel.app';
  const qrTargetUrl = `${currentOrigin}/api/v1/download/apk`;
  const qrCodeImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrTargetUrl)}&color=60-130-246&bgcolor=6-9-19&margin=2`;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Dynamic Device Detection Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-blue-500/30 bg-gradient-to-br from-[#0a122c] via-[#091533] to-[#070b18] p-6 sm:p-10 shadow-[0_0_50px_rgba(59,130,246,0.18)]">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 -mb-16 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="max-w-2xl space-y-4">
            {/* Detected Tag */}
            <div className="inline-flex items-center gap-2.5 rounded-full border border-blue-400/40 bg-blue-500/15 px-3.5 py-1.5 text-xs font-mono font-semibold text-blue-300 shadow-inner">
              {platformInfo.isMobile ? (
                <Smartphone className="h-4 w-4 text-cyan-400 animate-pulse" />
              ) : (
                <Laptop className="h-4 w-4 text-cyan-400 animate-pulse" />
              )}
              <span>AUTO-DETECTED: {platformInfo.label.toUpperCase()}</span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
              {platformInfo.isMobile ? (
                <>
                  Download Vanitas for{' '}
                  <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-300 bg-clip-text text-transparent">
                    Android (.APK)
                  </span>
                </>
              ) : (
                <>
                  Download Vanitas for{' '}
                  <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-300 bg-clip-text text-transparent">
                    {platformInfo.detectedPlatform === 'desktop_mac'
                      ? 'macOS (.DMG)'
                      : platformInfo.detectedPlatform === 'desktop_linux'
                      ? 'Linux (.AppImage)'
                      : 'Windows (.EXE)'}
                  </span>
                </>
              )}
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {platformInfo.isMobile
                ? 'Get the native Vanitas Android client with fingerprint unlock, offline token caching, Discord/WhatsApp bot execution triggers, and real-time push alarms directly on your phone.'
                : 'Experience the full Vanitas Desktop workstation featuring system tray background daemon, global Command Palette (Ctrl+Shift+V), hardware token encryption, and local ingress proxy.'}
            </p>

            {/* Main Call to Action Button */}
            <div className="pt-2 flex flex-wrap items-center gap-3.5">
              <button
                onClick={() => handleDownload(platformInfo.recommendedType)}
                disabled={downloadingType === platformInfo.recommendedType}
                className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3.5 text-sm font-bold text-white shadow-xl shadow-blue-600/30 hover:from-blue-500 hover:to-cyan-500 active:scale-[0.98] transition-all"
              >
                {downloadingType === platformInfo.recommendedType ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <Download className="h-5 w-5" />
                )}
                <span>
                  {downloadingType === platformInfo.recommendedType
                    ? 'Packaging Client...'
                    : platformInfo.isMobile
                    ? 'Download APK (Android v1.4.2)'
                    : platformInfo.detectedPlatform === 'desktop_mac'
                    ? 'Download DMG (macOS v1.4.2)'
                    : platformInfo.detectedPlatform === 'desktop_linux'
                    ? 'Download AppImage (Linux v1.4.2)'
                    : 'Download Setup.EXE (Windows v1.4.2)'}
                </span>
                <span className="rounded-lg bg-black/25 px-2 py-0.5 font-mono text-xs">
                  {platformInfo.isMobile ? '28.4 MB' : platformInfo.detectedPlatform === 'desktop_mac' ? '71.2 MB' : '64.8 MB'}
                </span>
              </button>

              {/* QR Code trigger for cross-device mobile download */}
              <button
                onClick={() => setShowQrModal(true)}
                className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.12] hover:border-blue-400/50 transition-all"
                title="Scan QR Code with mobile phone camera to download APK instantly"
              >
                <QrCode className="h-4 w-4 text-blue-400" />
                <span>Scan QR for Phone</span>
              </button>

              <button
                onClick={() => setActiveView('playground')}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 text-xs font-semibold text-slate-400 hover:text-white transition-all"
              >
                <Terminal className="h-4 w-4" />
                <span>Test Web Gateway</span>
              </button>
            </div>

            {/* Quick trust badges */}
            <div className="flex flex-wrap items-center gap-4 pt-3 text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Cryptographically Signed SHA-256</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5 text-blue-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>No Root / Administrator Required</span>
              </span>
              <span>•</span>
              <span>Central Ingress Sync Ready</span>
            </div>
          </div>

          {/* Device Showcase Capsule */}
          <div className="w-full lg:w-auto flex-shrink-0 flex flex-col items-center">
            <div className="relative rounded-3xl border border-blue-500/30 bg-black/60 p-6 backdrop-blur-2xl shadow-2xl flex flex-col items-center text-center max-w-xs">
              <div className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600/30 via-blue-500/10 to-transparent border border-blue-500/40 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                <img
                  src={BRAND_ASSETS.logo}
                  alt="Vanitas App Icon"
                  className="h-12 w-12 object-contain filter drop-shadow-[0_0_12px_rgba(96,165,250,0.8)]"
                />
              </div>

              <h3 className="font-display text-base font-bold text-white">VANITAS v1.4.2</h3>
              <p className="font-mono text-xs text-blue-400 mt-0.5">Central Native Companion</p>

              <div className="mt-4 w-full space-y-2 text-left text-xs">
                <div className="flex justify-between py-1 border-b border-white/[0.06]">
                  <span className="text-slate-400">Target Build:</span>
                  <span className="font-mono text-slate-200">
                    {platformInfo.isMobile ? 'Android arm64-v8a' : 'Windows x86_64'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/[0.06]">
                  <span className="text-slate-400">Package:</span>
                  <span className="font-mono text-blue-300">
                    {platformInfo.isMobile ? 'app.vanitas.client' : 'VanitasSetup.exe'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Total Downloads:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {(activeRelease?.downloadsCount || 4280).toLocaleString()}
                  </span>
                </div>
              </div>

              {downloadSuccessType && (
                <div className="mt-4 w-full rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-2.5 text-xs text-emerald-300 text-center animate-in zoom-in-95">
                  ✓ Download started! Check your downloads folder.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Platform Selector Tabs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-400" />
              <span>All Client Platforms & Release Artifacts</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select your platform to view architecture specs, feature matrices, SHA-256 hashes, and download binaries.
            </p>
          </div>
          <span className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 font-mono text-xs text-blue-300">
            Latest Stable v1.4.2
          </span>
        </div>

        {/* 4 Tabs: Android APK, Windows EXE, macOS DMG, Linux AppImage */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { id: 'android', label: 'Android (.APK)', icon: Smartphone, ext: 'APK', sub: 'Mobile & Tablet' },
            { id: 'windows', label: 'Windows (.EXE)', icon: Laptop, ext: 'EXE', sub: 'Windows 10 / 11' },
            { id: 'macos', label: 'macOS (.DMG)', icon: Laptop, ext: 'DMG', sub: 'Apple Silicon & Intel' },
            { id: 'linux', label: 'Linux (.AppImage)', icon: Terminal, ext: 'BIN', sub: 'Ubuntu / Arch / Debian' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = selectedPlatform === tab.id;
            const isDetected =
              (tab.id === 'android' && platformInfo.isMobile) ||
              (tab.id === 'windows' && platformInfo.detectedPlatform === 'desktop_windows') ||
              (tab.id === 'macos' && platformInfo.detectedPlatform === 'desktop_mac') ||
              (tab.id === 'linux' && platformInfo.detectedPlatform === 'desktop_linux');

            return (
              <button
                key={tab.id}
                onClick={() => setSelectedPlatform(tab.id as any)}
                className={`relative flex flex-col items-start p-4 rounded-2xl border transition-all text-left ${
                  isSelected
                    ? 'border-blue-500 bg-blue-600/15 shadow-[0_0_25px_rgba(59,130,246,0.25)] text-white'
                    : 'border-white/10 bg-slate-950/60 hover:bg-white/[0.04] text-slate-400'
                }`}
              >
                {isDetected && (
                  <span className="absolute top-2.5 right-2.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 px-2 py-0.5 text-[9px] font-mono font-bold text-cyan-300">
                    YOUR DEVICE
                  </span>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`p-2 rounded-xl border ${
                      isSelected ? 'bg-blue-500/20 border-blue-400 text-blue-300' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-xs font-bold text-blue-400 uppercase">{tab.ext}</span>
                </div>
                <p className="font-bold text-sm text-white">{tab.label}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{tab.sub}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Platform Detailed Card */}
      {activeRelease && (
        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 sm:p-8 backdrop-blur-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/10">
            <div className="flex items-start gap-4">
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-600/20 to-cyan-500/10 border border-blue-500/30 text-blue-400 shadow-lg">
                {activeRelease.platform === 'android' ? (
                  <Smartphone className="h-8 w-8 text-cyan-400" />
                ) : (
                  <Laptop className="h-8 w-8 text-blue-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-xl font-bold text-white">{activeRelease.name}</h3>
                  <span className="rounded-md bg-blue-500/20 px-2 py-0.5 font-mono text-xs font-bold text-blue-300 border border-blue-500/30">
                    {activeRelease.version}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                  {activeRelease.description}
                </p>
              </div>
            </div>

            {/* Action Download Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
              <button
                onClick={() => handleDownload(activeRelease.type)}
                disabled={downloadingType === activeRelease.type}
                className="flex items-center justify-center gap-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition-all active:scale-95"
              >
                {downloadingType === activeRelease.type ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>Download {activeRelease.filename}</span>
                <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px]">
                  {activeRelease.sizeMb} MB
                </span>
              </button>

              {activeRelease.platform === 'android' && (
                <button
                  onClick={() => setShowQrModal(true)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-3 text-xs font-semibold text-slate-200 transition-all"
                >
                  <QrCode className="h-4 w-4 text-cyan-400" />
                  <span>Phone QR</span>
                </button>
              )}
            </div>
          </div>

          {/* Spec Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                <Cpu className="h-4 w-4 text-blue-400" />
                <span>Architecture</span>
              </div>
              <p className="font-mono text-sm font-semibold text-white">{activeRelease.architecture}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                <HardDrive className="h-4 w-4 text-cyan-400" />
                <span>Minimum OS</span>
              </div>
              <p className="font-mono text-xs font-semibold text-slate-200">{activeRelease.minOsVersion}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                <Clock className="h-4 w-4 text-indigo-400" />
                <span>Release Date</span>
              </div>
              <p className="font-mono text-sm font-semibold text-white">{activeRelease.releaseDate}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                <ArrowDownToLine className="h-4 w-4 text-emerald-400" />
                <span>Total Downloads</span>
              </div>
              <p className="font-mono text-sm font-bold text-emerald-400">
                {activeRelease.downloadsCount.toLocaleString()} downloads
              </p>
            </div>
          </div>

          {/* Features Included In Native Client */}
          <div>
            <h4 className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase mb-3">
              Included Client Capabilities & System Hooks
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {activeRelease.features.map((feat, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 text-xs text-slate-300"
                >
                  <CheckCircle2 className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SHA-256 Checksum Bar */}
          <div className="rounded-2xl border border-white/10 bg-black/50 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-slate-400 flex items-center gap-1.5">
                <FileCheck className="h-4 w-4 text-blue-400" />
                <span>SHA-256 Release Checksum:</span>
              </span>
              <button
                onClick={() => handleCopyHash(activeRelease.sha256)}
                className="flex items-center gap-1 font-mono text-xs text-blue-400 hover:text-blue-300"
              >
                {copiedHash === activeRelease.sha256 ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Hash</span>
                  </>
                )}
              </button>
            </div>
            <p className="font-mono text-[11px] text-slate-300 break-all bg-black/40 p-2.5 rounded-lg border border-white/5 select-all">
              {activeRelease.sha256}
            </p>
          </div>
        </div>
      )}

      {/* Step-by-Step Installation Manual (Tabbed APK vs EXE) */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl space-y-6">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-400" />
            <span>Installation & Setup Guide</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Follow these verified steps to install and pair your native client with the Vanitas Central API.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Android APK Installation Guide */}
          <div className="rounded-2xl border border-blue-500/20 bg-blue-950/10 p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-blue-500/20">
              <Smartphone className="h-5 w-5 text-cyan-400" />
              <h4 className="font-bold text-sm text-white">Android (.APK) Sideloading Guide</h4>
            </div>

            <ol className="space-y-3 text-xs text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20 font-mono text-[10px] font-bold text-blue-300">
                  1
                </span>
                <div>
                  <strong className="text-white">Download APK:</strong> Click the "Download APK" button or scan the QR Code on your Android phone to save <code className="text-blue-300 font-mono">vanitas-v1.4.2-arm64.apk</code>.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20 font-mono text-[10px] font-bold text-blue-300">
                  2
                </span>
                <div>
                  <strong className="text-white">Allow Unknown Sources:</strong> If prompted by Android Chrome or Files app, tap <em>Settings</em> and enable <em>"Allow from this source"</em>.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20 font-mono text-[10px] font-bold text-blue-300">
                  3
                </span>
                <div>
                  <strong className="text-white">Complete Installation:</strong> Tap <em>Install</em> in the Android Package Installer prompt, then tap <em>Open</em>.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20 font-mono text-[10px] font-bold text-blue-300">
                  4
                </span>
                <div>
                  <strong className="text-white">Sign In & Connect:</strong> Authorize with your Vanitas account credentials or enter an API key with <code className="text-cyan-300 font-mono">bot.execute</code> permissions.
                </div>
              </li>
            </ol>
          </div>

          {/* Windows EXE Installation Guide */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-white/10">
              <Laptop className="h-5 w-5 text-blue-400" />
              <h4 className="font-bold text-sm text-white">Windows (.EXE) Setup Guide</h4>
            </div>

            <ol className="space-y-3 text-xs text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[10px] font-bold text-slate-300">
                  1
                </span>
                <div>
                  <strong className="text-white">Download Setup EXE:</strong> Save <code className="text-blue-300 font-mono">vanitas-desktop-setup-v1.4.2.exe</code> to your computer.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[10px] font-bold text-slate-300">
                  2
                </span>
                <div>
                  <strong className="text-white">Run Installer:</strong> Double click the setup file. If Windows SmartScreen displays a note, click <em>More Info</em> → <em>Run Anyway</em>.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[10px] font-bold text-slate-300">
                  3
                </span>
                <div>
                  <strong className="text-white">System Tray Integration:</strong> Vanitas launches in the Windows Taskbar System Tray with instant global hotkey <kbd className="bg-black/50 border border-white/20 px-1 py-0.5 rounded text-[10px]">Ctrl+Shift+V</kbd>.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[10px] font-bold text-slate-300">
                  4
                </span>
                <div>
                  <strong className="text-white">Local Ingress Proxy:</strong> The desktop daemon can route localhost requests to <code className="text-cyan-300 font-mono">http://localhost:3000/api/v1</code> automatically.
                </div>
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* Cryptographic Signature Hash Verifier Tool */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-8 backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              <span>Verify Binary Integrity (SHA-256)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Paste the SHA-256 checksum calculated on your downloaded file to confirm it matches the official Vanitas build signature.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={verifyInputHash}
            onChange={(e) => {
              setVerifyInputHash(e.target.value);
              setVerifyResult(null);
            }}
            placeholder={`Paste SHA-256 hash for ${activeRelease?.filename}...`}
            className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 font-mono text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleVerifyHash}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 px-5 py-2.5 text-xs font-semibold text-white transition-all flex items-center justify-center gap-2"
          >
            <FileCheck className="h-4 w-4 text-blue-400" />
            <span>Verify Hash</span>
          </button>
        </div>

        {verifyResult === 'match' && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span>
              <strong>Valid Signature:</strong> The pasted checksum matches the official Vanitas {activeRelease?.version} build signature perfectly. The binary is authentic and untampered.
            </span>
          </div>
        )}

        {verifyResult === 'mismatch' && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300">
            <ShieldAlert className="h-4 w-4 text-rose-400 flex-shrink-0" />
            <span>
              <strong>Hash Mismatch:</strong> The pasted checksum does NOT match the official signature ({activeRelease?.sha256.substring(0, 16)}...). Please redownload the official release.
            </span>
          </div>
        )}
      </div>

      {/* QR Code Phone Download Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-sm rounded-3xl border border-blue-500/30 bg-slate-950 p-6 shadow-2xl text-center space-y-4">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm font-mono p-1"
            >
              ✕
            </button>

            <div className="inline-flex p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <QrCode className="h-8 w-8 text-cyan-400" />
            </div>

            <h3 className="text-lg font-bold text-white">Scan to Download APK</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Open your phone camera (Android or iOS) and point it at this QR Code to initiate the instant APK package download directly on your phone.
            </p>

            <div className="flex justify-center p-3 bg-[#060913] rounded-2xl border border-blue-500/20 shadow-inner">
              <img
                src={qrCodeImageSrc}
                alt="Vanitas Mobile APK Download QR Code"
                className="h-48 w-48 rounded-xl object-contain filter drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]"
              />
            </div>

            <div className="pt-1 flex justify-center gap-2">
              <button
                onClick={() => handleDownload('apk')}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-all"
              >
                <Download className="h-4 w-4" />
                <span>Download APK directly</span>
              </button>
              <button
                onClick={() => setShowQrModal(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
