import { motion } from 'framer-motion';
import { Flame, Play, Heart, TrendingUp, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEngagement } from '@/context/EngagementContext';
import { useAuth } from '@/context/AuthContext';
import { useUserPoints } from '@/hooks/useUserPoints';
import { TierBadge, OgBadge } from '@/components/TierBadge';

export function EngagementPanel() {
  const { engagementPoints, currentStreak, totalPlays, likedSongs, getPointsBreakdown } = useEngagement();
  const { user } = useAuth();
  const { lifetimePoints, tier, isOg } = useUserPoints();
  const breakdown = getPointsBreakdown();
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
          <p className="text-base sm:text-lg font-semibold text-foreground">{currentStreak}</p>
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
          <span className="text-muted-foreground">Streak Bonus</span>
          <span className="text-foreground">+{breakdown.streak}</span>
        </div>
      </div>

      {/* Leaderboard link + Phase Two promise */}
      <Link
        to="/leaderboard"
        className="mt-4 sm:mt-6 flex items-center justify-center gap-2 rounded-lg sm:rounded-xl bg-primary/10 border border-primary/20 py-2.5 text-xs sm:text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
      >
        <Trophy className="w-4 h-4" /> View Top Fans
      </Link>
      <div className="mt-3 p-3 sm:p-4 rounded-lg sm:rounded-xl bg-primary/5 border border-primary/10">
        <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
          Your points are your head start in Phase Two: top fans get early access to new song coins and battle rewards. Keep listening.
        </p>
      </div>
    </motion.div>
  );
}
