import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { getSellQuote } from '@/lib/zoraTrading';
import { getEthUsdPrice } from '@/lib/ethPrice';

/**
 * What a listener owns, in the words a listener uses.
 *
 * A dollar buys one digital copy. Underneath, that dollar bought a quantity of
 * the song's Zora coin, so from the second the purchase clears the copy is worth
 * whatever the coin is worth, which can be more than was paid or less. The app
 * has to be able to say that plainly: you own 1 copy, you paid $1, it is worth
 * this much now, and it can go either way.
 *
 * The paid figure is a receipt we wrote at purchase time. The current figure is
 * an actual on-chain sell quote for the tokens still held, converted at the
 * live ETH price. Neither is a guess.
 */

export interface CopyPosition {
  copies: number;
  usdPaid: number;
  firstBoughtAt: string | null;
  /** Null while unknown: no wallet, no coin, or the quote could not be fetched. */
  usdNow: number | null;
  changePct: number | null;
  isLoading: boolean;
}

const EMPTY: CopyPosition = {
  copies: 0,
  usdPaid: 0,
  firstBoughtAt: null,
  usdNow: null,
  changePct: null,
  isLoading: false,
};

interface Receipt { copies: number; usdPaid: number; firstBoughtAt: string | null }

/**
 * Every receipt this person holds, in one query.
 *
 * Rendering a catalogue mounts one CopyPosition per song card, and each one used
 * to ask the server for its own receipt: 84 round trips to draw one artist's
 * page. There are only ever a handful of receipts per person, so fetching the
 * lot once and looking them up locally costs a single query no matter how many
 * cards are on screen.
 */
function useMyReceipts() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['my-copy-receipts', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('song_purchases' as never)
        .select('song_id, copies, usd_paid, purchased_at')
        .order('purchased_at', { ascending: true });
      const rows = (data ?? []) as unknown as Array<{
        song_id: string; copies: number; usd_paid: number; purchased_at: string;
      }>;
      const byId = new Map<string, Receipt>();
      for (const r of rows) {
        const id = String(r.song_id);
        const prev = byId.get(id);
        byId.set(id, {
          copies: (prev?.copies ?? 0) + Number(r.copies ?? 0),
          usdPaid: (prev?.usdPaid ?? 0) + Number(r.usd_paid ?? 0),
          firstBoughtAt: prev?.firstBoughtAt ?? r.purchased_at ?? null,
        });
      }
      return byId;
    },
  });
  return { receipts: query.data, loaded: !!user && query.isFetched };
}

export function useSongCopies(
  songId: string,
  coinAddress?: string | null,
  balance?: bigint,
  walletAddress?: string | null,
): CopyPosition & { refresh: () => Promise<void> } {
  const { user } = useAuth();
  const { receipts, loaded } = useMyReceipts();
  const [position, setPosition] = useState<CopyPosition>(EMPTY);

  const load = useCallback(async () => {
    if (!user) {
      setPosition(EMPTY);
      return;
    }
    setPosition((p) => ({ ...p, isLoading: true }));

    // From the shared batch when it has answered; the single-song RPC is only a
    // fallback for the first render before the batch lands.
    let copies: number, usdPaid: number, firstBoughtAt: string | null;
    if (loaded && receipts) {
      const r = receipts.get(String(songId));
      copies = r?.copies ?? 0;
      usdPaid = r?.usdPaid ?? 0;
      firstBoughtAt = r?.firstBoughtAt ?? null;
    } else {
      const { data } = await supabase.rpc('get_my_copies' as never, { _song_id: songId } as never);
      const receipt = (data ?? {}) as { copies?: number; usd_paid?: number; first_bought_at?: string };
      copies = Number(receipt.copies ?? 0);
      usdPaid = Number(receipt.usd_paid ?? 0);
      firstBoughtAt = receipt.first_bought_at ?? null;
    }

    let usdNow: number | null = null;
    if (coinAddress && walletAddress && balance && balance > BigInt(0)) {
      const [quoteWei, ethUsd] = await Promise.all([
        getSellQuote({
          coinAddress: coinAddress as `0x${string}`,
          tokenAmount: balance,
          userAddress: walletAddress as `0x${string}`,
        }),
        getEthUsdPrice(),
      ]);
      if (quoteWei !== null && ethUsd !== null) {
        usdNow = (Number(quoteWei) / 1e18) * ethUsd;
      }
    }

    setPosition({
      copies,
      usdPaid,
      firstBoughtAt,
      usdNow,
      changePct: usdNow !== null && usdPaid > 0 ? ((usdNow - usdPaid) / usdPaid) * 100 : null,
      isLoading: false,
    });
  }, [user, songId, coinAddress, walletAddress, balance, loaded, receipts]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...position, refresh: load };
}

/**
 * Write the receipt for a purchase. Called once a buy has actually cleared, so
 * the app can say what was paid later. It is only a record: points and Top Fan
 * come from song_holdings, which is read from the chain and never from here.
 */
export async function recordCopyPurchase(params: {
  songId: string;
  copies: number;
  usdPaid: number;
  ethPaid?: string;
  coinAddress?: string | null;
  walletAddress?: string | null;
  txHash?: string;
}): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session?.user?.id;
  if (!userId) return;

  await supabase.from('song_purchases' as never).insert({
    user_id: userId,
    song_id: params.songId,
    copies: params.copies,
    usd_paid: params.usdPaid,
    eth_paid: params.ethPaid ?? null,
    coin_address: params.coinAddress ?? null,
    wallet_address: params.walletAddress ?? null,
    tx_hash: params.txHash ?? null,
  } as never);
}
