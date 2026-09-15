import { motion } from 'framer-motion';
import { Flame, Play, Heart, TrendingUp, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEngagement } from '@/context/EngagementContext';
import { useAuth } from '@/context/AuthContext';
import { useUserPoints } from '@/hooks/useUserPoints';
import { TierBadge, OgBadge } from '@/components/TierBadge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * What a signed-in person has really done, from the server. The panel used to
 * read plays and the points breakdown from this browser's storage, so logging
 * out or picking up another phone reset them to nothing (N3M3SIS, 13 Sep
 * 2026: "I log out and lose my streak, streams and points").
 */
function useMyActivityTotals(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-activity-totals', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ count: plays }, { data: daily }] = await Promise.all([
        supabase.from('song_analytics').select('id', { count: 'exact', head: true }).eq('user_id', userId!).eq('event_type', 'play'),
        supabase.from('user_points_daily' as never).select('kind, earned').eq('user_id' as never, userId! as never),
      ]);
      const byKind = new Map<string, number>();
      for (const r of ((daily ?? []) as Array<{ kind: string; earned: number }>)) {
        byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + Number(r.earned || 0));
      }
      return {
        plays: plays ?? 0,
        listening: (byKind.get('play') ?? 0) + (byKind.get('pulse') ?? 0),
        likes: byKind.get('like') ?? 0,
        other: [...byKind.entries()].filter(([k]) => !['play', 'pulse', 'like'].includes(k)).reduce((s, [, v]) => s + v, 0),
      };
    },
  });
}

export function EngagementPanel() {
  const { engagementPoints, currentStreak, totalPlays: localPlays, likedSongs, getPointsBreakdown } = useEngagement();
  const { user } = useAuth();
  const { lifetimePoints, tier, isOg, streak } = useUserPoints();
  const { data: server } = useMyActivityTotals(user?.id);
  const local = getPointsBreakdown();
  const totalPlays = user && server ? server.plays : localPlays;
  const breakdown = user && server
    ? { listening: server.listening, likes: server.likes, streak: server.other }
    : local;
  // Signed-in users see the authoritative server balance; signed-out fall back
  // to the local estimate until they create an account and it is imported.
  const displayPoints = user ? lifetimePoints : engagementPoints;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-border"
    >
      <div className="flex items-center gap-2 mb-4 sm:mb-6">
        <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        <h3 className="font-heading font-semibold text-foreground text-sm sm:text-base">Your Activity</h3>
      </div>

      {/* Total Points */}
      <div className="text-center mb-4 sm:mb-6 pb-4 sm:pb-6 border-b border-border">
        <p className="text-2xl sm:text-4xl font-heading font-bold text-gradient mb-1">
          {displayPoints.toLocaleString()}
        </p>
        <p className="text-xs sm:text-sm text-muted-foreground mb-2">Loyalty Points</p>
        {user && (
          <div className="flex items-center justify-center gap-2">
            <TierBadge tier={tier} />
            {isOg && <OgBadge />}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="text-center">
          <div className="w-8 h-8 sm:w-10 sm:h-10 mx-auto rounded-full bg-orange-500/10 flex items-center justify-center mb-1.5 sm:mb-2">
            <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
          </div>
          <p className="text-base sm:text-lg font-semibold text-foreground">{user ? streak : currentStreak}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Day Streak</p>
        </div>
        <div className="text-center">
          <div className="w-8 h-8 sm:w-10 sm:h-10 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-1.5 sm:mb-2">
            <Play className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          <p className="text-base sm:text-lg font-semibold text-foreground">{totalPlays}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Songs Played</p>
        </div>
        <div className="text-center">
          <div className="w-8 h-8 sm:w-10 sm:h-10 mx-auto rounded-full bg-pink-500/10 flex items-center justify-center mb-1.5 sm:mb-2">
            <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-pink-500" />
          </div>
          <p className="text-base sm:text-lg font-semibold text-foreground">{likedSongs.size}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Liked Songs</p>
        </div>
      </div>

      {/* Points Breakdown */}
      <div className="space-y-1.5 sm:space-y-2">
        <h4 className="text-xs sm:text-sm font-medium text-foreground mb-2 sm:mb-3">Points Breakdown</h4>
        <div className="flex justify-between text-xs sm:text-sm">
          <span className="text-muted-foreground">Listening</span>
          <span className="text-foreground">+{breakdown.listening}</span>
        </div>
        <div className="flex justify-between text-xs sm:text-sm">
          <span className="text-muted-foreground">Likes</span>
          <span className="text-foreground">+{breakdown.likes}</span>
        </div>
        <div className="flex justify-between text-xs sm:text-sm">
          <span className="text-muted-foreground">{user && server ? 'Votes and more' : 'Streak Bonus'}</span>
          <span className="text-foreground">+{breakdown.streak}</span>
        </div>
      </div>

      {/* Leaderboard link + what points are for */}
      <Link
        to="/leaderboard"
        className="mt-4 sm:mt-6 flex items-center justify-center gap-2 rounded-lg sm:rounded-xl bg-primary/10 border border-border py-2.5 text-xs sm:text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
      >
        <Trophy className="w-4 h-4" /> View Top Fans
      </Link>
      <div className="mt-3 p-3 sm:p-4 rounded-lg sm:rounded-xl bg-primary/5 border border-border">
        <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
          Points come from real listening, so they cannot be faked. Top fans get first look at new song coins and battle rewards. Keep listening.
        </p>
      </div>
    </motion.div>
  );
}
