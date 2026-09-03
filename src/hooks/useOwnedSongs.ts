import { useMemo } from 'react';
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

  /*
   * A lookup, so a per-song hook can read its balance out of this one multicall
   * instead of making its own eth_call. Rendering an artist's catalogue used to
   * fire one unbatched call per card, which on an 84 song page meant 84 round
   * trips to the public Base RPC, most of which it rate limits, and a throttled
   * call returns zero, so the page told holders they owned nothing.
   */
  const balanceBySongId = useMemo(() => {
    const m = new Map<string, bigint>();
    for (const o of query.data ?? []) m.set(String(o.songId), o.balance);
    return m;
  }, [query.data]);

  return {
    ownedSongs: query.data ?? [],
    balanceBySongId,
    /** True once the batch has answered, so "absent" can be read as "zero". */
    balancesLoaded: !!walletAddress && query.isFetched && !query.isLoading,
    hasWallet: !!walletAddress,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
