// A citizen, drawn.
//
// Every avatar in this world is a few numbers rendered as SVG rather than an
// image someone downloads. That is not a compromise, it is the point: a
// citizen costs no bytes, appears instantly on a bad connection, works with no
// network at all, and adding the next look is a shape rather than a commission.
// On a street with forty people standing in it, forty portraits would be the
// heaviest thing on the page.

import { hexForOutfit, hexForSkin, type AvatarConfig } from '../avatars';

function Hair({ style, tone }: { style: string; tone: string }) {
  switch (style) {
    case 'afro':
      return <circle cx="32" cy="20" r="14" fill={tone} />;
    case 'braids':
      return (
        <g fill={tone}>
          <path d="M18 22a14 14 0 0 1 28 0v3H18z" />
          <rect x="17" y="24" width="3.4" height="17" rx="1.7" />
          <rect x="23" y="25" width="3.4" height="13" rx="1.7" />
          <rect x="37.6" y="25" width="3.4" height="13" rx="1.7" />
          <rect x="43.6" y="24" width="3.4" height="17" rx="1.7" />
        </g>
      );
    case 'locs':
      return (
        <g fill={tone}>
          <path d="M18 22a14 14 0 0 1 28 0v2H18z" />
          <rect x="16" y="23" width="4.2" height="24" rx="2.1" />
          <rect x="22.5" y="24" width="4.2" height="19" rx="2.1" />
          <rect x="37.3" y="24" width="4.2" height="19" rx="2.1" />
          <rect x="43.8" y="23" width="4.2" height="24" rx="2.1" />
        </g>
      );
    case 'wrap':
      return (
        <g>
          <path d="M17 21a15 15 0 0 1 30 0v4H17z" fill={tone} />
          <path d="M17 19h30v3.5H17z" fill="#ffffff" opacity="0.28" />
          <path d="M44 16c5 2 7 6 6 10-3-3-6-4-9-4z" fill={tone} />
        </g>
      );
    case 'fade':
    default:
      return <path d="M20 21a12 12 0 0 1 24 0v2H20z" fill={tone} />;
  }
}

function Accessory({ style, outfit }: { style: string; outfit: string }) {
  switch (style) {
    case 'cap':
      return (
        <g>
          <path d="M18 22a14 14 0 0 1 28 0v2H18z" fill={outfit} />
          <path d="M44 22h10a2 2 0 0 1 0 4H44z" fill={outfit} opacity="0.85" />
        </g>
      );
    case 'shades':
      return (
        <g fill="#0b0b12">
          <rect x="21" y="27" width="9" height="6.5" rx="2" />
          <rect x="34" y="27" width="9" height="6.5" rx="2" />
          <rect x="29.6" y="29.4" width="5" height="1.6" />
        </g>
      );
    case 'chain':
      return (
        <g>
          <path
            d="M26 47c2.6 4 9.4 4 12 0"
            stroke="#C9A227"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="32" cy="50.4" r="2.2" fill="#C9A227" />
        </g>
      );
    case 'crown':
      return (
        <g fill="#C9A227">
          <path d="M20 20l4-8 4 6 4-8 4 8 4-6 4 8z" />
          <rect x="20" y="19.5" width="24" height="3.4" rx="1.2" />
        </g>
      );
    case 'none':
    default:
      return null;
  }
}

export function CitizenAvatar({
  config,
  size = 64,
  className,
  title,
}: {
  config: AvatarConfig;
  size?: number;
  className?: string;
  /** Accessible name. Omit for decorative use beside a visible name. */
  title?: string;
}) {
  const skin = hexForSkin(config.skin);
  const outfit = hexForOutfit(config.outfit);
  // Hair reads as a darker relative of the skin so every combination holds
  // together without a separate palette to pick from.
  const hairTone = '#1b1410';

  return (
    <svg
      viewBox="0 0 64 72"
      width={size}
      height={(size * 72) / 64}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* Shoulders */}
      <path d="M12 72c0-11 9-18 20-18s20 7 20 18z" fill={outfit} />
      {/* Neck */}
      <rect x="28" y="42" width="8" height="12" rx="3" fill={skin} />
      {/* Head */}
      <ellipse cx="32" cy="30" rx="13" ry="14.5" fill={skin} />
      <Hair style={config.hair} tone={hairTone} />
      {/* Eyes, only when nothing covers them */}
      {config.accessory !== 'shades' && (
        <g fill="#1b1410">
          <circle cx="26.5" cy="30.5" r="1.7" />
          <circle cx="37.5" cy="30.5" r="1.7" />
        </g>
      )}
      <Accessory style={config.accessory} outfit={outfit} />
    </svg>
  );
}
