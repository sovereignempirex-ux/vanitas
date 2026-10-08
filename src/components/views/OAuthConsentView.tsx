import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../lib/apiClient.ts';
import { OAuthAuthorizeValidation } from '../../types.ts';
import { scopeMeta } from '../../lib/oauthScopes.ts';
import {
  ShieldCheck,
  ShieldX,
  KeyRound,
  Globe,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  User as UserIcon,
  Mail,
  AtSign,
  Image as ImageIcon,
  LogIn,
  Unlink,
} from 'lucide-react';

/** Icons per scope id — the label/description text lives in the shared
 *  oauthScopes module so consent and registration can never drift. */
const SCOPE_ICONS: Record<string, React.ReactNode> = {
  profile: <UserIcon className="h-4 w-4 text-cyan-300" />,
  email: <Mail className="h-4 w-4 text-cyan-300" />,
};

type Phase =
  | { kind: 'validating' }
  | { kind: 'ready'; data: OAuthAuthorizeValidation }
  | { kind: 'error'; message: string }
  | { kind: 'redirecting'; url: string };

export const OAuthConsentView: React.FC = () => {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'validating' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    // Drop anything that is not part of the authorize request
    // before sending it server-side for validation.
    const allowed = [
      'client_id',
      'redirect_uri',
      'response_type',
      'state',
      'scope',
      'code_challenge',
      'code_challenge_method',
    ];
    const clean = new URLSearchParams();
    for (const key of allowed) {
      const value = query.get(key);
      if (value) clean.set(key, value);
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await api.validateOAuthAuthorize(clean);
        if (!cancelled) setPhase({ kind: 'ready', data });
      } catch (err: any) {
        if (!cancelled) {
          setPhase({
            kind: 'error',
            message: err?.message || 'This authorization request is invalid',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const decide = async (decision: 'allow' | 'deny') => {
    if (phase.kind !== 'ready' || busy) return;
    setBusy(true);
    try {
      const { redirectUrl } = await api.postOAuthDecision(phase.data.ticket, decision);
      setPhase({ kind: 'redirecting', url: redirectUrl });
      // Hand the browser (and the authorization code) back to the app.
      window.location.assign(redirectUrl);
    } catch (err: any) {
      setPhase({
        kind: 'error',
        message: err?.message || 'Could not record your decision',
      });
      setBusy(false);
    }
  };

  // ---- Error state (bad request, unknown client, mismatched redirect) ----
  if (phase.kind === 'error') {
    return (
      <div className="min-h-screen vnt-app-bg flex items-center justify-center px-4">
        <div className="crystal-card w-full max-w-md rounded-3xl p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 border border-rose-400/30">
            <ShieldX className="h-7 w-7 text-rose-300" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-white">Authorization request rejected</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{phase.message}</p>
          <p className="mt-1 text-xs text-slate-600">
            Check the client_id, redirect_uri and requested scopes with the app developer.
          </p>
          <a
            href="/"
            className="vnt-btn-primary mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-white"
          >
            <X className="h-3.5 w-3.5" />
            Back to Vanitas
          </a>
        </div>
      </div>
    );
  }

  // ---- Redirecting (the browser is on its way back to the app) ----
  if (phase.kind === 'redirecting') {
    return (
      <div className="min-h-screen vnt-app-bg flex items-center justify-center px-4">
        <div className="crystal-card w-full max-w-md rounded-3xl p-8 text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
          <h1 className="mt-5 text-xl font-bold text-white">Redirecting…</h1>
          <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-slate-500">
            {phase.url.slice(0, 200)}
          </p>
        </div>
      </div>
    );
  }

  // ---- Validating or ready ----
  const data = phase.kind === 'ready' ? phase.data : null;

  return (
    <div className="min-h-screen vnt-app-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Brand strip */}
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <ShieldCheck className="h-6 w-6 text-cyan-300" />
          <span className="font-display text-sm font-bold tracking-[0.2em] text-white">
            VANITAS <span className="text-cyan-300">SIGN-IN</span>
          </span>
        </div>

        <div className="crystal-card rounded-3xl p-6 sm:p-8">
          {!data ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-cyan-300" />
              <p className="font-mono text-xs tracking-widest text-slate-400">
                VERIFYING AUTHORIZATION REQUEST…
              </p>
            </div>
          ) : (
            <>
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/25 to-blue-500/15 border border-cyan-400/30">
                  <KeyRound className="h-7 w-7 text-cyan-200" />
                </div>
                <h1 className="mt-4 text-xl font-bold text-white">
                  {data.app.name} wants to sign you in
                </h1>
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  client_id: {data.app.clientId}
                </p>
              </div>

              {/* What the app gets */}
              <div className="mt-6 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  This app will receive
                </p>
                {data.app.scopes.map((scope) => {
                  const info = scopeMeta(scope);
                  return (
                    <div
                      key={scope}
                      className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3"
                    >
                      <span className="mt-0.5 flex-none">
                        {SCOPE_ICONS[scope] || <AtSign className="h-4 w-4 text-cyan-300" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white">{info.label}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                          {info.description}
                        </p>
                      </div>
                      <code className="ml-auto flex-none font-mono text-[10px] text-cyan-300/70">
                        {scope}
                      </code>
                    </div>
                  );
                })}
              </div>

              {/* Identity + destination */}
              <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
                <div className="flex items-center gap-3">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="h-9 w-9 rounded-xl border border-white/10 object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/15 border border-cyan-400/25">
                      <UserIcon className="h-4 w-4 text-cyan-300" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-white">
                      Signed in as {user?.name}
                    </p>
                    <p className="truncate font-mono text-[11px] text-slate-500">
                      {user?.email}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
                  <Globe className="h-3.5 w-3.5 flex-none text-slate-500" />
                  <span className="truncate font-mono text-[11px] text-slate-500">
                    returns to: {data.redirectUri}
                  </span>
                </div>
                {data.state && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <AtSign className="h-3.5 w-3.5 flex-none text-slate-600" />
                    <span className="truncate font-mono text-[11px] text-slate-600">
                      state: {data.state}
                    </span>
                  </div>
                )}
              </div>

              {/* Decisions */}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  onClick={() => void decide('deny')}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-xs font-semibold text-slate-200 hover:border-rose-400/40 hover:text-rose-300 transition-colors disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  Deny
                </button>
                <button
                  onClick={() => void decide('allow')}
                  disabled={busy}
                  className="vnt-btn-primary flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Allow
                </button>
              </div>

              <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                Only allow this if you recognize the application and trust its redirect address.
              </p>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-600">
                <Unlink className="h-3.5 w-3.5" />
                You can withdraw this access anytime from{' '}
                <span className="text-slate-500">Dashboard → OAuth Apps → Apps with access</span>.
              </p>
            </>
          )}
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-600">
          <ImageIcon className="h-3.5 w-3.5" />
          Secured by Vanitas — multi-factor authentication enforced on your account.
        </p>

        {!user && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <LogIn className="h-3.5 w-3.5" />
            Sign in to continue
          </p>
        )}
      </div>
    </div>
  );
};
