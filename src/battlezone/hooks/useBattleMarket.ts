import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { supabase } from '@/battlezone/integrations/supabase/client';
import { buyCoinWithEth } from '@/lib/zoraTrading';
import { proveWallet } from '@/lib/proveWallet';

/**
 * The trading ground for one battle.
 *
 * Backing a corner is an ordinary Zora purchase made from the backer's own
 * wallet. This app never touches the money and never holds the coin: it buys,
 * it lands in their wallet, and they keep it however the battle ends. All we do
 * afterwards is write down that it happened, so the room can see the standing.
 *
 * That ordering matters and is not an accident. The chain is the truth and our
 * row is only a record of it, so a failed write can never cost anybody a coin
 * they already own, and a row can never exist for a trade that never happened.
 */

export interface TradeStanding {
  backers_a: number;
  backers_b: number;
  volume_a_wei: string;
  volume_b_wei: string;
  trade_count: number;
}

const EMPTY_STANDING: TradeStanding = {
  backers_a: 0,
  backers_b: 0,
  volume_a_wei: '0',
  volume_b_wei: '0',
  trade_count: 0,
};

export function useBattleStanding(battleId: string | undefined) {
  return useQuery({
    queryKey: ['battle-trade-standing', battleId],
    enabled: Boolean(battleId),
    // The standing is the live scoreboard of the trading ground, so it should
    // feel current without hammering the database from every open room.
    refetchInterval: 15_000,
    queryFn: async (): Promise<TradeStanding> => {
      const { data, error } = await (supabase as any)
        .from('battle_trade_standing')
        .select('*')
        .eq('battle_id', battleId)
        .maybeSingle();
      if (error) throw error;
      return (data as TradeStanding | null) ?? EMPTY_STANDING;
    },
  });
}

/**
 * The server's own sentence when it refuses, rather than a generic failure.
 * supabase-js buries a non-2xx body in error.context.body, so without this the
 * person is told "Edge Function returned a non-2xx status code", which tells
 * them nothing about a purchase they just paid for.
 */
function readError(error: unknown, data: unknown): string {
  const body = (error as { context?: { body?: string } } | null)?.context?.body;
  try {
    const parsed = typeof body === 'string'
      ? (JSON.parse(body) as { error?: string })
      : (data as { error?: string } | null);
    if (parsed?.error) return parsed.error;
  } catch {
    /* fall through */
  }
  return 'The coin is in your wallet. We could not add you to the board just now, so try backing again in a moment and it will count you once.';
}

export interface BackCornerParams {
  battleId: string;
  side: 'a' | 'b';
  songId: string;
  coinAddress: string;
  /** How much ETH they are putting behind it, as a decimal string. */
  ethAmount: string;
  walletAddress: string;
  userId: string;
}

export interface BackResult {
  success: boolean;
  error?: string;
  txHash?: string;
  /** True when the coin was bought but our own record of it failed to save. */
  recordFailed?: boolean;
}

export function useBackCorner() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const backCorner = useCallback(
    async (params: BackCornerParams): Promise<BackResult> => {
      setPending(true);
      try {
        // 0. Prove the wallet BEFORE any money moves.
        //
        //    The board only counts a purchase from a wallet that has proved it
        //    holds its own key. Doing that after the buy would mean somebody
        //    pays for a coin and only then discovers they cannot be counted,
        //    which is the exact shape of the bug this whole path just had. One
        //    signature, which moves nothing and costs no gas, comes first.
        setStatus('Prove this wallet is yours');
        const proof = await proveWallet(params.walletAddress);
        if (!proof.ok) {
          return { success: false, error: `${proof.error ?? 'That wallet could not be proved.'} Nothing was spent.` };
        }

        setStatus('Confirm in your wallet');

        // 1. The purchase. Their wallet, their coin, straight to Zora.
        const trade = await buyCoinWithEth({
          coinAddress: params.coinAddress as `0x${string}`,
          ethAmount: params.ethAmount,
          userAddress: params.walletAddress as `0x${string}`,
        });

        if (!trade.success) {
          return { success: false, error: trade.error ?? 'That purchase did not go through.' };
        }

        // 2. Have the server read the purchase back off Base and write it down.
        //
        //    THE BROWSER CANNOT WRITE THIS ROW, AND SHOULD NOT BE ABLE TO.
        //    battle_trades has no insert policy at all, so this used to be an
        //    insert that always failed silently: the coin was bought, nothing
        //    was recorded, and the room congratulated them anyway. Worse, when
        //    it did work it took the browser's word for the amount and the
        //    hash, and a row there is what makes somebody a backer, which the
        //    verdict is meant to weigh. So battle-trade-verify checks the
        //    transaction on Base, takes the ETH figure from the transaction
        //    itself rather than from what we typed, and is the only thing that
        //    can add anybody to the board.
        setStatus('Adding you to the board');

        const { data, error } = await supabase.functions.invoke('battle-trade-verify', {
          body: {
            battleId: params.battleId,
            side: params.side,
            songId: params.songId,
            coinAddress: params.coinAddress,
            txHash: trade.txHash,
          },
        });

        void queryClient.invalidateQueries({ queryKey: ['battle-trade-standing', params.battleId] });

        if (error || !(data as { ok?: boolean } | null)?.ok) {
          // They own the coin either way, and nothing here can take it from
          // them. But saying "you are on the board" when they are not is the
          // lie this whole path used to tell, so it says which half worked.
          return {
            success: true,
            recordFailed: true,
            txHash: trade.txHash,
            error: readError(error, data),
          };
        }

        return { success: true, txHash: trade.txHash };
      } finally {
        setPending(false);
        setStatus(null);
      }
    },
    [queryClient],
  );

  return { backCorner, pending, status };
}
