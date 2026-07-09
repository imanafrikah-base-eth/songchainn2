import { Link } from 'react-router-dom';
import { ArrowLeft, Trophy, Crown } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { usePointsLeaderboard, useUserPoints } from '@/hooks/useUserPoints';
import { TierBadge, OgBadge } from '@/components/TierBadge';
import { useAuth } from '@/context/AuthContext';

const rankColor = (rank: number) => {
  if (rank === 1) return 'text-yellow-400';
  if (rank === 2) return 'text-slate-300';
  if (rank === 3) return 'text-amber-600';
  return 'text-muted-foreground';
};

const Leaderboard = () => {
  const { user } = useAuth();
  const { data: entries = [], isLoading } = usePointsLeaderboard(100);
  const { lifetimePoints, tier, isOg } = useUserPoints();

  return (
    <div className="min-h-screen bg-background pb-28">
      <Navigation />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Trophy className="h-7 w-7 text-primary" />
          <h1 className="font-heading text-3xl font-bold text-foreground">Top Fans</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Points come from real listening, likes, and battle votes. The more you move the music, the higher you climb.
        </p>

        {user && (
          <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Your standing</p>
              <p className="text-2xl font-heading font-bold text-gradient">{lifetimePoints.toLocaleString()} pts</p>
            </div>
            <div className="flex items-center gap-2">
              {isOg && <OgBadge />}
              <TierBadge tier={tier} />
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-10">Loading top fans...</p>
          )}
          {!isLoading && entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">No points yet. Be the first, start listening.</p>
          )}
          {entries.map((e) => (
            <div
              key={e.userId}
              className={`flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 ${
                e.userId === user?.id ? 'bg-primary/5' : ''
              }`}
            >
              <div className={`w-7 text-center font-heading font-bold ${rankColor(e.rank)}`}>
                {e.rank <= 3 ? <Crown className="h-4 w-4 mx-auto" /> : e.rank}
              </div>
              <div className="h-9 w-9 rounded-full bg-muted overflow-hidden flex items-center justify-center text-sm font-bold shrink-0">
                {e.avatarUrl ? (
                  <img src={e.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  (e.displayName || '?').charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                  {e.displayName}
                  {e.isOg && <OgBadge size="sm" />}
                </p>
                <div className="mt-0.5"><TierBadge tier={e.tier} size="sm" /></div>
              </div>
              <p className="text-sm font-semibold text-foreground shrink-0">{e.lifetimePoints.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
      <AudioPlayer />
    </div>
  );
};

export default Leaderboard;
