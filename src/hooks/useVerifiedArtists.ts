import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

/**
 * Who is verified, once, for the whole app.
 *
 * The mark has to travel with the artist's name wherever the name goes: a
 * song card, the player, a post, a comment, a notification, a message
 * thread, a world. Those places know the artist by different handles (a
 * catalog artist id, or the account's user id), so this hands back both
 * sets from one small query, cached for five minutes and shared by every
 * caller. The truth is artist_accounts.is_verified, set by the founder when
 * a claim is approved; nothing here guesses from a name.
 */
export function useVerifiedArtists() {
  const { data } = useQuery({
    queryKey: ['verified-artists'],
    enabled: isSupabaseConfigured,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('artist_accounts')
        .select('artist_id, user_id')
        .eq('is_verified', true);
      if (error) throw error;
      return (data ?? []) as Array<{ artist_id: string; user_id: string }>;
    },
  });

  return useMemo(() => {
    const artistIds = new Set<string>();
    const userIds = new Set<string>();
    for (const row of data ?? []) {
      if (row.artist_id) artistIds.add(String(row.artist_id));
      if (row.user_id) userIds.add(String(row.user_id));
    }
    return {
      artistIds,
      userIds,
      /** By catalog artist id (songs, catalogs, worlds, search). */
      isVerifiedArtist: (artistId?: string | number | null) => (artistId == null ? false : artistIds.has(String(artistId))),
      /** By account (posts, comments, notifications, messages, profiles). */
      isVerifiedUser: (userId?: string | null) => (userId ? userIds.has(userId) : false),
    };
  }, [data]);
}
