import { ShieldCheck, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnchainVerifiedBadgeProps {
  coinAddress: string;
  className?: string;
  size?: 'sm' | 'md';
}

const EXPLORER_BASE = 'https://basescan.org/address/';

/**
 * The proof, and one thing to do with it.
 *
 * This badge says a song's coin is really on Base, and the only useful answer
 * to "says who" is the chain itself, so the whole pill opens that coin on
 * Basescan and nothing else.
 *
 * It used to carry a copy-to-clipboard button as well. Two problems with that,
 * one for the person and one for the browser. Copying a contract address is
 * something a handful of people ever want and everybody else has to look at,
 * next to the one control that actually answers the question. And the badge
 * sits inside song cards that are themselves buttons, so a button in there put
 * a button inside a button: invalid HTML that React warned about on every
 * render, and a control that assistive technology cannot describe. Dropping it
 * fixes both, and anyone who wants the address can copy it off Basescan, which
 * is where they were going to check it anyway.
 */
export function OnchainVerifiedBadge({ coinAddress, className, size = 'sm' }: OnchainVerifiedBadgeProps) {
  const sizeClasses = size === 'sm' ? 'min-h-8 text-[10px] px-2.5 py-0.5 gap-1' : 'min-h-9 text-xs px-3 py-1 gap-1.5';
  const iconSize = size === 'sm' ? 10 : 12;
  const truncated = `${coinAddress.slice(0, 6)}...${coinAddress.slice(-4)}`;

  return (
    <a
      href={`${EXPLORER_BASE}${coinAddress}`}
      target="_blank"
      rel="noopener noreferrer"
      /* The badge lives inside cards that are clickable in their own right, so
         opening the explorer must never also play the song underneath. */
      onClick={(e) => e.stopPropagation()}
      title="This song's coin is live on Base. Open it on Basescan."
      aria-label={`View this song's coin ${coinAddress} on Basescan`}
      className={cn(
        'inline-flex items-center font-medium rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 backdrop-blur-sm transition-colors hover:border-emerald-400/70 hover:bg-emerald-500/20',
        sizeClasses,
        className
      )}
    >
      <ShieldCheck size={iconSize} />
      <span className="font-mono">{truncated}</span>
      <ExternalLink size={iconSize - 2} />
    </a>
  );
}
