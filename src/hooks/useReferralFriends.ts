import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

export interface ReferralFriend {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
  points_awarded: number;
}

/**
 * The people who joined on your invite, not just how many of them there were.
 * Only asked for while the invite panel is actually open.
 */
export function useReferralFriends(enabled = true) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['referral-friends', user?.id],
    enabled: Boolean(user) && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_my_referral_friends', { _limit: 25 });
      if (error) return [] as ReferralFriend[];
      return ((data as ReferralFriend[]) || []).map((row) => ({
        ...row,
        display_name: row.display_name || 'A new listener',
      }));
    },
  });
  return { friends: query.data ?? [], isLoading: query.isLoading };
}
