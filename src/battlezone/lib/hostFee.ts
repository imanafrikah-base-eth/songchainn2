import { encodeFunctionData, erc20Abi } from 'viem';
import { supabase } from '@/battlezone/integrations/supabase/client';
import { getWalletProvider } from '@/lib/baseWallet';
import { getPublicClient } from '@/lib/nft';
import { ensureBase } from '@/lib/safeBuy';
import { requestWalletConnection } from '@/lib/walletGate';
import { proveWallet } from '@/lib/proveWallet';

/**
 * Paying for a battle, and paying the artists in the same breath.
 *
 * The notice on the host screen has always said 40% of the host fee goes
 * straight to the artists whose songs were picked. It now does, literally: the
 * host's wallet sends each artist their share directly, and only the pooled
 * part (the winners' pot, the host's rebate and running costs) goes to the
 * treasury. SONGCHAINN never holds an artist's money and never has to be
 * trusted to pass it on afterwards.
 *
 * The server says what is owed and to whom, reads every leg back off Base, and
 * is the only thing that can record a battle as paid for. Nothing here decides
 * that a payment happened; the chain does.
 */

export interface FeeLeg {
  kind: 'artist' | 'treasury';
  artistName: string | null;
  to: string;
  amountRaw: string;
  label: string;
}

export interface HostFeeQuote {
  /** Whether there is anything to pay. False for perked hosts and the Open Mic. */
  due: boolean;
  exempt: boolean;
  /** Already paid for. */
  paid?: boolean;
  /** Why nothing is owed, or why it cannot be charged, in plain words. */
  reason?: string;
  usd: number;
  priceUsd?: number;
  /**
   * The token ceiling bound, so what is charged is less than the dollar price.
   * True while $WWAT is cheap. The interface should say what is actually being
   * paid, not the dollar figure it was capped down from.
   */
  capped?: boolean;
  token?: string;
  totalRaw?: string;
  legs?: FeeLeg[];
}

function readError(error: unknown, data: unknown): string {
  const body = (error as { context?: { body?: string } } | null)?.context?.body;
  try {
    const parsed = typeof body === 'string' ? (JSON.parse(body) as { error?: string }) : (data as { error?: string } | null);
    if (parsed?.error) return parsed.error;
  } catch {
    /* fall through */
  }
  return 'Could not reach WaveWarz Africa just now. Try again in a moment.';
}

export async function quoteHostFee(battleId: string): Promise<HostFeeQuote> {
  const { data, error } = await supabase.functions.invoke('battle-host-fee', {
    body: { battleId, action: 'quote' },
  });
  if (error || !data) throw new Error(readError(error, data));
  return data as HostFeeQuote;
}

export async function confirmHostFee(battleId: string, txHashes: string[]): Promise<void> {
  const { data, error } = await supabase.functions.invoke('battle-host-fee', {
    body: { battleId, action: 'confirm', txHashes },
  });
  if (error || !data?.ok) throw new Error(readError(error, data));
}

/**
 * Send every leg of the fee from the host's wallet, in order, and hand back the
 * transaction for each one so the server can read them off the chain.
 *
 * The legs go one at a time on purpose. If the second one fails, the first has
 * still reached the artist it was meant for, and the host is told exactly where
 * it stopped rather than being left guessing what was spent.
 */
export async function payHostFee(quote: HostFeeQuote, onLeg?: (done: number, total: number, label: string) => void): Promise<string[]> {
  const legs = quote.legs ?? [];
  if (!quote.token || legs.length === 0) throw new Error('There is nothing to pay yet. Try again in a moment.');
  const token = quote.token as `0x${string}`;

  const address = (await requestWalletConnection()) as `0x${string}` | null;
  if (!address) throw new Error('No wallet connected, so nothing was spent.');
  if (!(await ensureBase())) throw new Error('Your wallet would not switch to Base, so nothing was spent. Switch it yourself and try again.');

  const total = legs.reduce((sum, l) => sum + BigInt(l.amountRaw), 0n);
  const client = getPublicClient();
  const reader = client as unknown as {
    readContract: (args: { address: `0x${string}`; abi: typeof erc20Abi; functionName: 'balanceOf'; args: [`0x${string}`] }) => Promise<bigint>;
  };
  const held = await reader
    .readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
    .catch(() => null);
  if (held !== null && held < total) {
    throw new Error('Not enough $WWAT in this wallet for the host fee, so nothing was spent. Get some $WWAT first, then try again.');
  }

  // The server only accepts payment from a wallet that has PROVED it holds its
  // own key. Asking here, before a single transfer goes out, means a wallet
  // that cannot prove itself costs the host nothing: they sign one sentence, or
  // they stop, and either way their money is untouched.
  const proof = await proveWallet(address);
  if (!proof.ok) {
    throw new Error(`${proof.error ?? 'That wallet could not be proved.'} Nothing was spent.`);
  }

  const provider = getWalletProvider();
  if (!provider) throw new Error('No wallet to pay from, so nothing was spent.');

  const hashes: string[] = [];
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    onLeg?.(i, legs.length, leg.label);
    let txHash: string;
    try {
      txHash = (await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: token,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [leg.to as `0x${string}`, BigInt(leg.amountRaw)],
          }),
        }],
      })) as string;
    } catch (err) {
      const s = String((err as Error)?.message ?? err).toLowerCase();
      const spent = hashes.length
        ? ` ${hashes.length} of ${legs.length} parts were already sent.`
        : ' Nothing was spent.';
      if (/user rejected|user denied|rejected the request/.test(s)) {
        throw new Error(`You cancelled it in your wallet.${spent}`);
      }
      throw new Error(`Your wallet did not send the payment for ${leg.label}.${spent}`);
    }

    try {
      await client.waitForTransactionReceipt({ hash: txHash as `0x${string}`, timeout: 120_000 });
    } catch {
      throw new Error(
        `A payment was sent but has not confirmed yet. Do not pay again: check it on basescan.org (${txHash.slice(0, 10)}...) and press it once more when it shows.`,
      );
    }
    hashes.push(txHash);
  }

  onLeg?.(legs.length, legs.length, 'Paid');
  return hashes;
}
