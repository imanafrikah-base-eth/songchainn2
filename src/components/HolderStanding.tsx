import { motion } from 'framer-motion';
import { Crown, TrendingUp, RefreshCw, Heart } from 'lucide-react';
import { useState } from 'react';
import { useHolderProfile, TIER_LABEL, TIER_BLURB } from '@/hooks/useHolderProfile';
import { cn } from '@/lib/utils';

/**
 * Where you stand as a holder, and what it is currently getting you.
 *
 * This replaces the unlock pitch at the top of the marketplace. Unlocking sold
 * access to a song; the world gate does access now. What is actually worth
 * saying to someone is that keeping an artist's record pays them, pays you, and
 * puts your name on a board.
 */

const TIER_RING: Record<string, string> = {
  none: 'border-border',
  supporter: 'border-emerald-500/40',
  backer: 'border-sky-500/40',
  patron: 'border-violet-500/40',
  cornerstone: 'border-amber-500/50',
};

export function HolderStanding({ className }: { className?: string }) {
  const { profile, isLoading, refreshFromChain } = useHolderProfile();
  const [refreshing, setRefreshing] = useState(false);

  if (isLoading) return null;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshFromChain();
    } finally {
      setRefreshing(false);
    }
  };

  const toNext = profile.next_tier_at ? profile.next_tier_at - profile.songs_held : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-2xl border bg-card/60 p-5 backdrop-blur',
        TIER_RING[profile.tier] ?? 'border-border',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Your standing
          </p>
          <h3 className="text-xl font-bold text-foreground">{TIER_LABEL[profile.tier]}</h3>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Checking chain' : 'Refresh'}
        </button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">{TIER_BLURB[profile.tier]}</p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <p className="text-2xl font-bold text-foreground tabular-nums">{profile.songs_held}</p>
          <p className="text-[11px] text-muted-foreground">songs held</p>
        </div>
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <p className="text-2xl font-bold text-foreground tabular-nums">{profile.artists_backed}</p>
          <p className="text-[11px] text-muted-foreground">artists backed</p>
        </div>
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <p className="text-2xl font-bold text-primary tabular-nums">
            {profile.multiplier.toFixed(2)}x
          </p>
          <p className="text-[11px] text-muted-foreground">on every point</p>
        </div>
      </div>

      {profile.top_fan_of.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Crown size={14} className="text-amber-400" />
            <p className="text-xs font-bold text-amber-400">
              Top Fan of {profile.top_fan_of.length === 1 ? '' : `${profile.top_fan_of.length} artists`}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {profile.top_fan_of.map((t) => t.artist_name).join(', ')}. Nobody is holding more of
            their catalogue than you. Sell and you hand the seat to whoever is second.
          </p>
        </div>
      )}

      {profile.next_tier_at && toNext > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TrendingUp size={13} className="text-primary shrink-0" />
          <span>
            {toNext} more {toNext === 1 ? 'song' : 'songs'} and every point you earn is worth more
            again.
          </span>
        </div>
      )}

      {profile.songs_held === 0 && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Heart size={13} className="text-primary shrink-0 mt-0.5" />
          <span>
            Holding a song is money the artist keeps. It is the most direct thing you can do for
            them here, and it pays you back in points, badges and doors that open in their world.
          </span>
        </div>
      )}
    </motion.div>
  );
}
