import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../lib/apiClient.ts';
import { AuthPage } from './AuthPage.tsx';
import { BRAND_ASSETS } from '../data/assets.ts';
import { seoForInvitePage, setPageSeo } from '../lib/seo.ts';
import { Link2, ShieldAlert, Loader2, ArrowRight, LogOut, ShieldCheck } from 'lucide-react';
import { VerifiedBadge } from '../components/VerifiedBadge.tsx';

// ---------------------------------------------------------------------------
// Standalone /invite/<token> page — the landing page of a developer invite
// link. Shows exactly what the link grants, then (when signed out) the normal
// registration form with the invite token attached.
// ---------------------------------------------------------------------------

const REASON_TEXT: Record<string, { en: string; ar: string }> = {
  not_found: { en: 'This invite link does not exist.', ar: 'رابط الدعوة غير موجود.' },
  revoked: { en: 'This invite was revoked by its creator.', ar: 'تم إلغاء هذه الدعوة من صانعها.' },
  used: { en: 'This invite has already been redeemed.', ar: 'تم استخدام هذه الدعوة بالفعل.' },
  expired: { en: 'This invite has expired — links last 7 days.', ar: 'انتهت صلاحية هذه الدعوة — مدة الروابط 7 أيام.' },
};

type Preview =
  | { state: 'loading' }
  | { state: 'dead'; reason: string }
  | {
      state: 'live';
      role: string;
      verification?: string;
      creatorName: string;
      note?: string;
      expiresAt?: string;
    };

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen vnt-app-bg text-slate-100 flex flex-col relative overflow-hidden">
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div className="w-[560px] h-[560px] bg-gradient-to-tr from-cyan-600/15 via-blue-600/15 to-purple-600/15 rounded-full blur-3xl animate-crystal-pulse" />
    </div>
    <header className="relative z-10 flex items-center px-5 py-4">
      <a href="/" className="flex items-center gap-2 group">
        <img src={BRAND_ASSETS.logo} alt="Vanitas" className="h-7 w-7 object-contain drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]" />
        <span className="font-display font-bold tracking-widest text-sm text-white group-hover:text-cyan-300 transition-colors">VANITAS</span>
      </a>
    </header>
    <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-12">{children}</main>
  </div>
);

export const InvitePage: React.FC<{ token: string }> = ({ token }) => {
  const { user, logout } = useAuth();
  const [preview, setPreview] = useState<Preview>({ state: 'loading' });

  useEffect(() => {
    setPageSeo(seoForInvitePage());
    api
      .previewInvite(token)
      .then((r) => {
        if (r.valid) {
          setPreview({
            state: 'live',
            role: r.role || 'USER',
            verification: r.verification || '',
            creatorName: r.creatorName || 'an administrator',
            note: r.note || '',
            expiresAt: r.expiresAt || '',
          });
        } else {
          setPreview({ state: 'dead', reason: r.reason || 'not_found' });
        }
      })
      .catch(() => setPreview({ state: 'dead', reason: 'not_found' }));
  }, [token]);

  if (preview.state === 'loading') {
    return (
      <div className="min-h-screen vnt-app-bg flex flex-col items-center justify-center gap-4 text-slate-300">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
        <p className="font-mono text-xs tracking-widest text-cyan-300">CHECKING INVITE…</p>
      </div>
    );
  }

  if (preview.state === 'dead') {
    const text = REASON_TEXT[preview.reason] || REASON_TEXT.not_found;
    return (
      <Shell>
        <div className="w-full max-w-md rounded-3xl border border-white/15 crystal-card p-6 sm:p-8 text-center shadow-[0_0_60px_rgba(56,189,248,0.15)] vnt-fade-up">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
            <ShieldAlert className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold tracking-wider text-white">Invite unavailable</h1>
          <p className="mt-2 text-xs text-slate-300">{text.en}</p>
          <p className="mt-1 text-xs text-slate-400">{text.ar}</p>
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

  // Live invite + already signed in → explain it only applies to new accounts.
  if (user) {
    return (
      <Shell>
        <div className="w-full max-w-md rounded-3xl border border-white/15 crystal-card p-6 sm:p-8 text-center shadow-[0_0_60px_rgba(56,189,248,0.15)] vnt-fade-up">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl crystal-gem">
            <img src={BRAND_ASSETS.logo} alt="Vanitas" className="h-9 w-9 object-contain drop-shadow-[0_0_12px_rgba(56,189,248,0.7)]" />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold tracking-wider text-white">You are signed in</h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            دعوات المطوّر تُفعَّل عند <b className="text-white">إنشاء حساب جديد</b> فقط — أنت مسجّل الآن باسم{' '}
            <b className="text-white">{user.name}</b>.
          </p>
          <div className="mt-4 space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-[11px] text-amber-200 text-right">
            <p className="flex items-center justify-end gap-1.5 font-semibold">
              <Link2 className="h-3.5 w-3.5" />
              تُقدَّم بواسطة {preview.creatorName}
            </p>
            <p className="flex items-center justify-end gap-1.5">
              صلاحيات: <b>{preview.role === 'ADMIN' ? 'أدمن ADMIN' : 'مستخدم USER'}</b>
              {preview.verification && <VerifiedBadge type={preview.verification} />}
              {preview.note ? ` — ${preview.note}` : ''}
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <a
              href="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 text-xs font-semibold text-white transition-all hover:from-cyan-400 hover:to-blue-500"
            >
              Continue to console <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={() => {
                logout();
                // State clears → same component now renders the register form.
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 py-2.5 text-xs text-slate-300 transition-all hover:border-cyan-400/40 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out & accept with a new account
            </button>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> invite expires{' '}
            {preview.expiresAt ? new Date(preview.expiresAt).toLocaleDateString() : 'soon'}
          </p>
        </div>
      </Shell>
    );
  }

  // Signed out → the real registration form with the invite attached.
  return (
    <AuthPage
      mode="register"
      invite={{
        token,
        creatorName: preview.creatorName,
        role: preview.role,
        verification: preview.verification,
        note: preview.note,
        expiresAt: preview.expiresAt,
      }}
    />
  );
};

export default InvitePage;
