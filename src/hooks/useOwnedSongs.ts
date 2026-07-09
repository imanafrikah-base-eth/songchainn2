import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useSongCoins } from '@/hooks/useSongCoins';
import { getOwnedCoinBalances } from '@/lib/zoraTrading';
import type { Address } from 'viem';

export interface OwnedSong {
  songId: string;
  balance: bigint;
}

/**
 * Real on-chain holdings for the signed-in user's wallet: every song coin
 * with a nonzero balance, fetched in a single multicall. Empty when no
 * wallet is connected.
 */
export function useOwnedSongs() {
  const { user } = useAuth();
  const { data: songCoins } = useSongCoins();
  const walletAddress = user?.user_metadata?.wallet_address as string | undefined;

  const query = useQuery<OwnedSong[]>({
    queryKey: ['owned-songs', walletAddress, songCoins?.length ?? 0],
    enabled: !!walletAddress && !!songCoins && songCoins.length > 0,
    queryFn: async () => {
      const coins = (songCoins || [])
        .filter((c) => c.mint_status === 'minted' && c.zora_coin_address)
        .map((c) => ({ songId: c.song_id, coinAddress: c.zora_coin_address as Address }));
      return getOwnedCoinBalances(coins, walletAddress as Address);
    },
    staleTime: 60_000,
  });

  return {
    ownedSongs: query.data ?? [],
    hasWallet: !!walletAddress,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
