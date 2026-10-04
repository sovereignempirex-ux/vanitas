import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { CHARACTER_AVATARS } from '../../data/assets.ts';
import { api } from '../../lib/apiClient.ts';
import { VerifiedBadge } from '../VerifiedBadge.tsx';
import { Markdown } from '../Markdown.tsx';
import QRCode from 'qrcode';
import { ProfileLink } from '../../types.ts';
import {
  User,
  Shield,
  Sparkles,
  Camera,
  Save,
  Check,
  AtSign,
  CalendarDays,
  Clock,
  KeyRound,
  Link2,
  Copy,
  Loader2,
  X,
  ExternalLink,
  MessageSquare,
  QrCode,
  Palette,
  Radio,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Profile & identity: hero card (name, @username, badges, Markdown bio, real
// account facts), a real profile-strength checklist, the editor (claim your
// @username with live availability, a Markdown bio with toolbar + live
// preview, accent colour, avatar), share actions (view / copy / QR), the
// read-only account details and the character preset gallery.
// ---------------------------------------------------------------------------

type AvailState = { checking: boolean; available: boolean; reason?: string } | null;

const BIO_LIMIT = 500;
// Mirrors the server's DEFAULT_AVATAR — used to tell "picked a custom avatar"
// (preset / upload / URL) from the untouched default.
const DEFAULT_AVATAR_URL = '/images/avatar-default.svg';
// Preset accent swatches for the profile banner tint (any hex also accepted
// through the native colour picker — the server validates #RRGGBB either way).
const ACCENT_PRESETS = ['#38bdf8', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#eab308'];

// Markdown toolbar chips — wrap the selection (or placeholder) at the caret.
const BIO_CHIPS: { label: string; title: string; before: string; after: string; placeholder: string }[] = [
  { label: 'B', title: 'Bold', before: '**', after: '**', placeholder: 'bold text' },
  { label: 'I', title: 'Italic', before: '*', after: '*', placeholder: 'italic text' },
  { label: '</>', title: 'Inline code', before: '`', after: '`', placeholder: 'code' },
  { label: '[..](..)', title: 'Link', before: '[', after: '](https://)', placeholder: 'label' },
  { label: '```', title: 'Code block', before: '\n```ts\n', after: '\n```\n', placeholder: 'code here' },
];

const VERIFICATION_LABEL: Record<string, string> = {
  '': 'Unverified',
  USER: 'Verified account',
  DEVELOPER: 'Developer',
  ADMIN: 'Administrator',
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '—');

export const ProfileView: React.FC = () => {
  const { user, role, updateUserProfile } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [usernameInput, setUsernameInput] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatarUrl || CHARACTER_AVATARS[0].url);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [avail, setAvail] = useState<AvailState>(null);
  // Bio editor: write vs. live preview (the preview is the exact renderer
  // used on the public /u/<name> page, so what you see is what ships).
  const [bioTab, setBioTab] = useState<'write' | 'preview'>('write');
  // Profile accent — persisted as #RRGGBB (validated server-side), previewed
  // live on the hero banner while editing.
  const [accent, setAccent] = useState(user?.accentColor || '');
  // One-line status under the name + up to 5 published links — both validated
  // by the server before they are stored (single line / https only).
  const [statusLine, setStatusLine] = useState(user?.statusLine || '');
  const [links, setLinks] = useState<ProfileLink[]>(user?.profileLinks || []);
  // Real docs-comment total for the facts card (fetched from the same public
  // profile endpoint the /u/<name> page uses).
  const [commentCount, setCommentCount] = useState<number | null>(null);
  // QR modal for the public profile link.
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);

  const currentUsername = (user?.username || '').toLowerCase();
  const usernameDirty = usernameInput.trim().toLowerCase() !== currentUsername;
  const connectedCount = user ? Object.values(user.connectedAccounts).filter(Boolean).length : 0;
  // Only a well-formed hex may reach an inline style.
  const accentHex = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '';

  // Profile strength — a straight count of the four real account facts below.
  // The formula is on screen; nothing is estimated or faked.
  const strengthItems = [
    {
      label: 'Claim your @username',
      hint: 'Sets your public /u/ link',
      done: !!user?.username,
      jump: () => usernameRef.current?.focus(),
    },
    {
      label: 'Write a Markdown bio',
      hint: 'Rendered on your public page',
      done: !!user?.bio?.trim(),
      jump: () => {
        setBioTab('write');
        bioRef.current?.focus();
      },
    },
    {
      label: 'Pick a custom avatar',
      hint: 'Preset, upload or image URL',
      done: (user?.avatarUrl || DEFAULT_AVATAR_URL) !== DEFAULT_AVATAR_URL,
      jump: null,
    },
    {
      label: 'Enable two-factor auth',
      hint: 'TOTP in the Security Center',
      done: !!user?.twoFactorEnabled,
      jump: null,
    },
  ];
  const strengthDone = strengthItems.filter((i) => i.done).length;
  const strengthPct = Math.round((strengthDone / strengthItems.length) * 100);

  // Real comment total behind the "Docs comments" fact — one fetch of the
  // account's own public profile whenever the @username is known.
  useEffect(() => {
    let alive = true;
    if (!user?.username) {
      setCommentCount(null);
      return;
    }
    api
      .getPublicProfile(user.username)
      .then((r) => {
        if (alive && typeof r.profile.commentCount === 'number') setCommentCount(r.profile.commentCount);
      })
      .catch(() => undefined); // activity is a bonus — never blocks the view
    return () => {
      alive = false;
    };
  }, [user?.username]);

  // Debounced live availability for the @username being claimed/changed.
  useEffect(() => {
    const candidate = usernameInput.trim().toLowerCase();
    if (!candidate || candidate === currentUsername) {
      setAvail(null);
      return;
    }
    if (candidate.length < 3 || candidate.length > 24 || !/^[a-z0-9_]+$/.test(candidate)) {
      setAvail({ checking: false, available: false, reason: '3–24 characters: letters, numbers, underscores' });
      return;
    }
    let cancelled = false;
    setAvail({ checking: true, available: false });
    const t = setTimeout(() => {
      api
        .getUsernameAvailability(candidate)
        .then((r) => {
          if (!cancelled) setAvail({ checking: false, available: !!r.available, reason: r.reason });
        })
        .catch(() => {
          if (!cancelled) setAvail({ checking: false, available: false, reason: 'Could not check availability' });
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [usernameInput, currentUsername]);

  // REAL avatar upload: the image is cropped + resized in the browser and
  // stored with the account on the server (no external links required).
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSaveError('Please choose an image file (PNG, JPEG, WebP…).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (dataUrl.length > 300_000) {
          setSaveError('That image is still too large after resizing.');
          return;
        }
        setSelectedAvatar(dataUrl);
        setCustomAvatarUrl('');
        setSaveError(null);
      };
      img.onerror = () => setSaveError('Could not read that image file.');
      img.src = String(reader.result);
    };
    reader.onerror = () => setSaveError('Could not read that image file.');
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    // Mirror of the server's avatar rule (server is authoritative): a custom
    // URL must be https://… — anything else is rejected here with a clear
    // message instead of failing later or previewing a dead/wrong image.
    const customAvatar = customAvatarUrl.trim();
    if (customAvatar && !/^https:\/\/[^\s]{5,500}$/.test(customAvatar)) {
      setSaving(false);
      setSaveError('Custom avatar must be an https:// image URL.');
      return;
    }
    // Mirror of the server's link rule (server is authoritative): drop rows
    // left completely empty, then require a label + https:// URL for each.
    const cleanedLinks = links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label || l.url);
    for (const l of cleanedLinks) {
      if (!l.label) {
        setSaving(false);
        setSaveError('Every link needs a label.');
        return;
      }
      if (!/^https:\/\/[^\s]{5,500}$/.test(l.url)) {
        setSaving(false);
        setSaveError(`Link "${l.label}" must be an https:// URL.`);
        return;
      }
    }
    // Persisted server-side on the real account record (PostgreSQL).
    const result = await updateUserProfile({
      name,
      avatarUrl: customAvatar || selectedAvatar,
      ...(usernameDirty ? { username: usernameInput.trim().toLowerCase() } : {}),
      bio,
      accentColor: accent,
      statusLine: statusLine.trim(),
      links: cleanedLinks,
    });
    setSaving(false);
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setSaveError(result.error || 'Failed to save profile.');
    }
  };

  const copyProfileLink = () => {
    if (!user?.username) return;
    navigator.clipboard.writeText(`${window.location.origin}/u/${user.username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Real QR code of the public profile link — same encoder the downloads view
  // uses, so scanning it opens exactly what "View public page" opens.
  const openQrModal = () => {
    if (!user?.username) return;
    setQrOpen(true);
    setQrDataUrl(null);
    setQrError(null);
    QRCode.toDataURL(`${window.location.origin}/u/${user.username}`, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#3c82f6ff', light: '#060913ff' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrError('Could not render the QR code.'));
  };

  // Wrap the current selection (or a placeholder) with Markdown syntax at the
  // caret — then put the caret after the inserted block so typing continues
  // in the right place.
  const insertBio = (chip: (typeof BIO_CHIPS)[number]) => {
    const ta = bioRef.current;
    const start = ta?.selectionStart ?? bio.length;
    const end = ta?.selectionEnd ?? bio.length;
    const selected = bio.slice(start, end) || chip.placeholder;
    const next = (bio.slice(0, start) + chip.before + selected + chip.after + bio.slice(end)).slice(0, BIO_LIMIT);
    setBio(next);
    const caret = start + chip.before.length + selected.length + chip.after.length;
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(Math.min(caret, next.length), Math.min(caret, next.length));
    });
  };

  const saveBlocked = saving || (usernameDirty && (!avail || avail.checking || !avail.available));

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <User className="h-6 w-6 text-blue-400" />
          <h1 className="text-xl sm:text-2xl font-bold text-white">Profile & Identity</h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Your developer identity on Vanitas — claim your public @username, write a bio, pick your avatar and review
          the real facts of your account.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: identity hero card */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 overflow-hidden backdrop-blur-xl shadow-2xl">
            {/* Gradient banner — tinted live by the chosen profile accent */}
            <div
              className="relative h-24 bg-gradient-to-r from-blue-600/50 via-cyan-500/35 to-purple-600/45"
              style={
                accentHex
                  ? { background: `linear-gradient(100deg, ${accentHex} 0%, ${accentHex}cc 45%, rgba(15,23,42,0.85) 100%)` }
                  : undefined
              }
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_45%)]" />
            </div>

            <div className="px-6 pb-6 -mt-12 text-center">
              <div className="relative mx-auto h-24 w-24 rounded-2xl overflow-hidden border-4 border-slate-950 shadow-[0_0_30px_rgba(59,130,246,0.35)] bg-slate-900">
                <img
                  src={(() => {
                    const v = customAvatarUrl.trim();
                    return /^https:\/\/[^\s]{5,500}$/.test(v) ? v : selectedAvatar;
                  })()}
                  alt={name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="mt-3 flex items-center justify-center gap-2">
                <h2 className="text-lg font-bold text-white truncate">{name}</h2>
                <VerifiedBadge type={user?.verification} className="h-4.5 w-4.5" />
              </div>

              <button
                type="button"
                onClick={() => usernameRef.current?.focus()}
                className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs text-cyan-300 hover:border-cyan-400/60 transition-colors"
                title={user?.username ? 'Your public username' : 'Claim your @username in the editor'}
              >
                <AtSign className="h-3 w-3" />
                {user?.username || 'claim your username'}
              </button>

              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 px-3 py-1 text-xs font-mono font-bold text-blue-300">
                <Shield className="h-3.5 w-3.5" />
                <span>{role} PRIVILEGES</span>
              </div>

              {/* One-line status (live preview while editing, exactly as saved) */}
              {statusLine.trim() && (
                <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="truncate">{statusLine.trim()}</span>
                </p>
              )}

              {user?.bio ? (
                <div className="mt-3 text-left">
                  <Markdown text={user.bio} className="text-xs" />
                </div>
              ) : (
                <p className="mt-3 text-[11px] italic text-slate-500">No bio yet — tell people what you build.</p>
              )}

              <p className="mt-2 font-mono text-[11px] text-slate-500 truncate">{user?.email}</p>

              {/* Real account facts */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2">
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                    <CalendarDays className="h-3 w-3" /> Joined
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-200">{fmtDate(user?.createdAt)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2">
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                    <Clock className="h-3 w-3" /> Last login
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-200">{fmtDate(user?.lastLoginAt)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2">
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                    <KeyRound className="h-3 w-3" /> Two-factor
                  </p>
                  <p className={`mt-0.5 text-xs font-semibold ${user?.twoFactorEnabled ? 'text-emerald-300' : 'text-slate-400'}`}>
                    {user?.twoFactorEnabled ? 'Enabled' : 'Off'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2">
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                    <Link2 className="h-3 w-3" /> Connected
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-200">{connectedCount} of 3</p>
                </div>
                <div className="col-span-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2">
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                    <MessageSquare className="h-3 w-3" /> Docs comments
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-200">
                    {commentCount === null ? (
                      'Loading…'
                    ) : commentCount === 0 ? (
                      'No public comments yet'
                    ) : (
                      <>
                        {commentCount} public comment{commentCount === 1 ? '' : 's'}
                        {user?.username && (
                          <a
                            href={`/u/${user.username}`}
                            className="ml-2 font-mono text-[10px] text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                          >
                            view activity →
                          </a>
                        )}
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Published profile links — same rows the editor manages */}
              {links.filter((l) => l.label && l.url).length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {links
                    .filter((l) => l.label && l.url)
                    .map((l) => (
                      <a
                        key={`${l.label}-${l.url}`}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        title={l.url}
                        className="max-w-[170px] truncate rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:border-blue-400/50 hover:text-white"
                      >
                        <Link2 className="mr-1 inline h-2.5 w-2.5" />
                        {l.label}
                      </a>
                    ))}
                </div>
              )}

              {/* Shareable public profile link (only real once a username exists) */}
              {user?.username ? (
                <div className="mt-4 flex gap-2">
                  <a
                    href={`/u/${user.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-500/20"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View public page
                  </a>
                  <button
                    type="button"
                    onClick={copyProfileLink}
                    className="flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-500/20"
                    title="Copy profile link"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    type="button"
                    onClick={openQrModal}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-500/20"
                    title="Show a QR code for your public profile"
                  >
                    <QrCode className="h-3.5 w-3.5" />
                    QR
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => usernameRef.current?.focus()}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2 text-xs font-semibold text-white transition-all hover:from-cyan-400 hover:to-blue-500"
                >
                  <AtSign className="h-3.5 w-3.5" /> Claim your @username
                </button>
              )}
            </div>
          </div>

          {/* Profile strength — computed from the four real account facts it
              lists (username, bio, avatar, 2FA). The formula stays visible. */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Profile Strength</h3>
              </div>
              <span className="font-mono text-sm font-bold text-amber-300">{strengthPct}%</span>
            </div>

            <div className="mt-4 h-2 rounded-full bg-slate-900 overflow-hidden border border-white/5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  strengthPct >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-yellow-400'
                }`}
                style={{ width: `${strengthPct}%` }}
              />
            </div>

            <ul className="mt-4 space-y-1.5">
              {strengthItems.map((item) => {
                const rowInner = (
                  <>
                    <span
                      className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
                        item.done ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-slate-600 bg-slate-900'
                      }`}
                    >
                      {item.done && <Check className="h-3 w-3 text-emerald-300" />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-xs font-medium ${item.done ? 'text-slate-200' : 'text-slate-400'}`}>
                        {item.label}
                      </span>
                      <span className="block text-[10px] text-slate-500">{item.hint}</span>
                    </span>
                  </>
                );
                return item.jump ? (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.jump}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                  >
                    {rowInner}
                  </button>
                ) : (
                  <div key={item.label} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left">
                    {rowInner}
                  </div>
                );
              })}
            </ul>

            <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
              {strengthDone} of {strengthItems.length} steps done — counted straight from your account record, nothing
              estimated.
            </p>
          </div>
        </div>

        {/* Right: editor + account facts + presets */}
        <div className="lg:col-span-7 space-y-6">
          {/* Edit profile */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Edit Profile</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500">saved server-side</span>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4 text-left">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Display Name</label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Username</label>
                  <div className="mt-1 relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                    <input
                      ref={usernameRef}
                      type="text"
                      value={usernameInput}
                      maxLength={24}
                      spellCheck={false}
                      autoCapitalize="off"
                      onChange={(e) => setUsernameInput(e.target.value.replace(/\s/g, ''))}
                      placeholder="your_name"
                      className="w-full rounded-xl border border-white/10 bg-slate-900 pl-8 pr-8 py-2 font-mono text-xs text-cyan-200 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                    />
                    {avail && (
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        {avail.checking ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                        ) : avail.available ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-red-400" />
                        )}
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-1 text-[11px] ${
                      avail && !avail.checking && !avail.available ? 'text-red-300' : 'text-slate-500'
                    }`}
                  >
                    {avail
                      ? avail.checking
                        ? 'Checking availability…'
                        : avail.available
                          ? 'Username is available'
                          : avail.reason || 'Unavailable'
                      : 'Public identity — 3–24 chars: letters, numbers, underscores'}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-slate-300">Bio (Markdown)</label>
                  <div className="flex items-center gap-2">
                    <div className="flex overflow-hidden rounded-lg border border-white/10 text-[10px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setBioTab('write')}
                        className={`px-2 py-0.5 transition-colors ${
                          bioTab === 'write' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Write
                      </button>
                      <button
                        type="button"
                        onClick={() => setBioTab('preview')}
                        className={`px-2 py-0.5 transition-colors ${
                          bioTab === 'preview' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Preview
                      </button>
                    </div>
                    <span className={`font-mono text-[10px] ${bio.length > 450 ? 'text-amber-300' : 'text-slate-500'}`}>
                      {bio.length}/{BIO_LIMIT}
                    </span>
                  </div>
                </div>

                {bioTab === 'write' ? (
                  <>
                    {/* Markdown toolbar — wraps the selection at the caret */}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {BIO_CHIPS.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          title={chip.title}
                          onClick={() => insertBio(chip)}
                          className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 font-mono text-[10px] text-slate-300 transition-colors hover:border-blue-500/50 hover:text-blue-300"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      ref={bioRef}
                      value={bio}
                      maxLength={BIO_LIMIT}
                      rows={4}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder={'What do you build? (bots, APIs, games…)\n\n### Stack\n```ts\nconst api = await fetch("/api/v1/status");\n```'}
                      className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs leading-relaxed text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                      Markdown supported: **bold**, *italic*, `inline code`, fenced code blocks and [links](https://…) —
                      rendered by the same XSS-safe renderer that shows it on your public page.
                    </p>
                  </>
                ) : (
                  <div className="mt-1.5 min-h-[96px] rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2.5 text-left">
                    {bio.trim() ? (
                      <Markdown text={bio} className="text-xs" />
                    ) : (
                      <span className="text-[11px] italic text-slate-500">Nothing to preview yet — write something first.</span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Custom Avatar Image URL</label>
                  <input
                    type="url"
                    placeholder="https://... (or pick a preset below)"
                    value={customAvatarUrl}
                    onChange={(e) => setCustomAvatarUrl(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-mono text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">Upload Real Photo</label>
                  <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-500/40 bg-blue-500/5 py-2.5 text-xs text-blue-300 hover:bg-blue-500/10 transition-colors">
                    <Camera className="h-4 w-4" />
                    <span>Choose photo (auto-resized 256×256)</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              </div>

              {/* Profile accent — tints the banner here and on the public page */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                    <Palette className="h-3.5 w-3.5 text-pink-400" /> Profile Accent
                  </label>
                  <span className="font-mono text-[10px] text-slate-500">{accentHex || 'default gradient'}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {ACCENT_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={`Use ${c}`}
                      onClick={() => setAccent(c)}
                      className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                        accentHex.toLowerCase() === c ? 'border-white scale-110' : 'border-white/20'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <label
                    className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-slate-900 px-2.5 text-[10px] text-slate-300 transition-colors hover:border-white/30"
                    title="Pick any custom colour"
                  >
                    <input
                      type="color"
                      value={accentHex || '#38bdf8'}
                      onChange={(e) => setAccent(e.target.value)}
                      className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                    />
                    Custom
                  </label>
                  <button
                    type="button"
                    onClick={() => setAccent('')}
                    className="h-7 rounded-full border border-white/15 bg-slate-900 px-3 text-[10px] text-slate-400 transition-colors hover:text-slate-200"
                  >
                    Reset
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500">
                  Tints your banner (live preview above) — stored as a server-validated #RRGGBB hex value.
                </p>
              </div>

              {/* One-line status — shown under the name on the hero + /u/ page */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                    <Radio className="h-3.5 w-3.5 text-emerald-400" /> Status line
                  </label>
                  <span className={`font-mono text-[10px] ${statusLine.length > 70 ? 'text-amber-300' : 'text-slate-500'}`}>
                    {statusLine.length}/80
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={80}
                  value={statusLine}
                  onChange={(e) => setStatusLine(e.target.value)}
                  placeholder="🔨 Building a Discord moderation bot"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  One line under your name (80 chars max, emojis welcome) — updates live in the preview above.
                </p>
              </div>

              {/* Published links — label + validated https URL, max 5 */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                    <Link2 className="h-3.5 w-3.5 text-cyan-400" /> Profile links
                  </label>
                  <button
                    type="button"
                    onClick={() => setLinks([...links, { label: '', url: '' }])}
                    disabled={links.length >= 5}
                    className="rounded-lg border border-white/15 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-300 transition-colors hover:border-cyan-400/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    + Add link ({links.length}/5)
                  </button>
                </div>
                {links.length === 0 ? (
                  <p className="mt-1 text-[10px] text-slate-500">
                    No links yet — publish up to 5 (GitHub, portfolio, Discord…). They appear as chips on your public page.
                  </p>
                ) : (
                  <div className="mt-1.5 space-y-1.5">
                    {links.map((l, i) => (
                      <div key={i} className="flex gap-1.5">
                        <input
                          type="text"
                          maxLength={30}
                          value={l.label}
                          placeholder="Label"
                          onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                          className="w-28 shrink-0 rounded-xl border border-white/10 bg-slate-900 px-2.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                        />
                        <input
                          type="url"
                          value={l.url}
                          placeholder="https://..."
                          onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-2.5 py-2 font-mono text-[11px] text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label="Remove link"
                          onClick={() => setLinks(links.filter((_, j) => j !== i))}
                          className="shrink-0 rounded-xl border border-white/10 px-2 text-slate-500 transition-colors hover:border-red-500/40 hover:text-red-300"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-[10px] text-slate-500">
                  https:// URLs only (validated server-side) — never stored or rendered otherwise.
                </p>
              </div>

              {saveError && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-2.5 text-[11px] text-red-300">
                  {saveError}
                </div>
              )}

              <button
                type="submit"
                disabled={saveBlocked}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all cursor-pointer disabled:opacity-60"
              >
                {saved ? <Check className="h-4 w-4 text-emerald-300" /> : <Save className="h-4 w-4" />}
                <span>{saving ? 'Saving…' : saved ? 'Changes Saved!' : 'Save Profile'}</span>
              </button>
            </form>
          </div>

          {/* Account facts (read-only, straight from the server record) */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center gap-2 pb-4 border-b border-white/10">
              <KeyRound className="h-5 w-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Account Details</h3>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Email</p>
                <p className="mt-0.5 truncate text-xs text-slate-200 font-mono" title={user?.email}>{user?.email}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Username</p>
                <p className="mt-0.5 truncate text-xs text-cyan-300 font-mono">
                  {user?.username ? `@${user.username}` : 'unclaimed'}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">User ID</p>
                <p className="mt-0.5 truncate text-xs text-slate-400 font-mono" title={user?.id}>{user?.id}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Role</p>
                <p className="mt-0.5 text-xs font-semibold text-blue-300">{role}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Verification</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-200">
                  <VerifiedBadge type={user?.verification} />
                  {VERIFICATION_LABEL[user?.verification || '']}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Two-factor</p>
                <p className={`mt-0.5 text-xs font-semibold ${user?.twoFactorEnabled ? 'text-emerald-300' : 'text-slate-400'}`}>
                  {user?.twoFactorEnabled ? 'Enabled' : 'Off'}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Created</p>
                <p className="mt-0.5 text-xs text-slate-300">{fmtDateTime(user?.createdAt)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Last login</p>
                <p className="mt-0.5 text-xs text-slate-300">{fmtDateTime(user?.lastLoginAt)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Public profile</p>
                <p className="mt-0.5 truncate text-xs text-slate-300 font-mono">
                  {user?.username ? `/u/${user.username}` : '—'}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Linked sign-ins:</span>
              {(['google', 'github', 'discord'] as const).map((p) => (
                <span
                  key={p}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${
                    user?.connectedAccounts?.[p]
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-white/10 bg-slate-900/60 text-slate-500'
                  }`}
                >
                  {user?.connectedAccounts?.[p] ? `✓ ${p}` : p}
                </span>
              ))}
            </div>
          </div>

          {/* Character Avatar Presets Grid */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Vanitas Character Presets</h3>
              </div>
              <span className="text-xs font-mono text-slate-400">{CHARACTER_AVATARS.length} Available</span>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Click any character portrait to set it as your active identity in the Central API and audit logs:
            </p>

            <div className="mt-4 grid grid-cols-4 sm:grid-cols-5 gap-3 max-h-[460px] overflow-y-auto pr-1">
              {CHARACTER_AVATARS.map((av) => {
                const isSelected = selectedAvatar === av.url && !customAvatarUrl;
                return (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => {
                      setSelectedAvatar(av.url);
                      setCustomAvatarUrl('');
                    }}
                    className={`relative rounded-2xl overflow-hidden border-2 p-0.5 transition-all group ${
                      isSelected
                        ? 'border-blue-400 scale-105 shadow-[0_0_20px_rgba(96,165,250,0.4)]'
                        : 'border-white/10 hover:border-blue-500/40 hover:scale-102'
                    }`}
                  >
                    <img src={av.url} alt={av.name} className="h-20 w-full object-cover rounded-xl" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1 text-center">
                      <p className="text-[9px] font-medium text-slate-200 truncate">{av.name}</p>
                    </div>
                    {isSelected && (
                      <div className="absolute top-1 right-1 rounded-full bg-blue-500 p-0.5 text-white">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* QR modal — a real, scannable code for the public profile link */}
      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setQrOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-3xl border border-white/15 bg-slate-950 p-5 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Your profile QR</h4>
              <button
                type="button"
                onClick={() => setQrOpen(false)}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close QR code"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex h-44 items-center justify-center">
              {qrError ? (
                <p className="text-xs text-red-300">{qrError}</p>
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt="QR code for your public profile" className="h-44 w-44 rounded-xl" />
              ) : (
                <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
              )}
            </div>
            <p className="mt-3 break-all font-mono text-[10px] text-cyan-300">
              {user?.username ? `${window.location.origin}/u/${user.username}` : ''}
            </p>
            <p className="mt-1 text-[10px] text-slate-500">Scan to open your public /u/ page.</p>
          </div>
        </div>
      )}
    </div>
  );
};
