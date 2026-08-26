import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { CHARACTER_AVATARS, BRAND_ASSETS } from '../../data/assets.ts';
import {
  User,
  Shield,
  CheckCircle2,
  Sparkles,
  Camera,
  Save,
  Check,
} from 'lucide-react';

export const ProfileView: React.FC = () => {
  const { user, role, updateUserProfile } = useAuth();
  const [name, setName] = useState(user?.name || 'Sovereign Administrator');
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatarUrl || CHARACTER_AVATARS[0].url);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserProfile({
      name,
      avatarUrl: customAvatarUrl.trim() || selectedAvatar,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <User className="h-6 w-6 text-blue-400" />
          <h1 className="text-xl sm:text-2xl font-bold text-white">Identity & Character Avatars</h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Customize your developer profile and select from curated Vanitas character identity presets.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Profile Card & Editor (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl shadow-2xl text-center">
            <div className="relative mx-auto h-28 w-28 rounded-2xl overflow-hidden border-2 border-blue-500/40 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
              <img
                src={customAvatarUrl.trim() || selectedAvatar}
                alt="Active Avatar"
                className="h-full w-full object-cover"
              />
            </div>

            <h2 className="mt-4 text-base font-bold text-white">{name}</h2>
            <p className="font-mono text-xs text-slate-400">{user?.email || 'sovereign.empirex@gmail.com'}</p>

            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 px-3 py-1 text-xs font-mono font-bold text-blue-300">
              <Shield className="h-3.5 w-3.5" />
              <span>{role} PRIVILEGES</span>
            </div>

            <form onSubmit={handleSave} className="mt-6 space-y-4 text-left border-t border-white/10 pt-5">
              <div>
                <label className="block text-xs font-medium text-slate-300">Display Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Custom Avatar Image URL</label>
                <input
                  type="url"
                  placeholder="https://... (or choose from presets)"
                  value={customAvatarUrl}
                  onChange={(e) => setCustomAvatarUrl(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-mono text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all cursor-pointer"
              >
                {saved ? <Check className="h-4 w-4 text-emerald-300" /> : <Save className="h-4 w-4" />}
                <span>{saved ? 'Changes Saved!' : 'Save Identity Profile'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right: Character Avatar Presets Grid (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
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
                    <img
                      src={av.url}
                      alt={av.name}
                      className="h-20 w-full object-cover rounded-xl"
                    />
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
