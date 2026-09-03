import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getArtistCoin } from '@/lib/artistCoins';
import { useArtistCoin } from '@/hooks/useArtistCoin';
import { readCoinBalance } from '@/lib/coinBalance';

/**
 * What the signed-in person holds of an artist's coin, in dollars.
 *
 * Used for small courtesies on the artist page, such as seeing when the
 * artist is online once you hold at least fifty cents of their coin. Read
 * from Base in the browser, priced from the coin's own market data; not the
 * basis for anything that moves money or opens a locked room.
 */
export const HOLDER_PERK_USD = 0.5;

export function useArtistCoinHolding(artistId: string | undefined) {
  const { user } = useAuth();
  const coin = artistId ? getArtistCoin(artistId) : null;
  const wallet = (user?.user_metadata as { wallet_address?: string } | undefined)?.wallet_address ?? null;
  const { data: stats } = useArtistCoin(artistId);

  const { data: balance = 0, isLoading } = useQuery({
    queryKey: ['artist-coin-balance', coin?.coinAddress, wallet],
    enabled: Boolean(coin?.coinAddress && wallet),
    staleTime: 60_000,
    queryFn: () => readCoinBalance(coin!.coinAddress, wallet!),
  });

  const price = stats?.priceUsd ?? null;
  const usd = price != null ? balance * price : null;

  return {
    coin,
    wallet,
    balance,
    usd,
    isLoading,
    /** True once the person holds at least HOLDER_PERK_USD of the coin. */
    holdsEnough: usd != null && usd >= HOLDER_PERK_USD,
  };
}
