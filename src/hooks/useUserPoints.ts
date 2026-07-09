import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export type PointsTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface UserPoints {
  points: number;
  lifetimePoints: number;
  tier: PointsTier;
  isOg: boolean;
  legacyClaimed: boolean;
}

const LEGACY_POINTS_KEY = 'songchainn_points';
const LEGACY_CLAIM_FLAG = 'songchainn_legacy_points_claimed_v1';

function tierFromLifetime(lifetime: number): PointsTier {
  if (lifetime >= 10000) return 'Platinum';
  if (lifetime >= 2500) return 'Gold';
  if (lifetime >= 750) return 'Silver';
  return 'Bronze';
}

/**
 * Server-authoritative points for the signed-in user. On first run for a user
 * it imports their pre-Phase-Two localStorage balance exactly once (the RPC is
 * capped and idempotent, so a tampered client cannot mint points), then reads
 * the real balance from the ledger the DB triggers maintain.
 */
export function useUserPoints() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const claimAttempted = useRef(false);

  const query = useQuery<UserPoints | null>({
    queryKey: ['user-points', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data } = await (supabase as any)
        .from('user_points')
        .select('points, lifetime_points, is_og, legacy_claimed')
        .eq('user_id', user.id)
        .maybeSingle();
      const lifetime = Number(data?.lifetime_points ?? 0);
      return {
        points: Number(data?.points ?? 0),
        lifetimePoints: lifetime,
        tier: tierFromLifetime(lifetime),
        isOg: Boolean(data?.is_og),
        legacyClaimed: Boolean(data?.legacy_claimed),
      };
    },
    staleTime: 15_000,
  });

  // One-time migration of the old localStorage balance.
  useEffect(() => {
    if (!user || claimAttempted.current) return;
    if (query.isLoading || !query.data) return;
    if (query.data.legacyClaimed) return;
    if (localStorage.getItem(LEGACY_CLAIM_FLAG) === 'true') return;

    claimAttempted.current = true;
    const legacy = parseInt(localStorage.getItem(LEGACY_POINTS_KEY) || '0', 10);
    const amount = Number.isFinite(legacy) && legacy > 0 ? legacy : 0;

    (async () => {
      const { error } = await (supabase as any).rpc('claim_legacy_points', { _amount: amount });
      if (!error) {
        localStorage.setItem(LEGACY_CLAIM_FLAG, 'true');
        queryClient.invalidateQueries({ queryKey: ['user-points', user.id] });
      }
    })();
  }, [user, query.isLoading, query.data, queryClient]);

  return {
    points: query.data?.points ?? 0,
    lifetimePoints: query.data?.lifetimePoints ?? 0,
    tier: query.data?.tier ?? 'Bronze',
    isOg: query.data?.isOg ?? false,
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
