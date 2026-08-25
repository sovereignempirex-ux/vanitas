import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { BRAND_ASSETS } from '../data/assets.ts';
import { detectUserPlatform } from '../lib/platformDetector.ts';
import {
  Shield,
  Search,
  Bell,
  Terminal,
  ChevronDown,
  LogOut,
  User,
  Key,
  Layers,
  Sparkles,
  Zap,
  Radio,
  ExternalLink,
  Laptop,
  Smartphone,
  Bot as BotIcon,
  Globe,
  Download,
} from 'lucide-react';

interface HeaderProps {
  onOpenCommandPalette: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenCommandPalette }) => {
  const { user, role, toggleRole, logout, setActiveView, isAuthModalOpen, setIsAuthModalOpen, clientSource, setClientSource } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);

  const notifications = [
    { id: 1, title: 'Key Rotated', time: '2m ago', text: 'Central Production Gateway secret was safely rotated.' },
    { id: 2, title: 'Bot Execution', time: '18m ago', text: 'Autonomous Discord Sentinel executed /vanitas status.' },
    { id: 3, title: 'Security Alert', time: '45m ago', text: 'Rate limit threshold reached for /api/v1/admin from external IP.' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#060913]/85 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        {/* Left: Brand Identity & Active Breadcrumb */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveView('overview')}
            className="flex items-center gap-3 group text-left focus:outline-none"
          >
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/30 via-blue-500/10 to-transparent border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.25)] group-hover:border-blue-400/50 transition-all">
              <img
                src={BRAND_ASSETS.logo}
                alt="Vanitas Logo"
                className="h-6 w-6 object-contain filter drop-shadow-[0_0_8px_rgba(96,165,250,0.6)]"
              />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-bold tracking-wider text-white">VANITAS</span>
                <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-blue-400 border border-blue-500/20">
                  v1.4 PROD
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">Centralized API & Security Engine</p>
            </div>
          </button>
        </div>

        {/* Middle: Command Palette Quick Search */}
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <button
            onClick={onOpenCommandPalette}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-sm text-slate-400 hover:border-blue-500/30 hover:bg-white/[0.05] transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <Search className="h-4 w-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
              <span className="text-xs text-slate-300">Search endpoints, keys, audit logs, commands...</span>
            </div>
            <kbd className="rounded border border-white/15 bg-black/40 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 group-hover:text-white">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right: Smart Download Client CTA, Source Switcher, Role Badge Switcher, Notifications, Profile */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Quick Smart Download Client Button */}
          {(() => {
            const detected = detectUserPlatform();
            return (
              <button
                onClick={() => setActiveView('downloads')}
                className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-600/20 hover:bg-blue-600/30 px-2.5 py-1.5 text-xs font-semibold text-blue-300 transition-all shadow-[0_0_12px_rgba(59,130,246,0.2)]"
                title={`Download Vanitas Client for ${detected.label} (${detected.recommendedType.toUpperCase()})`}
              >
                <Download className="h-3.5 w-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Get</span>
                <span className="font-mono text-[11px] uppercase tracking-wider text-cyan-300 font-bold">
                  {detected.isMobile ? 'APK (Android)' : 'EXE (Desktop)'}
                </span>
              </button>
            );
          })()}

          {/* Client Source Selector (Shows dynamic detection simulation) */}
          <div className="relative">
            <button
              onClick={() => setIsSourceMenuOpen(!isSourceMenuOpen)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-1.5 text-xs text-slate-300 hover:border-blue-500/30 transition-all"
              title="Current Client Source metadata injected into Central API requests"
            >
              {clientSource === 'WEB' && <Globe className="h-3.5 w-3.5 text-blue-400" />}
              {clientSource === 'BOT' && <BotIcon className="h-3.5 w-3.5 text-emerald-400" />}
              {clientSource === 'MOBILE' && <Smartphone className="h-3.5 w-3.5 text-purple-400" />}
              {clientSource === 'DESKTOP' && <Laptop className="h-3.5 w-3.5 text-cyan-400" />}
              <span className="font-mono text-[11px] uppercase tracking-wider">{clientSource}</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {isSourceMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-white/10 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-400">Client Ingress Source</div>
                {[
                  { id: 'WEB', label: 'Web Application', icon: Globe, color: 'text-blue-400' },
                  { id: 'BOT', label: 'Discord / WhatsApp Bot', icon: BotIcon, color: 'text-emerald-400' },
                  { id: 'MOBILE', label: 'iOS / Android Native', icon: Smartphone, color: 'text-purple-400' },
                  { id: 'DESKTOP', label: 'Desktop Agent', icon: Laptop, color: 'text-cyan-400' },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setClientSource(item.id as any);
                        setIsSourceMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors ${
                        clientSource === item.id ? 'bg-blue-600/20 text-blue-300 font-medium' : 'text-slate-300 hover:bg-white/[0.05]'
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick RBAC Role Switcher with Server-Side Guard Trigger */}
          <button
            onClick={toggleRole}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold tracking-wider transition-all border ${
              role === 'ADMIN'
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                : 'bg-blue-500/10 text-blue-300 border-blue-500/30 hover:bg-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
            }`}
            title="Toggle RBAC context between USER and ADMIN to test server-side authorization guards"
          >
            <Shield className="h-3.5 w-3.5" />
            <span className="font-mono">{role}</span>
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="relative rounded-lg border border-white/10 bg-slate-900/60 p-2 text-slate-300 hover:bg-white/[0.05] hover:text-white transition-all"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-slate-950"></span>
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl z-50">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 px-1">
                  <span className="text-xs font-semibold text-white">System Notifications</span>
                  <span className="text-[10px] text-blue-400">3 new</span>
                </div>
                <div className="divide-y divide-white/5 mt-1">
                  {notifications.map((n) => (
                    <div key={n.id} className="py-2.5 px-1.5 hover:bg-white/[0.03] rounded-lg transition-colors">
                      <div className="flex justify-between items-center text-xs font-medium text-slate-200">
                        <span>{n.title}</span>
                        <span className="text-[10px] text-slate-500">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{n.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Avatar / Sign In */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-1 pr-2 hover:border-blue-500/30 transition-all"
              >
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="h-7 w-7 rounded-lg object-cover border border-blue-500/30"
                />
                <span className="text-xs font-medium text-slate-200 hidden sm:inline-block max-w-[100px] truncate">
                  {user.name.split(' ')[0]}
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl z-50">
                  <div className="px-3 py-2 border-b border-white/10">
                    <p className="text-xs font-semibold text-white truncate">{user.name}</p>
                    <p className="text-[11px] font-mono text-slate-400 truncate">{user.email}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      <span className="text-[10px] font-medium text-emerald-400">2FA Active</span>
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setActiveView('profile');
                        setIsProfileMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                    >
                      <User className="h-3.5 w-3.5 text-blue-400" />
                      <span>Account Profile</span>
                    </button>
                    <button
                      onClick={() => {
                        setActiveView('keys');
                        setIsProfileMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                    >
                      <Key className="h-3.5 w-3.5 text-blue-400" />
                      <span>API Keys & Scopes</span>
                    </button>
                    <button
                      onClick={() => {
                        setActiveView('security');
                        setIsProfileMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                    >
                      <Shield className="h-3.5 w-3.5 text-blue-400" />
                      <span>Security & Sessions</span>
                    </button>
                  </div>

                  <div className="pt-1 border-t border-white/10">
                    <button
                      onClick={() => {
                        logout();
                        setIsProfileMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all"
            >
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
