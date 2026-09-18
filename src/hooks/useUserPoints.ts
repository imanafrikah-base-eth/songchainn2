import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export type PointsTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface UserPoints {
  points: number;
  lifetimePoints: number;
  tier: PointsTier;
  isOg: boolean;
  legacyClaimed: boolean;
  /** Consecutive days with activity, counted server-side from user_points_daily. */
  streak: number;
}

function tierFromLifetime(lifetime: number): PointsTier {
  if (lifetime >= 10000) return 'Platinum';
  if (lifetime >= 2500) return 'Gold';
  if (lifetime >= 750) return 'Silver';
  return 'Bronze';
}

/**
 * Server-authoritative points for the signed-in user, read from the ledger the
 * DB triggers maintain.
 *
 * This used to import a pre-Phase-Two localStorage balance on first run by
 * handing the RPC whatever number the browser held. "Capped and idempotent"
 * still meant anybody could type 50,000 into devtools once and walk in as
 * Platinum with the OG badge. The S6 Security seat proved it live on 18 Sep
 * 2026. The import is closed: the RPC now awards nothing, and nothing here
 * calls it.
 */
export function useUserPoints() {
  const { user } = useAuth();

  const query = useQuery<UserPoints | null>({
    queryKey: ['user-points', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      // The streak rides along with the points because the two are shown
      // together everywhere, and because until now the streak was a constant
      // that never moved: it was initialised to 1 and never set again, so every
      // user has been looking at "1" since the day they joined. It is counted
      // from user_points_daily now, which is a real record of the days somebody
      // showed up.
      const [{ data }, { data: streak }] = await Promise.all([
        (supabase as any)
          .from('user_points')
          .select('points, lifetime_points, is_og, legacy_claimed')
          .eq('user_id', user.id)
          .maybeSingle(),
        (supabase as any).rpc('get_my_streak'),
      ]);
      const lifetime = Number(data?.lifetime_points ?? 0);
      return {
        points: Number(data?.points ?? 0),
        lifetimePoints: lifetime,
        tier: tierFromLifetime(lifetime),
        isOg: Boolean(data?.is_og),
        legacyClaimed: Boolean(data?.legacy_claimed),
        streak: Number(streak ?? 0),
      };
    },
    staleTime: 15_000,
  });

  return {
    points: query.data?.points ?? 0,
    lifetimePoints: query.data?.lifetimePoints ?? 0,
    tier: query.data?.tier ?? 'Bronze',
    isOg: query.data?.isOg ?? false,
    streak: query.data?.streak ?? 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  lifetimePoints: number;
  tier: PointsTier;
  isOg: boolean;
}

export function usePointsLeaderboard(limit = 50) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['points-leaderboard', limit],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_points_leaderboard', { _limit: limit });
      if (error || !Array.isArray(data)) return [];
      return data.map((row: any) => ({
        rank: Number(row.rank),
        userId: String(row.user_id),
        displayName: row.display_name || 'Listener',
        avatarUrl: row.avatar_url || null,
        lifetimePoints: Number(row.lifetime_points ?? 0),
        tier: tierFromLifetime(Number(row.lifetime_points ?? 0)),
        isOg: Boolean(row.is_og),
      }));
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
