import { encodeFunctionData, erc20Abi } from 'viem';
import { supabase } from '@/battlezone/integrations/supabase/client';
import { getWalletProvider } from '@/lib/baseWallet';
import { getPublicClient } from '@/lib/nft';
import { ensureBase } from '@/lib/safeBuy';
import { requestWalletConnection } from '@/lib/walletGate';

/**
 * Turning on in-app voice for a battle.
 *
 * The server says what it costs (quote), the host pays from their own wallet
 * straight to the WaveWarz treasury, and the server reads that payment back
 * off Base before it switches voice on (enable). Nothing here decides that a
 * payment happened; the chain does. Hosts who host voice free skip the wallet.
 */

export interface VoiceQuote {
  available: boolean;
  /** Why voice cannot be turned on for this battle, in plain words. */
  reason?: string;
  exempt: boolean;
  usd: number;
  priceUsd?: number;
  amountRaw?: string;
  /** The amount in whole $WWAT, rounded for reading. */
  amountDisplay?: string;
  token?: string;
  recipient?: string;
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

export async function quoteVoice(battleId: string): Promise<VoiceQuote> {
  const { data, error } = await supabase.functions.invoke('battle-voice', { body: { battleId, action: 'quote' } });
  if (error || !data) throw new Error(readError(error, data));
  return data as VoiceQuote;
}

export async function enableVoice(battleId: string, txHash?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('battle-voice', { body: { battleId, action: 'enable', txHash } });
  if (error || !data?.ok) throw new Error(readError(error, data));
}

/**
 * Pay the voice fee in $WWAT from the host's wallet. Resolves with the
 * transaction once it has landed on Base. Throws a plain sentence, and says
 * whether anything was spent, when it does not.
 */
export async function payVoiceFee(quote: VoiceQuote): Promise<string> {
  if (!quote.token || !quote.recipient || !quote.amountRaw) throw new Error('There is no price to pay yet. Try again in a moment.');
  const token = quote.token as `0x${string}`;
  const recipient = quote.recipient as `0x${string}`;
  const amount = BigInt(quote.amountRaw);

  const address = (await requestWalletConnection()) as `0x${string}` | null;
  if (!address) throw new Error('No wallet connected, so nothing was spent.');
  if (!(await ensureBase())) throw new Error('Your wallet would not switch to Base, so nothing was spent. Switch it yourself and try again.');

  const client = getPublicClient();
  // Read through a narrow shape: the shared public client's generics ask for
  // fields a plain balanceOf read has no use for.
  const reader = client as unknown as {
    readContract: (args: { address: `0x${string}`; abi: typeof erc20Abi; functionName: 'balanceOf'; args: [`0x${string}`] }) => Promise<bigint>;
  };
  const held = await reader
    .readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
    .catch(() => null);
  if (held !== null && held < amount) {
    throw new Error('Not enough $WWAT in this wallet for the voice fee, so nothing was spent. Get some $WWAT first, then try again.');
  }

  // The payer's wallet is remembered on their account, because the server
  // only accepts a payment made from a wallet that belongs to the host.
  try {
    await supabase.rpc('add_my_wallet' as never, { p_address: address, p_provider: 'other', p_label: null } as never);
  } catch {
    /* the server says so plainly if it is missing */
  }

  const provider = getWalletProvider();
  if (!provider) throw new Error('No wallet to pay from, so nothing was spent.');
  let txHash: string;
  try {
    txHash = (await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: address, to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [recipient, amount] }) }],
    })) as string;
  } catch (err) {
    const s = String((err as Error)?.message ?? err).toLowerCase();
    if (/user rejected|user denied|rejected the request/.test(s)) throw new Error('You cancelled it in your wallet. Nothing was spent.');
    throw new Error('Your wallet did not send the payment, so nothing was spent. Try again.');
  }

  try {
    await client.waitForTransactionReceipt({ hash: txHash as `0x${string}`, timeout: 120_000 });
  } catch {
    throw new Error(
      `The payment was sent but has not confirmed yet. Do not pay again: check it on basescan.org (${txHash.slice(0, 10)}...) and press Turn on voice once it shows.`,
    );
  }
  return txHash;
}
