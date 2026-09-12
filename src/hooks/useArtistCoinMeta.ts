import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getArtistCoin, type ArtistCoin } from '@/lib/artistCoins';

/**
 * Where to find an artist's creator coin, from the database first.
 *
 * The roster used to live only in src/lib/artistCoins.ts, which meant an artist
 * who added their coin could not see it on their own page until somebody
 * shipped a deploy. N3M3SIS had a live coin for five days with nothing on her
 * page to show for it. Now the table answers first and the file is the
 * fallback, so a new artist needs no code change at all.
 *
 * One query for the whole registry rather than one per artist: it is a handful
 * of rows, every artist page wants it, and React Query keeps it shared.
 */

interface CoinRow {
  artist_id: string;
  zora_handle: string;
  coin_address: string;
  wallet: string | null;
  payout_address: string | null;
}

export function useArtistCoinRegistry() {
  return useQuery({
    queryKey: ['artist-coin-registry'],
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<Map<string, ArtistCoin>> => {
      const { data, error } = await supabase
        .from('artist_coins' as never)
        .select('artist_id, zora_handle, coin_address, wallet, payout_address');
      // The static file still answers on its own if this table is unreachable,
      // so a failure here quietly costs nothing.
      if (error) return new Map();
      const out = new Map<string, ArtistCoin>();
      for (const r of (data as unknown as CoinRow[] | null) ?? []) {
        if (!r.artist_id || !r.coin_address) continue;
        const fallback = getArtistCoin(r.artist_id);
        out.set(r.artist_id, {
          artistId: r.artist_id,
          name: fallback?.name ?? r.zora_handle,
          zoraHandle: r.zora_handle,
          coinAddress: r.coin_address,
          wallet: r.wallet ?? '',
          // Royalties must never fall back to the profile wallet: for IMan the
          // two differ, and paying the wrong one sends his song earnings where
          // his coin does not pay.
          payoutAddress: r.payout_address ?? fallback?.payoutAddress ?? '',
          marketCapUsdAt20260901: fallback?.marketCapUsdAt20260901 ?? 0,
        });
      }
      return out;
    },
  });
}

/** This artist's coin, from the table if it is there and the file if not. */
export function useArtistCoinMeta(artistId: string | undefined): ArtistCoin | null {
  const { data: registry } = useArtistCoinRegistry();
  if (!artistId) return null;
  return registry?.get(artistId) ?? getArtistCoin(artistId);
}
