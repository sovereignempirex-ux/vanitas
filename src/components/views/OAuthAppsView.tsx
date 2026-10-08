import React, { useState, useEffect } from 'react';
import { api } from '../../lib/apiClient.ts';
import { OAuthApp, OAuthGrant } from '../../types.ts';
import { OAUTH_SCOPE_META, scopeMeta } from '../../lib/oauthScopes.ts';
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  Globe,
  RefreshCw,
  AlertTriangle,
  Eye,
  X,
  ExternalLink,
  FileCode2,
  Link2,
  Unlink,
} from 'lucide-react';

/** Build the authorize URL a third-party app sends its users to. */
export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state?: string;
  scopes?: string[];
  codeChallenge?: string;
  codeChallengeMethod?: 'plain' | 's256';
}): string {
  const u = new URL(`${window.location.origin}/oauth/consent`);
  u.searchParams.set('client_id', params.clientId);
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('response_type', 'code');
  if (params.state) u.searchParams.set('state', params.state);
  if (params.scopes?.length) u.searchParams.set('scope', params.scopes.join(' '));
  if (params.codeChallenge) {
    u.searchParams.set('code_challenge', params.codeChallenge);
    u.searchParams.set('code_challenge_method', params.codeChallengeMethod || 'plain');
  }
  return u.toString();
}

type AppType = 'confidential' | 'public';

const APP_TYPES: Record<AppType, { label: string; blurb: string }> = {
  confidential: {
    label: 'Confidential (server)',
    blurb: 'Your backend can keep a secret. The client secret is issued once and required on every token exchange.',
  },
  public: {
    label: 'Public (SPA / mobile)',
    blurb: 'No secret is ever minted — the app ships in the open, so PKCE (code_challenge) becomes mandatory.',
  },
};

export const OAuthAppsView: React.FC = () => {
  const [apps, setApps] = useState<OAuthApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Authorized-apps review (grants this account made to OTHER apps)
  const [grants, setGrants] = useState<OAuthGrant[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  // New-app form
  const [name, setName] = useState('');
  const [appType, setAppType] = useState<AppType>('confidential');
  const [redirectUrisText, setRedirectUrisText] = useState('');
  const [scopes, setScopes] = useState<string[]>(['profile']);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reveal-once secret block (confidential apps only)
  const [revealed, setRevealed] = useState<{ app: OAuthApp; secret: string | null; note: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listOAuthApps();
      setApps(data.apps);
    } catch (err: any) {
      setError(err?.message || 'Could not load your apps');
    } finally {
      setLoading(false);
    }
  };

  const loadGrants = async () => {
    setGrantsLoading(true);
    try {
      const data = await api.listOAuthGrants();
      setGrants(data.grants);
    } catch {
      // Non-fatal: the review list simply stays empty on failure.
    } finally {
      setGrantsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void loadGrants();
  }, []);

  const toggleScope = (id: string) => {
    setScopes((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const redirectUris = redirectUrisText
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
    if (name.trim().length < 3) {
      setFormError('App name must be at least 3 characters');
      return;
    }
    if (redirectUris.length === 0) {
      setFormError('Add at least one redirect URI (one per line)');
      return;
    }
    if (scopes.length === 0) {
      setFormError('Pick at least one scope');
      return;
    }
    setSubmitting(true);
    try {
      const { app, clientSecret, revealNote } = await api.createOAuthApp({
        name: name.trim(),
        redirectUris,
        scopes,
        type: appType,
      });
      setApps((prev) => [app, ...prev]);
      setRevealed({ app, secret: clientSecret, note: revealNote });
      setCopied(false);
      setName('');
      setRedirectUrisText('');
      setScopes(['profile']);
      setAppType('confidential');
      setCreating(false);
    } catch (err: any) {
      setFormError(err?.message || 'Could not register the app');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteOAuthApp(id);
      setApps((prev) => prev.filter((a) => a.id !== id));
      if (revealed?.app.id === id) setRevealed(null);
    } catch (err: any) {
      setError(err?.message || 'Could not delete the app');
    }
  };

  const revokeGrant = async (appId: string) => {
    setRevoking(appId);
    try {
      await api.revokeOAuthGrant(appId);
      setGrants((prev) => prev.filter((g) => g.appId !== appId));
    } catch (err: any) {
      setError(err?.message || 'Could not revoke the grant');
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = async () => {
    setRevoking('all');
    try {
      await api.revokeAllOAuthGrants();
      setGrants([]);
    } catch (err: any) {
      setError(err?.message || 'Could not revoke grants');
    } finally {
      setRevoking(null);
    }
  };

  const copySecret = async () => {
    if (!revealed?.secret) return;
    try {
      await navigator.clipboard.writeText(revealed.secret);
      setCopied(true);
    } catch {
      // clipboard unavailable — the secret stays selectable
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <KeyRound className="h-6 w-6 text-cyan-300" />
            OAuth Apps
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-2xl">
            Register third-party applications so their users can sign in with their
            Vanitas account — a real OAuth 2.0 authorization-code flow with PKCE.
          </p>
          <p className="mt-1 text-xs text-slate-500" dir="rtl" lang="ar">
            سجّل تطبيقات خارجية لتسجيل الدخول بحساب فانيتاس — تدفق OAuth 2.0 حقيقي مع PKCE.
          </p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="vnt-btn-primary flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white"
        >
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{creating ? 'Cancel' : 'Register App'}</span>
        </button>
      </div>

      {/* Reveal-once secret (or public-client confirmation) */}
      {revealed && (
        <div className="crystal-card rounded-2xl border-emerald-400/30 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-400/30">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-emerald-200">
                App “{revealed.app.name}” registered
                {' · '}
                <span className="font-mono text-[11px] text-cyan-300">
                  {revealed.app.isPublic ? 'public' : 'confidential'}
                </span>
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Client ID: <code className="font-mono text-cyan-300">{revealed.app.clientId}</code>
              </p>
              {revealed.secret ? (
                <>
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5">
                    <Eye className="h-3.5 w-3.5 flex-none text-slate-500" />
                    <code className="min-w-0 flex-1 select-all break-all font-mono text-xs text-amber-200">
                      {revealed.secret}
                    </code>
                    <button
                      onClick={() => void copySecret()}
                      className="flex flex-none items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-300 hover:border-cyan-400/40 hover:text-cyan-300"
                    >
                      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-300/90">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    The client secret is shown exactly once — store it in a secure vault. It is never
                    displayed again (only its hash is kept).
                  </p>
                </>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-cyan-200/90">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {revealed.note}
                </p>
              )}
            </div>
            <button
              onClick={() => setRevealed(null)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Registration form */}
      {creating && (
        <form onSubmit={submit} className="crystal-card rounded-2xl p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-300">
              Application name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. My Cool App"
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-300">
              App type
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(APP_TYPES) as AppType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAppType(t)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    appType === t
                      ? 'border-cyan-400/50 bg-cyan-400/10'
                      : 'border-white/10 bg-slate-950/40 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{APP_TYPES[t].label}</span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                        appType === t
                          ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                          : 'border-slate-600'
                      }`}
                    >
                      {appType === t && <Check className="h-3 w-3" />}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{APP_TYPES[t].blurb}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-300">
              Redirect URIs <span className="font-normal text-slate-500">(one per line)</span>
            </label>
            <textarea
              value={redirectUrisText}
              onChange={(e) => setRedirectUrisText(e.target.value)}
              rows={3}
              placeholder={'https://myapp.example/auth/callback\nhttp://localhost:5173/callback'}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              The browser returns to one of these exact URIs with the authorization code.
              https required everywhere except loopback (localhost/127.0.0.1, for local dev).
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-300">Scopes</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {OAUTH_SCOPE_META.map((info) => (
                <button
                  key={info.id}
                  type="button"
                  onClick={() => toggleScope(info.id)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    scopes.includes(info.id)
                      ? 'border-cyan-400/50 bg-cyan-400/10'
                      : 'border-white/10 bg-slate-950/40 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{info.label}</span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                        scopes.includes(info.id)
                          ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                          : 'border-slate-600'
                      }`}
                    >
                      {scopes.includes(info.id) && <Check className="h-3 w-3" />}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{info.description}</p>
                  <code className="mt-1 block font-mono text-[10px] text-cyan-300/80">{info.id}</code>
                </button>
              ))}
            </div>
          </div>

          {formError && (
            <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
              {formError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="vnt-btn-primary flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {submitting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              <span>{submitting ? 'Registering…' : 'Register & Issue Credentials'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Apps registered by this account */}
      <div>
        <h2 className="mb-3 text-sm font-bold text-slate-200">
          Your applications <span className="text-slate-500">({apps.length})</span>
        </h2>
        {loading ? (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
            {error}
          </p>
        ) : apps.length === 0 ? (
          <div className="crystal-card rounded-2xl p-8 text-center">
            <KeyRound className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm font-semibold text-slate-300">No OAuth apps yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Register an application to let its users sign in with Vanitas.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {apps.map((app) => (
              <div key={app.id} className="crystal-card rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-white">{app.name}</h3>
                      <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 font-mono text-[10px] text-cyan-300">
                        {app.scopes.join(' ')}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                          app.isPublic
                            ? 'border-amber-400/25 bg-amber-400/10 text-amber-300'
                            : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                        }`}
                      >
                        {app.isPublic ? 'public · PKCE' : 'confidential'}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">
                      client_id: <span className="text-cyan-200">{app.clientId}</span>
                    </p>
                    <div className="mt-2 space-y-1">
                      {app.redirectUris.map((uri) => (
                        <p key={uri} className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                          <Globe className="h-3 w-3 flex-none" />
                          <span className="truncate">{uri}</span>
                        </p>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">
                      Created {new Date(app.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={() =>
                        window.open(
                          buildAuthorizeUrl({
                            clientId: app.clientId,
                            redirectUri: app.redirectUris[0],
                            state: 'demo',
                          }),
                          '_blank',
                        )
                      }
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-medium text-slate-300 hover:border-cyan-400/40 hover:text-cyan-300"
                      title="Open the authorize URL in a new tab (demo)"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Try flow
                    </button>
                    <button
                      onClick={() => void remove(app.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-rose-400/25 px-2.5 py-1.5 text-[10px] font-medium text-rose-300 hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-3 w-3" />
                      Revoke
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Authorized apps: what THIS account has granted to other apps        */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <Link2 className="h-4 w-4 text-cyan-300" />
              Apps with access to your account{' '}
              <span className="text-slate-500">({grants.length})</span>
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Every app you approved through the consent screen. Revoking kills its live
              tokens immediately — the app must ask for consent again.
            </p>
          </div>
          {grants.length > 0 && (
            <button
              onClick={() => void revokeAll()}
              disabled={revoking !== null}
              className="flex items-center gap-1.5 rounded-lg border border-rose-400/30 px-3 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
            >
              {revoking === 'all' ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
              Revoke all
            </button>
          )}
        </div>
        {grantsLoading ? (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : grants.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-6 text-center">
            <Unlink className="mx-auto h-6 w-6 text-slate-600" />
            <p className="mt-2 text-xs text-slate-500">
              No third-party app currently has access to your account.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {grants.map((grant) => (
              <div key={grant.appId} className="crystal-card rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-white">{grant.name}</h3>
                      {grant.scopes.map((s) => (
                        <span
                          key={s}
                          className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 font-mono text-[10px] text-cyan-300"
                        >
                          {scopeMeta(s).label}
                        </span>
                      ))}
                      <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                        {grant.activeTokens} live token{grant.activeTokens === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">{grant.clientId}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Granted {new Date(grant.grantedAt).toLocaleString()} ·{' '}
                      access expires {new Date(grant.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => void revokeGrant(grant.appId)}
                    disabled={revoking !== null}
                    className="flex items-center gap-1.5 rounded-lg border border-rose-400/25 px-2.5 py-1.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    {revoking === grant.appId ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Unlink className="h-3 w-3" />
                    )}
                    Revoke access
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Integration snippet for developers */}
      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
        <div className="mb-2 flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-cyan-300" />
          <h3 className="text-xs font-bold text-slate-200">
            How a third-party app uses this <span className="font-normal text-slate-500">(curl)</span>
          </h3>
        </div>
        <pre className="overflow-x-auto rounded-xl bg-black/50 p-4 font-mono text-[11px] leading-relaxed text-slate-300">
{`# 1. Send the user to the authorize URL (browser)
${buildAuthorizeUrl({
  clientId: 'vnt_oa_…',
  redirectUri: 'https://yourapp.example/callback',
  state: 'random_csrf_token',
  scopes: ['profile'],
})}
# → user signs in, consents, browser returns with ?code=…&state=…
# Public clients (SPA/mobile) MUST append code_challenge + code_challenge_method=s256.

# 2. Exchange the code for an access token
curl -X POST ${window.location.origin}/api/v1/oauth/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "authorization_code",
    "client_id": "vnt_oa_…",
    "client_secret": "vnt_oa_sec_…",   # confidential apps only
    "code": "vnt_code_…",
    "redirect_uri": "https://yourapp.example/callback",
    "code_verifier": "…"               # public apps: PKCE, no secret
  }'
# → { "access_token": "vnt_at_…", "token_type": "Bearer", "expires_in": 3600 }

# 3. Read the user's profile
curl ${window.location.origin}/api/v1/oauth/userinfo \\
  -H "Authorization: Bearer vnt_at_…"
# → { "sub": "usr_…", "name": "…", "preferred_username": "…", "email_verified": false }`}
        </pre>
      </div>
    </div>
  );
};
