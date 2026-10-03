import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { CHARACTER_AVATARS } from '../../data/assets.ts';
import { api } from '../../lib/apiClient.ts';
import { VerifiedBadge } from '../VerifiedBadge.tsx';
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
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Profile & identity: hero card (name, @username, badges, bio, real account
// facts) + editor (claim your @username with live availability, bio, avatar)
// + read-only account details + the existing character preset gallery.
// ---------------------------------------------------------------------------

type AvailState = { checking: boolean; available: boolean; reason?: string } | null;

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
  const usernameRef = useRef<HTMLInputElement>(null);

  const currentUsername = (user?.username || '').toLowerCase();
  const usernameDirty = usernameInput.trim().toLowerCase() !== currentUsername;
  const connectedCount = user ? Object.values(user.connectedAccounts).filter(Boolean).length : 0;

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
    // Persisted server-side on the real account record (PostgreSQL).
    const result = await updateUserProfile({
      name,
      avatarUrl: customAvatarUrl.trim() || selectedAvatar,
      ...(usernameDirty ? { username: usernameInput.trim().toLowerCase() } : {}),
      bio,
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
            {/* Gradient banner */}
            <div className="relative h-24 bg-gradient-to-r from-blue-600/50 via-cyan-500/35 to-purple-600/45">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_45%)]" />
            </div>

            <div className="px-6 pb-6 -mt-12 text-center">
              <div className="relative mx-auto h-24 w-24 rounded-2xl overflow-hidden border-4 border-slate-950 shadow-[0_0_30px_rgba(59,130,246,0.35)] bg-slate-900">
                <img src={customAvatarUrl.trim() || selectedAvatar} alt={name} className="h-full w-full object-cover" />
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

              {user?.bio ? (
                <p className="mt-3 text-xs leading-relaxed text-slate-300">{user.bio}</p>
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
              </div>

              {/* Shareable public profile link (only real once a username exists) */}
              {user?.username ? (
                <button
                  type="button"
                  onClick={copyProfileLink}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 py-2 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-500/20"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Link copied!' : `Copy public profile link`}
                </button>
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
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-300">Bio</label>
                  <span className={`font-mono text-[10px] ${bio.length > 180 ? 'text-amber-300' : 'text-slate-500'}`}>
                    {bio.length}/200
                  </span>
                </div>
                <textarea
                  value={bio}
                  maxLength={200}
                  rows={3}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="What do you build? (bots, APIs, games…)"
                  className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs leading-relaxed text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
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
    </div>
  );
};
