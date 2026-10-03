import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../lib/apiClient.ts';
import { BRAND_ASSETS } from '../data/assets.ts';
import { seoForPublicProfile, setPageSeo } from '../lib/seo.ts';
import { VerifiedBadge } from '../components/VerifiedBadge.tsx';
import { PublicProfile } from '../types.ts';
import { Shield, CalendarDays, AtSign, UserSearch, Loader2, ArrowRight, Link2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Standalone /u/<username> public profile — the shareable side of the
// @username system. Shows only public-safe fields (no email, no ids).
// ---------------------------------------------------------------------------

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen vnt-app-bg text-slate-100 flex flex-col relative overflow-hidden">
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div className="w-[560px] h-[560px] bg-gradient-to-tr from-cyan-600/15 via-blue-600/15 to-purple-600/15 rounded-full blur-3xl animate-crystal-pulse" />
    </div>
    <header className="relative z-10 flex items-center px-5 py-4">
      <a href="/" className="flex items-center gap-2 group">
        <img
          src={BRAND_ASSETS.logo}
          alt="Vanitas"
          className="h-7 w-7 object-contain drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]"
        />
        <span className="font-display font-bold tracking-widest text-sm text-white group-hover:text-cyan-300 transition-colors">
          VANITAS
        </span>
      </a>
    </header>
    <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-12">{children}</main>
  </div>
);

type State =
  | { s: 'loading' }
  | { s: 'missing' }
  | { s: 'live'; profile: PublicProfile };

const connectedCount = (p: PublicProfile) => Object.values(p.connectedAccounts || {}).filter(Boolean).length;

export const ProfilePage: React.FC<{ username: string }> = ({ username }) => {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ s: 'loading' });

  useEffect(() => {
    let clean = '';
    try {
      clean = decodeURIComponent(username || '').trim().toLowerCase();
    } catch {
      clean = ''; // malformed percent-encoding (/u/%) — falls through to "missing"
    }
    if (!clean) {
      setState({ s: 'missing' });
      setPageSeo({ title: 'Profile not found', description: 'No Vanitas profile matches this username.' });
      return;
    }
    setPageSeo(seoForPublicProfile(clean));
    api
      .getPublicProfile(clean)
      .then((r) => {
        setState({ s: 'live', profile: r.profile });
        setPageSeo(seoForPublicProfile(r.profile.username, r.profile.bio));
      })
      .catch(() => {
        setState({ s: 'missing' });
        setPageSeo({
          title: `@${clean} not found`,
          description: 'No Vanitas profile matches this username.',
        });
      });
  }, [username]);

  if (state.s === 'loading') {
    return (
      <div className="min-h-screen vnt-app-bg flex flex-col items-center justify-center gap-4 text-slate-300">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
        <p className="font-mono text-xs tracking-widest text-cyan-300">LOADING PROFILE…</p>
      </div>
    );
  }

  if (state.s === 'missing') {
    return (
      <Shell>
        <div className="w-full max-w-md rounded-3xl border border-white/15 crystal-card p-6 sm:p-8 text-center shadow-[0_0_60px_rgba(56,189,248,0.15)] vnt-fade-up">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
            <UserSearch className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold tracking-wider text-white">Profile not found</h1>
          <p className="mt-2 text-xs text-slate-300">لا يوجد بروفايل بهذا الاسم — هذا الاسم لم يُحجز بعد.</p>
          <a
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs font-semibold text-white transition-all hover:from-cyan-400 hover:to-blue-500"
          >
            Back to console <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </Shell>
    );
  }

  const p = state.profile;
  const isMe = !!user?.username && user.username.toLowerCase() === p.username.toLowerCase();

  return (
    <Shell>
      <div className="w-full max-w-lg rounded-3xl border border-white/15 crystal-card overflow-hidden shadow-[0_0_60px_rgba(56,189,248,0.15)] vnt-fade-up">
        {/* Banner */}
        <div className="relative h-24 bg-gradient-to-r from-blue-600/50 via-cyan-500/35 to-purple-600/45">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_45%)]" />
        </div>

        <div className="px-6 pb-6 -mt-12 text-center">
          <div className="relative mx-auto h-24 w-24 rounded-2xl overflow-hidden border-4 border-slate-950 shadow-[0_0_30px_rgba(56,189,248,0.4)] bg-slate-900">
            <img src={p.avatarUrl} alt={p.name} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            <h1 className="text-lg font-bold text-white">{p.name}</h1>
            <VerifiedBadge type={p.verification} className="h-4 w-4" />
          </div>

          <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-cyan-300">
            <AtSign className="h-3 w-3" />
            {p.username}
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 px-3 py-1 text-xs font-mono font-bold text-blue-300">
            <Shield className="h-3.5 w-3.5" />
            <span>{p.role}</span>
          </div>

          {p.bio ? (
            <p className="mt-4 text-xs leading-relaxed text-slate-300">{p.bio}</p>
          ) : (
            <p className="mt-4 text-[11px] italic text-slate-500">This developer hasn't written a bio yet.</p>
          )}

          <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-cyan-400" />
              Joined {new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5 text-cyan-400" />
              {connectedCount(p)} of 3 sign-ins linked
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            {isMe ? (
              <a
                href="/"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 text-xs font-semibold text-white transition-all hover:from-cyan-400 hover:to-blue-500"
              >
                This is you — open your console <ArrowRight className="h-3.5 w-3.5" />
              </a>
            ) : (
              <>
                <a
                  href="/login"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 text-xs font-semibold text-white transition-all hover:from-cyan-400 hover:to-blue-500"
                >
                  Sign in to Vanitas <ArrowRight className="h-3.5 w-3.5" />
                </a>
                <a
                  href="/register"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 py-2.5 text-xs text-slate-300 transition-all hover:border-cyan-400/40 hover:text-white"
                >
                  Create your own @username
                </a>
              </>
            )}
          </div>

          <p className="mt-4 text-[10px] text-slate-600">
            Public profile — email and private account data are never shown here.
          </p>
        </div>
      </div>
    </Shell>
  );
};

export default ProfilePage;
