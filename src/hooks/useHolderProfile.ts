import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * What holding an artist's songs is worth to you.
 *
 * The marketplace used to sell an unlock: pay a third of a dollar, get to
 * stream. Worlds made that redundant, because access is what a world gate is
 * for. So a song coin stops being a ticket and becomes the thing it always
 * should have been, a piece of the record, and the app pays you for keeping it.
 *
 * Balances are never read here. They come from the song-holdings edge function,
 * which reads them from Base itself, because these numbers move points and a
 * browser cannot be trusted with that.
 */

export type HolderTier = 'none' | 'supporter' | 'backer' | 'patron' | 'cornerstone';

export interface HeldSong {
  song_id: string;
  title: string;
  artist_name: string;
  balance: string;
  held_since: string | null;
}

export interface HolderProfile {
  signed_in: boolean;
  songs_held: number;
  artists_backed: number;
  tier: HolderTier;
  multiplier: number;
  next_tier_at: number | null;
  top_fan_of: Array<{ artist_name: string; total: string }>;
  holdings: HeldSong[];
}

const EMPTY: HolderProfile = {
  signed_in: false,
  songs_held: 0,
  artists_backed: 0,
  tier: 'none',
  multiplier: 1,
  next_tier_at: 1,
  top_fan_of: [],
  holdings: [],
};

export const TIER_LABEL: Record<HolderTier, string> = {
  none: 'Not holding yet',
  supporter: 'Supporter',
  backer: 'Backer',
  patron: 'Patron',
  cornerstone: 'Cornerstone',
};

export const TIER_BLURB: Record<HolderTier, string> = {
  none: 'Hold any artist song and every point you earn starts counting for more.',
  supporter: 'You are holding. Every point you earn is worth 10 percent more.',
  backer: 'Three songs in. Every point you earn is worth 25 percent more.',
  patron: 'Seven songs in. Every point you earn is worth half again as much.',
  cornerstone: 'Fifteen songs in. You are holding up a catalogue, and it shows.',
};

export function useHolderProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<HolderProfile>({
    queryKey: ['holder-profile', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_holder_profile' as never);
      if (error) return EMPTY;
      return { ...EMPTY, ...(data as unknown as HolderProfile) };
    },
  });

  /**
   * Ask the server to go and look at the chain again. Worth calling after a buy
   * or a sell, and on a deliberate refresh, but not on every render: it is one
   * eth_call per minted coin per wallet.
   */
  const refreshFromChain = useCallback(async () => {
    if (!user) return null;
    const { data, error } = await supabase.functions.invoke('song-holdings', { body: {} });
    if (!error) {
      await queryClient.invalidateQueries({ queryKey: ['holder-profile', user.id] });
    }
    return error ? null : data;
  }, [queryClient, user]);

  const profile = query.data ?? EMPTY;

  return {
    profile,
    isLoading: query.isLoading,
    refreshFromChain,
    isTopFanOf: useCallback(
      (artistName: string) =>
        profile.top_fan_of.some(
          (t) => t.artist_name?.toLowerCase() === artistName?.toLowerCase(),
        ),
      [profile.top_fan_of],
    ),
    holdsSong: useCallback(
      (songId: string) => profile.holdings.some((h) => h.song_id === songId),
      [profile.holdings],
    ),
  };
}
