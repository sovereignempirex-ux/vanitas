// ---------------------------------------------------------------------------
// SPA SEO — keeps <title>, meta description, canonical and the Open Graph /
// Twitter tags in sync with the currently visible view, so every client-side
// state carries accurate metadata for crawlers and social previews. The static
// tags live in index.html; this module only updates them at runtime.
// ---------------------------------------------------------------------------

import { stripMarkdown } from './markdown.ts';

const SITE_URL = 'https://vanitas-bot.vercel.app';

export interface SeoEntry {
  title: string;
  description: string;
}

/** Real, per-view metadata for the dashboard shell. */
export const VIEW_SEO: Record<string, SeoEntry> = {
  overview: {
    title: 'Developer Overview',
    description:
      'Live platform statistics, free cloud database connections, real YouTube tutorials and quick access to the Vanitas API gateway.',
  },
  keys: {
    title: 'API Keys',
    description:
      'Create, rotate, revoke and scope API keys with server-side enforced permissions, per-key rate limits and burst controls.',
  },
  playground: {
    title: 'API Playground',
    description:
      'Test Vanitas REST endpoints live with your own API keys and inspect responses, latency and audit entries.',
  },
  docs: {
    title: 'Documentation',
    description:
      'Guides for authentication, scopes, endpoints, webhooks, bot gateway, error codes and SDK integration with Vanitas.',
  },
  downloads: {
    title: 'Downloads',
    description:
      'Download the latest Vanitas client builds for Android APK, Windows EXE, macOS DMG and Linux AppImage.',
  },
  'admin-center': {
    title: 'Admin Center',
    description:
      'Manage users, roles, feature flags and emergency controls for the Vanitas platform (administrators only).',
  },
  'admin-permissions': {
    title: 'Role Permissions',
    description: 'Inspect and adjust the role permission matrix across USER, MODERATOR and ADMIN on Vanitas.',
  },
  'admin-flags': {
    title: 'Feature Flags',
    description: 'Toggle platform feature flags in real time across the Vanitas gateway (administrators only).',
  },
  'admin-emergency': {
    title: 'Emergency Controls',
    description: 'Maintenance mode and emergency controls for the Vanitas platform (administrators only).',
  },
  'admin-moderation': {
    title: 'Moderation & Suggestions',
    description:
      'Review every user comment across the docs and triage product suggestions on Vanitas (administrators only).',
  },
  'admin-logs': {
    title: 'Audit Logs',
    description: 'Search and export the immutable audit trail of authentication, key and gateway events on Vanitas.',
  },
  'oauth-apps': {
    title: 'OAuth Apps',
    description:
      'Register third-party applications, issue client credentials and review every app authorized to sign in with your Vanitas account.',
  },
  'server-orders': {
    title: 'Server Requests',
    description:
      'Review incoming server hosting requests, move them through pending → approved → delivered, and publish the plan catalog served by the embeddable widget.',
  },
  security: {
    title: 'Security Center',
    description:
      'Review active sessions, two-factor authentication status and detected security threats on your Vanitas account.',
  },
  ai: {
    title: 'AI Copilot',
    description:
      'Chat with the integrated Vanitas AI copilot: streaming replies, code diagnosis, Arabic support and site-aware guidance.',
  },
  'bot-gateway': {
    title: 'Bot Gateway',
    description:
      'Dispatch WhatsApp, Discord and Telegram commands through the Vanitas bot gateway with scoped keys and audit logging.',
  },
  webhooks: {
    title: 'Webhooks',
    description: 'Create webhook endpoints, sign payloads and inspect real-time delivery logs for Vanitas events.',
  },
  status: {
    title: 'System Status',
    description: 'Live health, latency and uptime metrics for the Vanitas API gateway, database and authentication services.',
  },
  profile: {
    title: 'Profile',
    description: 'Manage your display name, avatar, active sessions and two-factor authentication for your Vanitas account.',
  },
  welcome: {
    title: 'Developer Overview',
    description:
      'Live platform statistics, free cloud database connections, real YouTube tutorials and quick access to the Vanitas API gateway.',
  },
};

/** Metadata for the public landing page at "/" (signed-out visitors). */
export function seoForLandingPage(): SeoEntry {
  return {
    // setPageSeo appends the "| Vanitas" suffix.
    title: 'منصة المطورين والذكاء الاصطناعي',
    description:
      'فانيتاس منصة مطورين تجمع واجهات API والمفاتيح بصلاحيات محددة والأمان والذكاء الاصطناعي في مكان واحد، وتشتغل على الويب والأندرويد وiPhone وسطح المكتب.',
  };
}

/** Metadata for the standalone /login and /register pages. */
export function seoForAuthPage(mode: 'login' | 'register'): SeoEntry {
  return mode === 'register'
    ? {
        title: 'Create your Vanitas account',
        description:
          'Create a free Vanitas account in seconds — scoped API keys, audit logs, webhooks, bot gateway and AI copilot included. Google, Discord and GitHub sign-in supported.',
      }
    : {
        title: 'Sign in to Vanitas',
        description:
          'Sign in to Vanitas with email and password, or continue with Google, Discord and GitHub. Optional two-factor authentication supported.',
      };
}

/** Metadata for the standalone /invite/<token> developer invite page. */
export function seoForInvitePage(): SeoEntry {
  return {
    title: 'Developer invite',
    description:
      'You have been invited to Vanitas — create your account through this private link to receive the invited role and verification badge.',
  };
}

/** Metadata for a public /u/<username> profile page (safe to index). */
export function seoForPublicProfile(username: string, bio?: string): SeoEntry {
  // Bios are Markdown — flatten to plain text so markers ("**", "```") never
  // leak into the meta description crawlers read.
  const plainBio = bio ? stripMarkdown(bio).slice(0, 140) : '';
  return {
    title: `@${username} — developer profile`,
    description: plainBio
      ? `${plainBio} — public developer profile of @${username} on Vanitas.`
      : `Public developer profile of @${username} on Vanitas — roles, verification and account facts.`,
  };
}

function setMeta(kind: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${kind}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(kind, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/** Apply a page's title/description across title, description, OG, Twitter and canonical. */
export function setPageSeo({ title, description }: SeoEntry) {
  const fullTitle = `${title} | Vanitas`;
  // Invite links carry a LIVE credential in their path. They must never be
  // published as canonical/og:url — that would leak the token into crawler
  // logs, caches and social unfurls. Metadata points at the generic landing.
  const secretPath = window.location.pathname.startsWith('/invite/');
  const url = `${SITE_URL}${secretPath ? '/register' : window.location.pathname === '/' ? '/' : window.location.pathname}`;

  document.title = fullTitle;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', fullTitle);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', url);
  setMeta('name', 'twitter:title', fullTitle);
  setMeta('name', 'twitter:description', description);
  setCanonical(url);
}
