import crypto from 'crypto';
import type { Request } from 'express';

// ---------------------------------------------------------------------------
// Real OAuth 2.0 (authorization-code flow) for Discord, Google and GitHub.
//
// Each provider is activated simply by adding its credentials to the
// environment (Vercel → Project Settings → Environment Variables):
//   <PROVIDER>_CLIENT_ID / <PROVIDER>_CLIENT_SECRET
//
// The `state` parameter is an HMAC signed with the provider's client_secret,
// so verification works across serverless instances WITHOUT shared storage
// and without any extra secret env var. States expire after 10 minutes.
//
// Optional *_AUTHORIZE_URL / *_TOKEN_URL / *_PROFILE_URL overrides exist only
// for testing against a mock provider — never set them in production.
// ---------------------------------------------------------------------------

export const OAUTH_PROVIDERS = ['discord', 'google', 'github'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

interface ProviderDefaults {
  authorizeUrl: string;
  tokenUrl: string;
  profileUrl: string;
  scope: string;
  /** Discord requires `scope` again on the token exchange; Google rejects undocumented params. */
  scopeInTokenRequest: boolean;
}

const DEFAULTS: Record<OAuthProvider, ProviderDefaults> = {
  discord: {
    authorizeUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    profileUrl: 'https://discord.com/api/users/@me',
    scope: 'identify email',
    scopeInTokenRequest: true,
  },
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    scopeInTokenRequest: false,
  },
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    profileUrl: 'https://api.github.com/user',
    scope: 'read:user user:email',
    scopeInTokenRequest: true,
  },
};

export interface OAuthConfig extends ProviderDefaults {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
}

function env(name: string): string {
  return (process.env[name] || '').trim();
}

export function getProviderConfig(provider: OAuthProvider): OAuthConfig | null {
  const prefix = provider.toUpperCase();
  const clientId = env(`${prefix}_CLIENT_ID`);
  const clientSecret = env(`${prefix}_CLIENT_SECRET`);
  if (!clientId || !clientSecret) return null;
  const d = DEFAULTS[provider];
  return {
    provider,
    clientId,
    clientSecret,
    authorizeUrl: env(`${prefix}_AUTHORIZE_URL`) || d.authorizeUrl,
    tokenUrl: env(`${prefix}_TOKEN_URL`) || d.tokenUrl,
    profileUrl: env(`${prefix}_PROFILE_URL`) || d.profileUrl,
    scope: d.scope,
    scopeInTokenRequest: d.scopeInTokenRequest,
  };
}

/** { discord: true, google: false, github: true } — drives the UI buttons. */
export function listConfiguredProviders(): Record<OAuthProvider, boolean> {
  const out = {} as Record<OAuthProvider, boolean>;
  for (const p of OAUTH_PROVIDERS) out[p] = getProviderConfig(p) !== null;
  return out;
}

// ---------------------------------------------------------------------------
// Signed state (CSRF protection) — HMAC-SHA256 keyed on the client_secret
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 10 * 60 * 1000;

export function signState(provider: OAuthProvider, clientSecret: string): string {
  const payload = `${provider}.${Date.now() + STATE_TTL_MS}`;
  const sig = crypto.createHmac('sha256', clientSecret).update(payload).digest('base64url');
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sig}`;
}

export function verifyState(provider: OAuthProvider, clientSecret: string, state: string): boolean {
  if (typeof state !== 'string' || state.length < 8 || state.length > 512) return false;
  const [p64, sig] = state.split('.');
  if (!p64 || !sig) return false;
  const payload = Buffer.from(p64, 'base64url').toString('utf8');
  const expected = crypto.createHmac('sha256', clientSecret).update(payload).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const [p, expStr] = payload.split('.');
  const exp = Number(expStr);
  return p === provider && Number.isFinite(exp) && exp > Date.now();
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/**
 * Base URL of the web app for post-callback redirects.
 * FRONTEND_URL wins; otherwise derived from the request (same-origin deploy).
 */
export function appBaseUrl(req: Request): string {
  const configured = (process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  if (configured) {
    try {
      const u = new URL(configured);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin;
    } catch {
      // fall through to request-derived value
    }
  }
  const host = String(req.headers.host || '');
  if (!/^[a-z0-9.:\-_[\]]+$/i.test(host)) return 'http://localhost:3000';
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwarded === 'https' || process.env.VERCEL ? 'https' : 'http';
  return `${proto}://${host}`;
}

export function callbackUrl(req: Request, provider: OAuthProvider): string {
  // NOTE: intentionally NOT under /auth/oauth — Vercel's edge routes any
  // "/oauth/<seg>" GET to index.html before the lambda sees it (observed on
  // production). "/social/..." reaches the function reliably.
  return `${appBaseUrl(req)}/api/v1/social/${provider}/callback`;
}

export function buildAuthorizeUrl(cfg: OAuthConfig, state: string, redirectUri: string): string {
  const u = new URL(cfg.authorizeUrl);
  if (cfg.provider === 'github') {
    // GitHub uses `scope` as its only access marker and ignores response_type.
    u.searchParams.set('client_id', cfg.clientId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('scope', cfg.scope);
    u.searchParams.set('state', state);
  } else {
    u.searchParams.set('client_id', cfg.clientId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', cfg.scope);
    u.searchParams.set('state', state);
    if (cfg.provider === 'google') u.searchParams.set('prompt', 'select_account');
  }
  return u.toString();
}

// ---------------------------------------------------------------------------
// Code → token → profile
// ---------------------------------------------------------------------------

async function toRecord(res: Response): Promise<Record<string, string>> {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json && typeof json === 'object') return json as Record<string, string>;
  } catch {
    // providers may answer form-encoded
  }
  return Object.fromEntries(new URLSearchParams(text));
}

export async function exchangeCode(cfg: OAuthConfig, code: string, redirectUri: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  if (cfg.scopeInTokenRequest) body.set('scope', cfg.scope);

  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body,
  });
  const data = await toRecord(res);
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(`token exchange failed (${res.status}): ${String(data.error || 'missing access_token')}`);
  }
  return data.access_token;
}

export interface OAuthProfile {
  providerId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string;
}

async function fetchJson(url: string, accessToken: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': 'Vanitas-Auth',
    },
  });
  if (!res.ok) throw new Error(`profile fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchProfile(cfg: OAuthConfig, accessToken: string): Promise<OAuthProfile> {
  const data = await fetchJson(cfg.profileUrl, accessToken);
  if (cfg.provider === 'discord') {
    return {
      providerId: String(data.id || ''),
      email: String(data.email || ''),
      emailVerified: !!data.verified,
      name: String(data.global_name || data.username || 'Discord User'),
      avatarUrl: data.avatar
        ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png?size=256`
        : `https://cdn.discordapp.com/embed/avatars/${Number(data.discriminator || 0) % 5}.png`,
    };
  }
  if (cfg.provider === 'google') {
    return {
      providerId: String(data.sub || ''),
      email: String(data.email || ''),
      emailVerified: !!(data.verified_email ?? data.email_verified),
      name: String(data.name || data.given_name || 'Google User'),
      avatarUrl: String(data.picture || ''),
    };
  }

  // GitHub — /user often has a null email; ask /user/emails for a verified one.
  let email = String(data.email || '');
  let emailVerified = false;
  try {
    const emails = await fetchJson('https://api.github.com/user/emails', accessToken);
    if (Array.isArray(emails)) {
      const entry = emails.find((e: any) => e.primary && e.verified) || emails.find((e: any) => e.verified);
      if (entry?.email) {
        email = String(entry.email);
        emailVerified = !!entry.verified;
      }
    }
  } catch {
    // scope denied or endpoint unavailable — fall back below
  }
  return {
    providerId: String(data.id || ''),
    email,
    emailVerified,
    name: String(data.name || data.login || 'GitHub User'),
    avatarUrl: String(data.avatar_url || ''),
  };
}
