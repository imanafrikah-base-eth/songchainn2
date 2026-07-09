import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SongCoinRow {
  song_id: string;
  zora_coin_address: string | null;
  payout_recipient: string;
  mint_status: string;
}

/**
 * All songs that have a live Zora Content Coin, keyed by song_id.
 */
export function useSongCoins() {
  return useQuery({
    queryKey: ['song_coins'],
    queryFn: async (): Promise<SongCoinRow[]> => {
      const { data, error } = await supabase
        .from('song_coins')
        .select('song_id, zora_coin_address, payout_recipient, mint_status')
        .eq('mint_status', 'minted');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });
}

export function useSongCoin(songId: string): SongCoinRow | null {
  const { data } = useSongCoins();
  return data?.find((c) => c.song_id === songId) ?? null;
}
