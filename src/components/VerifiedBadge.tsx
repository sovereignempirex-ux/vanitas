import React from 'react';

// ---------------------------------------------------------------------------
// Verification badges — custom-drawn SVG shapes (no emoji, no words), our own
// take on the Meta/TikTok check with three distinct SILHOUETTES:
//   USER       scalloped seal + check   (blue)
//   DEVELOPER  pointed hexagon + </>    (violet)
//   ADMIN      crest shield + star      (gold)
// Granted only via PATCH /api/v1/admin/users/:id/verification (admins).
// ---------------------------------------------------------------------------

type BadgeKind = 'USER' | 'DEVELOPER' | 'ADMIN';

/** Scalloped seal: points around a circle joined by outward-bowed curves. */
function sealPath(bumps = 11, r = 10.6, bow = 1.18): string {
  const c = 12;
  const pt = (i: number): [number, number] => {
    const a = (i / bumps) * Math.PI * 2 - Math.PI / 2;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const s = pt(0);
  let d = `M ${s[0].toFixed(2)} ${s[1].toFixed(2)}`;
  for (let i = 1; i <= bumps; i++) {
    const [x, y] = pt(i);
    const [px, py] = pt(i - 1);
    const qx = c + ((px + x) / 2 - c) * bow;
    const qy = c + ((py + y) / 2 - c) * bow;
    d += ` Q ${qx.toFixed(2)} ${qy.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d} Z`;
}

const SEAL_D = sealPath();

const HEX_D = 'M12 1.4 L21.18 6.7 L21.18 17.3 L12 22.6 L2.82 17.3 L2.82 6.7 Z';

const SHIELD_D =
  'M12 1.6 L21.2 5.3 V11.6 C21.2 17.1 17.4 21.2 12 22.8 C6.6 21.2 2.8 17.1 2.8 11.6 V5.3 Z';

const STAR_D =
  'M12 6.9 L13.26 10.16 L16.75 10.35 L14.04 12.56 L14.94 15.95 L12 14.05 L9.06 15.95 L9.96 12.56 L7.25 10.35 L10.74 10.16 Z';

const KINDS: Record<
  BadgeKind,
  {
    shape: string;
    from: string;
    to: string;
    inner: React.ReactNode;
    label: string;
    title: string;
  }
> = {
  USER: {
    shape: SEAL_D,
    from: '#4CA6FF',
    to: '#1554E6',
    inner: (
      <path
        d="M7.6 12.3 L10.5 15.2 L16.4 8.9"
        fill="none"
        stroke="#ffffff"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    label: 'Verified account',
    title: 'Verified account — حساب موثَّق',
  },
  DEVELOPER: {
    shape: HEX_D,
    from: '#C27AFF',
    to: '#7C3AED',
    inner: (
      <g fill="none" stroke="#ffffff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.2 9.3 L7.2 12 L10.2 14.7" />
        <path d="M13.8 9.3 L16.8 12 L13.8 14.7" />
        <path d="M12.9 8.1 L11.1 15.9" />
      </g>
    ),
    label: 'Developer badge',
    title: 'Developer badge — شارة مطوّر',
  },
  ADMIN: {
    shape: SHIELD_D,
    from: '#FFC94D',
    to: '#D97706',
    inner: <path d={STAR_D} fill="#ffffff" />,
    label: 'Administrator badge',
    title: 'Administrator badge — شارة أدمن',
  },
};

export const VerifiedBadge: React.FC<{
  type?: string | null;
  /** Extra sizing/positioning classes — the shape itself is wordless. */
  className?: string;
}> = ({ type, className = '' }) => {
  const uid = React.useId().replace(/:/g, '');
  if (!type || !(type in KINDS)) return null;
  const kind = KINDS[type as BadgeKind];
  const gid = `vnt-badge-${uid}`;
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={kind.label}
      className={`inline-block h-3.5 w-3.5 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] ${className}`}
    >
      <title>{kind.title}</title>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={kind.from} />
          <stop offset="100%" stopColor={kind.to} />
        </linearGradient>
      </defs>
      <path d={kind.shape} fill={`url(#${gid})`} />
      {kind.inner}
    </svg>
  );
};

export default VerifiedBadge;
