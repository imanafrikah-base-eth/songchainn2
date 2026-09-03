import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { supabase } from '@/battlezone/integrations/supabase/client';
import { buyCoinWithEth } from '@/lib/zoraTrading';

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

        // 2. Write down that it happened. The coin is already theirs at this
        //    point, so nothing below can take it away from them.
        setStatus('Adding you to the board');
        const weiSpent = (() => {
          try {
            const [whole, frac = ''] = params.ethAmount.split('.');
            const padded = (frac + '0'.repeat(18)).slice(0, 18);
            return (BigInt(whole || '0') * 10n ** 18n + BigInt(padded || '0')).toString();
          } catch {
            return '0';
          }
        })();

        const { error } = await (supabase as any).from('battle_trades').insert({
          battle_id: params.battleId,
          user_id: params.userId,
          wallet_address: params.walletAddress,
          side: params.side,
          song_id: params.songId,
          coin_address: params.coinAddress,
          eth_spent_wei: weiSpent,
          tx_hash: trade.txHash,
        });

        void queryClient.invalidateQueries({ queryKey: ['battle-trade-standing', params.battleId] });

        if (error) {
          // Worth saying plainly rather than hiding: they own the coin, we just
          // failed to count it. Telling them it failed outright would be a lie.
          return {
            success: true,
            recordFailed: true,
            txHash: trade.txHash,
            error: 'You own the coin. It may take a moment to show on the board.',
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
