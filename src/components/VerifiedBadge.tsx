import React from 'react';
import { BadgeCheck, Wrench, ShieldCheck } from 'lucide-react';

/**
 * Verification badge shown next to a user's name — our own take on the
 * Meta/TikTok verified check with three tiers: USER (verified member),
 * DEVELOPER (builder) and ADMIN (staff). Only admins can grant them
 * (PATCH /api/v1/admin/users/:id/verification).
 */
type BadgeKind = 'USER' | 'DEVELOPER' | 'ADMIN';

const BADGE_STYLE: Record<
  BadgeKind,
  { icon: React.ElementType; classes: string; label: string; title: string }
> = {
  USER: {
    icon: BadgeCheck,
    classes: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
    label: 'Verified',
    title: 'Verified account',
  },
  DEVELOPER: {
    icon: Wrench,
    classes: 'text-violet-400 bg-violet-500/15 border-violet-500/30',
    label: 'Developer',
    title: 'Developer badge — granted by an administrator',
  },
  ADMIN: {
    icon: ShieldCheck,
    classes: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
    label: 'Admin',
    title: 'Administrator badge — granted by an administrator',
  },
};

export const VerifiedBadge: React.FC<{
  type?: string | null;
  /** Show the word next to the icon (profile card); default = icon only. */
  label?: boolean;
  className?: string;
}> = ({ type, label = false, className = '' }) => {
  if (!type || !(type in BADGE_STYLE)) return null;
  const style = BADGE_STYLE[type as BadgeKind];
  const Icon = style.icon;
  return (
    <span
      title={style.title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${style.classes} ${className}`}
    >
      <Icon className="h-3 w-3" />
      {label && <span>{style.label}</span>}
    </span>
  );
};
