import { Sparkles } from 'lucide-react';
import type { PointsTier } from '@/hooks/useUserPoints';

const TIER_STYLES: Record<PointsTier, string> = {
  Bronze: 'text-amber-600 border-amber-600/40 bg-amber-600/10',
  Silver: 'text-slate-300 border-slate-300/40 bg-slate-300/10',
  Gold: 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10',
  Platinum: 'text-cyan-300 border-cyan-300/40 bg-cyan-300/10',
};

export function TierBadge({ tier, size = 'md' }: { tier: PointsTier; size?: 'sm' | 'md' }) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-semibold ${pad} ${TIER_STYLES[tier]}`}>
      {tier}
    </span>
  );
}

export function OgBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 text-primary font-semibold ${pad}`}>
      <Sparkles className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} /> OG
    </span>
  );
}
