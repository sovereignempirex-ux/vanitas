import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../lib/apiClient.ts';
import { OAuthApp } from '../../types.ts';
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
} from 'lucide-react';

const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
  profile: {
    label: 'Basic profile',
    description: 'Name, @username and avatar — the identity basics every app needs.',
  },
  email: {
    label: 'Email address',
    description: 'The account’s verified email address. Only request it if your app truly needs it.',
  },
};

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

export const OAuthAppsView: React.FC = () => {
  const { user } = useAuth();
  const [apps, setApps] = useState<OAuthApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // New-app form
  const [name, setName] = useState('');
  const [redirectUrisText, setRedirectUrisText] = useState('');
  const [scopes, setScopes] = useState<string[]>(['profile']);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reveal-once secret block
  const [revealed, setRevealed] = useState<{ app: OAuthApp; secret: string } | null>(null);
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

  useEffect(() => {
    void load();
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
      const { app, clientSecret } = await api.createOAuthApp({
        name: name.trim(),
        redirectUris,
        scopes,
      });
      setApps((prev) => [app, ...prev]);
      setRevealed({ app, secret: clientSecret });
      setCopied(false);
      setName('');
      setRedirectUrisText('');
      setScopes(['profile']);
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

  const copySecret = async () => {
    if (!revealed) return;
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

      {/* Reveal-once secret */}
      {revealed && (
        <div className="crystal-card rounded-2xl border-emerald-400/30 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-400/30">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-emerald-200">
                App “{revealed.app.name}” registered
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Client ID: <code className="font-mono text-cyan-300">{revealed.app.clientId}</code>
              </p>
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
              Redirect URIs <span className="font-normal text-slate-500">(one per line)</span>
            </label>
            <textarea
              value={redirectUrisText}
              onChange={(e) => setRedirectUrisText(e.target.value)}
              rows={3}
              placeholder={'https://myapp.example/auth/callback\nhttps://myapp.example/other'}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              The browser returns to one of these exact URIs with the authorization code.
              http/https only — no fragments, no localhost, no private networks.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-300">Scopes</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(SCOPE_LABELS).map(([id, info]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleScope(id)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    scopes.includes(id)
                      ? 'border-cyan-400/50 bg-cyan-400/10'
                      : 'border-white/10 bg-slate-950/40 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{info.label}</span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                        scopes.includes(id)
                          ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                          : 'border-slate-600'
                      }`}
                    >
                      {scopes.includes(id) && <Check className="h-3 w-3" />}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{info.description}</p>
                  <code className="mt-1 block font-mono text-[10px] text-cyan-300/80">{id}</code>
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

      {/* Apps list */}
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

# 2. Exchange the code for an access token
curl -X POST ${window.location.origin}/api/v1/oauth/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "authorization_code",
    "client_id": "vnt_oa_…",
    "client_secret": "vnt_oa_sec_…",
    "code": "vnt_code_…",
    "redirect_uri": "https://yourapp.example/callback",
    "code_verifier": "…"   # PKCE — the verifier for the challenge
  }'
# → { "access_token": "vnt_at_…", "token_type": "Bearer", "expires_in": 3600 }

# 3. Read the user's profile
curl ${window.location.origin}/api/v1/oauth/userinfo \\
  -H "Authorization: Bearer vnt_at_…"
# → { "sub": "usr_…", "name": "…", "preferred_username": "…", "picture": "…" }`}
        </pre>
      </div>
    </div>
  );
};
