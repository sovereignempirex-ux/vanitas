import React from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  LayoutDashboard,
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
  MessageSquare,
  ChevronRight,
  Radio,
  Globe,
  Download,
  MessagesSquare,
  Rocket,
} from 'lucide-react';

interface SidebarProps {
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, setIsMobileOpen }) => {
  const { activeView, setActiveView, role } = useAuth();

  const navSections = [
    {
      title: 'PLATFORM',
      items: [
        { id: 'overview', label: 'Architecture & Stats', icon: LayoutDashboard, badge: null },
        { id: 'keys', label: 'API Keys & Scopes', icon: Key, badge: 'Live' },
        { id: 'playground', label: 'API Playground', icon: Terminal, badge: null },
        { id: 'docs', label: 'Developer Portal', icon: FileCode2, badge: null },
        { id: 'status', label: 'Public Status', icon: Activity, badge: 'Live' },
      ],
    },
    {
      title: 'INTELLIGENCE',
      items: [
        { id: 'ai', label: 'Vanitas AI Copilot', icon: Sparkles, badge: 'FREE AI', highlight: true },
      ],
    },
    {
      title: 'ECOSYSTEM & DOWNLOADS',
      items: [
        { id: 'downloads', label: 'Download Clients', icon: Download, badge: 'MANIFEST', highlight: true },
        { id: 'bot-gateway', label: 'Bot Gateway', icon: Bot, badge: '3 Online' },
        { id: 'webhooks', label: 'Webhooks Ingress', icon: Webhook, badge: null },
      ],
    },
    {
      title: 'ACCOUNT & SECURITY',
      items: [
        { id: 'profile', label: 'Identity & Avatars', icon: User, badge: null },
        { id: 'social', label: 'Accounts & Messages', icon: MessagesSquare, badge: null },
        { id: 'publish', label: 'Publish & Sandbox', icon: Rocket, badge: 'GitHub' },
        { id: 'security', label: 'Security Center & 2FA', icon: Shield, badge: 'Hardened' },
      ],
    },
  ];

  const adminSection = {
    title: 'ADMIN CONTROL CENTER',
    items: [
      { id: 'admin-center', label: 'Overview & Users', icon: Users, badge: 'RBAC' },
      { id: 'admin-moderation', label: 'Moderation & Suggestions', icon: MessageSquare, badge: 'Live' },
      { id: 'admin-logs', label: 'Audit Logs & CSV', icon: ScrollText, badge: null },
      { id: 'admin-permissions', label: 'Permissions Matrix', icon: Lock, badge: null },
      { id: 'admin-flags', label: 'Feature Flags', icon: Sliders, badge: null },
      { id: 'admin-emergency', label: 'Emergency Controls', icon: AlertOctagon, badge: 'Critical' },
    ],
  };

  const handleSelect = (viewId: string) => {
    setActiveView(viewId);
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed top-16 bottom-0 left-0 z-40 w-64 border-r border-white/[0.08] bg-[#05070e]/90 backdrop-blur-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:translate-x-0 overflow-y-auto ${
          isMobileOpen ? 'translate-x-0 shadow-[24px_0_48px_-24px_rgba(0,0,0,0.8)]' : '-translate-x-full'
        }`}
        // Real image background — the workspace photo the overview hero uses,
        // under a dark gradient so every label keeps its contrast (the flat
        // #05070e colour stays as the fallback while the image loads).
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(5,7,14,0.74) 0%, rgba(4,7,16,0.86) 45%, rgba(3,5,12,0.95) 100%), url('/images/overview-hero.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="p-3 space-y-6">
          {navSections.map((section) => (
            <div key={section.title}>
              <p className="px-3 text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase">
                {section.title}
              </p>
              <div className="mt-1.5 space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item.id)}
                      className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-600/25 to-cyan-500/15 text-blue-200 border border-blue-400/40 shadow-[0_8px_24px_-12px_rgba(59,130,246,0.6)] font-semibold'
                          : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100 border border-transparent hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`h-4 w-4 transition-colors ${
                            isActive
                              ? 'text-blue-400'
                              : item.highlight
                              ? 'text-cyan-400 group-hover:text-cyan-300'
                              : 'text-slate-500 group-hover:text-slate-300'
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-mono uppercase font-semibold ${
                            isActive
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-white/[0.06] text-slate-400 group-hover:text-slate-300'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Admin Control Center Section */}
          <div className="pt-2 border-t border-white/[0.08]">
            <div className="flex items-center justify-between px-3">
              <p className="text-[10px] font-mono font-bold tracking-widest text-amber-400/90 uppercase flex items-center gap-1.5">
                <Shield className="h-3 w-3 text-amber-400" />
                {adminSection.title}
              </p>
              {role !== 'ADMIN' && (
                <span className="text-[9px] font-mono text-slate-500">403 LOCKED</span>
              )}
            </div>

            <div className="mt-1.5 space-y-0.5">
              {adminSection.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                const isForbidden = role !== 'ADMIN';

                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)] font-semibold'
                        : isForbidden
                        ? 'text-slate-600 hover:bg-rose-500/5 hover:text-slate-500 border border-transparent'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`h-4 w-4 transition-colors ${
                          isActive
                            ? 'text-amber-400'
                            : isForbidden
                            ? 'text-slate-700'
                            : 'text-amber-400/70 group-hover:text-amber-300'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>
                    {isForbidden ? (
                      <Lock className="h-3 w-3 text-slate-600" />
                    ) : item.badge ? (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-mono uppercase font-semibold text-amber-400">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick System Health Beacon */}
          <div className="vnt-surface rounded-2xl p-3.5 shadow-[0_16px_40px_-24px_rgba(59,130,246,0.5)]">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
              <span className="flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
                Central Gateway
              </span>
              <span className="vnt-chip rounded-full px-2 py-0.5 text-[10px] font-mono text-emerald-300">ONLINE</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              Serving Web, Discord, WhatsApp & Mobile native clients.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};
