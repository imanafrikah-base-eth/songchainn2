import { useState, useCallback } from 'react';
import { ShieldCheck, Copy, Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnchainVerifiedBadgeProps {
  coinAddress: string;
  className?: string;
  size?: 'sm' | 'md';
}

const EXPLORER_BASE = 'https://basescan.org/address/';

export function OnchainVerifiedBadge({ coinAddress, className, size = 'sm' }: OnchainVerifiedBadgeProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(coinAddress);
      } else {
        const el = document.createElement('textarea');
        el.value = coinAddress;
        el.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable -- the explorer link still works as a fallback
    }
  }, [coinAddress]);

  const sizeClasses = size === 'sm' ? 'text-[10px] px-2 py-0.5 gap-1' : 'text-xs px-2.5 py-1 gap-1.5';
  const iconSize = size === 'sm' ? 10 : 12;
  const truncated = `${coinAddress.slice(0, 6)}...${coinAddress.slice(-4)}`;

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 backdrop-blur-sm',
        sizeClasses,
        className
      )}
      title="This song's coin is minted onchain. Tap to verify on BaseScan."
    >
      <ShieldCheck size={iconSize} />
      <a
        href={`${EXPLORER_BASE}${coinAddress}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="font-mono hover:underline underline-offset-2 inline-flex items-center gap-0.5"
      >
        {truncated}
        <ExternalLink size={iconSize - 2} />
      </a>
      <button
        type="button"
        onClick={copyAddress}
        className="hover:text-emerald-100 transition-colors"
        aria-label="Copy coin address"
      >
        {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
      </button>
    </span>
  );
}
