import { supabase } from '@/integrations/supabase/client';
import { signMessage } from '@/lib/baseWallet';

/**
 * Proving a wallet is yours, before it is allowed to speak for you.
 *
 * Registering a wallet used to be a format check and nothing more, so anybody
 * could put a stranger's address on their account. That did not matter while
 * the list was a convenience. It started mattering the moment the battle fee,
 * the voice fee and the trading ground began asking "is this payment yours?"
 * and answering from that list: every transfer on Base is public, so claiming
 * somebody else's payment was a matter of copying an address off a block
 * explorer.
 *
 * So the wallet signs a sentence the SERVER wrote, naming this account, once.
 * No money moves, no spending is approved, and it costs no gas. After that the
 * wallet is proved and the money paths will accept it.
 */

export interface WalletProof {
  ok: boolean;
  error?: string;
  /** True when the wallet was already proved and no signature was needed. */
  alreadyVerified?: boolean;
}

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
  return 'Could not check that wallet just now. Try again in a moment.';
}

/**
 * Ask this wallet to prove itself, if it has not already.
 *
 * Returns quietly and immediately when the wallet is already proved, so it is
 * safe to call on every payment path without nagging anybody for a signature
 * they have given before.
 */
export async function proveWallet(address: string, provider = 'other'): Promise<WalletProof> {
  const addr = (address ?? '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) {
    return { ok: false, error: 'That does not look like a wallet address.' };
  }

  // 1. Ask the server for something to sign. It writes the words, not us.
  const { data: challenge, error: challengeError } = await supabase.functions.invoke('wallet-link', {
    body: { action: 'challenge', address: addr, provider },
  });
  if (challengeError || !(challenge as { ok?: boolean } | null)?.ok) {
    return { ok: false, error: readError(challengeError, challenge) };
  }

  const already = challenge as { alreadyVerified?: boolean; message?: string };
  if (already.alreadyVerified) return { ok: true, alreadyVerified: true };
  if (!already.message) {
    return { ok: false, error: 'Could not check that wallet just now. Try again in a moment.' };
  }

  // 2. Sign exactly what came back. Nothing is added to it here.
  const { signature, error: signError } = await signMessage(already.message, addr);
  if (signError || !signature) {
    return {
      ok: false,
      error: signError === 'Signature request was rejected'
        ? 'You cancelled it in your wallet, so nothing was spent and nothing changed.'
        : (signError ?? 'Your wallet did not sign that, so nothing changed.'),
    };
  }

  // 3. The server checks the signature really came from that address.
  const { data: verified, error: verifyError } = await supabase.functions.invoke('wallet-link', {
    body: { action: 'verify', address: addr, signature, provider },
  });
  if (verifyError || !(verified as { ok?: boolean } | null)?.ok) {
    return { ok: false, error: readError(verifyError, verified) };
  }

  return { ok: true };
}
