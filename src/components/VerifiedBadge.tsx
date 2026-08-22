import { useId } from 'react';

/**
 * The SONGCHAINN verified badge.
 *
 * Drawn as inline SVG rather than shipped as an image: it stays razor sharp at
 * any size and on any pixel density, costs no network request, and works
 * offline in the PWA. The 3D read comes from four stacked cues, the way a real
 * embossed badge catches light: a radial base gradient lit from the top left,
 * a soft inner shadow at the bottom right, a bevelled rim, and a specular
 * highlight arc across the top.
 */

export type VerifiedBadgeProps = {
  /** Rendered width and height in pixels. */
  size?: number;
  /** 'gold' for the founding catalog, 'blue' for a claimed page. */
  tone?: 'gold' | 'blue';
  className?: string;
  /** Accessible label. Set null to hide it from screen readers entirely. */
  title?: string | null;
};

const TONES = {
  gold: {
    light: '#FFE9A8',
    mid: '#F5B942',
    deep: '#B4740C',
    rim: '#FFF6D8',
    glow: '#F5B942',
  },
  blue: {
    light: '#BFE4FF',
    mid: '#3B9BF5',
    deep: '#0B4FA8',
    rim: '#E4F2FF',
    glow: '#3B9BF5',
  },
} as const;

export function VerifiedBadge({
  size = 20,
  tone = 'gold',
  className,
  title = 'Verified artist',
}: VerifiedBadgeProps) {
  // useId keeps gradient ids unique when several badges render on one page.
  // Without it the first badge's defs win and every later badge renders flat.
  const uid = useId().replace(/:/g, '');
  const c = TONES[tone];

  const base = `base-${uid}`;
  const rim = `rim-${uid}`;
  const spec = `spec-${uid}`;
  const inner = `inner-${uid}`;
  const tick = `tick-${uid}`;

  // Twelve-point scalloped rosette, the classic verification silhouette.
  const points = 12;
  const petals = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    return `${(50 + Math.cos(a) * 42).toFixed(2)},${(50 + Math.sin(a) * 42).toFixed(2)}`;
  }).join(' ');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <defs>
        {/* Lit from the top left, falling away to a deep edge bottom right. */}
        <radialGradient id={base} cx="34%" cy="28%" r="78%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="45%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.deep} />
        </radialGradient>

        <linearGradient id={rim} x1="0%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stopColor={c.rim} stopOpacity="0.95" />
          <stop offset="50%" stopColor={c.mid} stopOpacity="0.25" />
          <stop offset="100%" stopColor={c.deep} stopOpacity="0.9" />
        </linearGradient>

        {/* Specular sheen across the upper third. */}
        <linearGradient id={spec} x1="20%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={tick} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#EAF1F8" />
        </linearGradient>

        {/* Inner shadow: blur the shape, offset it, and keep only what falls
            inside, which is what gives the face its dished, pressed look. */}
        <filter id={inner} x="-30%" y="-30%" width="160%" height="160%">
          <feOffset dx="0" dy="2.5" in="SourceAlpha" result="off" />
          <feGaussianBlur in="off" stdDeviation="2.6" result="blur" />
          <feComposite in="SourceAlpha" in2="blur" operator="out" result="cut" />
          <feFlood floodColor={c.deep} floodOpacity="0.55" result="col" />
          <feComposite in="col" in2="cut" operator="in" result="shade" />
          <feComposite in="shade" in2="SourceGraphic" operator="over" />
        </filter>
      </defs>

      <g>
        {/* Contact shadow so the badge sits on the surface instead of floating. */}
        <polygon points={petals} fill={c.deep} opacity="0.28" transform="translate(0 3.5)" />

        {/* Body. */}
        <polygon points={petals} fill={`url(#${base})`} filter={`url(#${inner})`} />

        {/* Bevelled rim. */}
        <polygon
          points={petals}
          fill="none"
          stroke={`url(#${rim})`}
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {/* Raised inner disc. */}
        <circle cx="50" cy="50" r="33" fill={c.mid} opacity="0.35" />
        <circle cx="50" cy="49" r="33" fill={`url(#${base})`} opacity="0.55" />

        {/* Specular arc, clipped to the top of the disc. */}
        <path d="M20 44 A32 32 0 0 1 80 40 A34 34 0 0 0 20 44 Z" fill={`url(#${spec})`} />

        {/* The tick. Dark copy underneath, offset down, reads as depth. */}
        <path
          d="M34 51.5 L45 62.5 L67 40.5"
          fill="none"
          stroke={c.deep}
          strokeOpacity="0.45"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(0 2.4)"
        />
        <path
          d="M34 51.5 L45 62.5 L67 40.5"
          fill="none"
          stroke={`url(#${tick})`}
          strokeWidth="9.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export default VerifiedBadge;
