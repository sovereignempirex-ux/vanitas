import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Header } from './components/Header.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { InvitePage } from './pages/InvitePage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { VIEW_SEO, seoForAuthPage, seoForInvitePage, seoForLandingPage, setPageSeo } from './lib/seo.ts';

// Views
import { OverviewView } from './components/views/OverviewView.tsx';
import { ApiKeysView } from './components/views/ApiKeysView.tsx';
import { PlaygroundView } from './components/views/PlaygroundView.tsx';
import { DocsView } from './components/views/DocsView.tsx';
import { AdminCenterView } from './components/views/AdminCenterView.tsx';
import { AuditLogsView } from './components/views/AuditLogsView.tsx';
import { SecurityView } from './components/views/SecurityView.tsx';
import { AiAssistantView } from './components/views/AiAssistantView.tsx';
import { BotGatewayView } from './components/views/BotGatewayView.tsx';
import { WebhooksView } from './components/views/WebhooksView.tsx';
import { StatusView } from './components/views/StatusView.tsx';
import { ProfileView } from './components/views/ProfileView.tsx';
import { DownloadsView } from './components/views/DownloadsView.tsx';
import { SocialView } from './components/views/SocialView.tsx';
import { PublishView } from './components/views/PublishView.tsx';
import { OAuthAppsView } from './components/views/OAuthAppsView.tsx';
import { ServerOrdersView } from './components/views/ServerOrdersView.tsx';
import { OAuthConsentView } from './components/views/OAuthConsentView.tsx';

const AppContent: React.FC = () => {
  const { activeView, user, authLoading } = useAuth();
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Standalone shareable auth pages: /register and /login (no modal, no shell).
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const authPage: 'login' | 'register' | null = path === '/login' ? 'login' : path === '/register' ? 'register' : null;
  // Developer invite landing page: /invite/<token> (public, no shell).
  const inviteToken = path.startsWith('/invite/') ? path.slice('/invite/'.length) : null;
  // Public profile: /u/<username> (shareable @username page, no shell).
  const publicProfileName = path.startsWith('/u/') ? path.slice('/u/'.length) : null;
  // OAuth consent: /oauth/consent (third-party sign-in, no shell).
  const oauthConsent = path === '/oauth/consent';

  // Per-view SEO: keep title/description/canonical/OG in sync with what is on
  // screen (auth pages first, then the signed-in dashboard view).
  useEffect(() => {
    if (publicProfileName) {
      return; // ProfilePage owns its metadata (needs the fetched bio/name)
    }
    if (oauthConsent) {
      setPageSeo({
        title: 'Sign in with Vanitas',
        description:
          'Authorize a third-party application to sign you in with your Vanitas account.',
      });
      return;
    }
    if (inviteToken) {
      setPageSeo(seoForInvitePage());
      return;
    }
    if (authPage) {
      setPageSeo(seoForAuthPage(authPage));
      return;
    }
    if (authLoading) return;
    if (!user) {
      // Signed-out root = marketing landing; other auth paths = auth pages.
      setPageSeo(
        path === '/'
          ? seoForLandingPage()
          : seoForAuthPage(path === '/register' ? 'register' : 'login'),
      );
      return;
    }
    setPageSeo(VIEW_SEO[activeView] || VIEW_SEO.overview);
  }, [authPage, authLoading, user, activeView, path, inviteToken, publicProfileName]);

  const renderActiveView = () => {
    switch (activeView) {
      case 'overview':
        return <OverviewView />;
      case 'keys':
        return <ApiKeysView />;
      case 'playground':
        return <PlaygroundView />;
      case 'docs':
        return <DocsView />;
      case 'downloads':
        return <DownloadsView />;
      case 'admin-center':
      case 'admin-permissions':
      case 'admin-flags':
      case 'admin-emergency':
      case 'admin-moderation':
        return <AdminCenterView />;
      case 'admin-logs':
        return <AuditLogsView />;
      case 'security':
        return <SecurityView />;
      case 'ai':
        return <AiAssistantView />;
      case 'bot-gateway':
        return <BotGatewayView />;
      case 'webhooks':
        return <WebhooksView />;
      case 'status':
        return <StatusView />;
      case 'profile':
        return <ProfileView />;
      case 'social':
        return <SocialView />;
      case 'publish':
        return <PublishView />;
      case 'oauth-apps':
        return <OAuthAppsView />;
      case 'server-orders':
        return <ServerOrdersView />;
      default:
        return <OverviewView />;
    }
  };

  if (authPage) {
    return <AuthPage mode={authPage} />;
  }

  // Developer invite landing — standalone public page (like /register).
  if (inviteToken) {
    return <InvitePage token={inviteToken} />;
  }

  // Public profile — standalone page, no shell (like /invite/<token>).
  if (publicProfileName !== null) {
    return <ProfilePage username={publicProfileName} />;
  }

  // OAuth consent — standalone sign-in page for third-party
  // apps. Signed-out visitors land on the login page; after
  // signing in they return here (the `next` parameter in
  // the URL) to grant or deny consent.
  if (oauthConsent) {
    if (authLoading) {
      return (
        <div className="min-h-screen vnt-app-bg flex flex-col items-center justify-center gap-4 text-slate-300">
          <div className="h-10 w-10 rounded-2xl border-2 border-cyan-400/30 border-t-cyan-300 animate-spin" />
          <p className="font-mono text-xs tracking-widest text-cyan-300">VERIFYING SESSION…</p>
        </div>
      );
    }
    if (!user) return <AuthPage mode="login" />;
    return <OAuthConsentView />;
  }

  // REAL ACCOUNTS ONLY: the dashboard is gated behind server-verified auth.
  // Splash while /auth/me runs → sign-in/register page when signed out.
  if (authLoading) {
    return (
      <div className="min-h-screen vnt-app-bg flex flex-col items-center justify-center gap-4 text-slate-300">
        <div className="h-10 w-10 rounded-2xl border-2 border-cyan-400/30 border-t-cyan-300 animate-spin" />
        <p className="font-mono text-xs tracking-widest text-cyan-300">VERIFYING SESSION…</p>
      </div>
    );
  }

  if (!user) {
    // Signed-out visitors at "/" get the public homepage (features, security,
    // quick start) — auth stays one click away via /login and /register.
    if (path === '/') return <LandingPage />;
    return <AuthPage mode={path === '/register' ? 'register' : 'login'} />;
  }

  return (
    <div className="min-h-screen vnt-app-bg text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <Header
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onToggleSidebar={() => setIsSidebarMobileOpen((open) => !open)}
      />

      {/* Main Framework Body */}
      <div className="flex flex-1">
        {/* Navigation Sidebar */}
        <Sidebar
          isMobileOpen={isSidebarMobileOpen}
          setIsMobileOpen={setIsSidebarMobileOpen}
        />

        {/* Content View Container */}
        <main className="flex-1 lg:pl-64 flex flex-col min-w-0">
          <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto vnt-fade-up" key={activeView}>
            {renderActiveView()}
          </div>

          {/* Footer */}
          <footer className="border-t border-white/[0.06] bg-slate-950/60 backdrop-blur-xl py-4 px-6 text-center text-xs text-slate-500">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                <span className="font-display font-bold text-slate-300">VANITAS</span>
                <span>• Centralized API & Intelligence Platform</span>
              </div>
              <p className="font-mono text-[11px]">
                Active Ingress: <span className="text-blue-400">https://vanitas-bot.vercel.app/api/v1</span>
              </p>
            </div>
          </footer>
        </main>
      </div>

      {/* Global Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      {/* Authentication Modal */}
      <AuthModal />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
