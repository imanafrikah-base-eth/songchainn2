import { supabase } from '@/integrations/supabase/client';

/**
 * Tell the server a purchase just landed, so the payer and whoever got paid
 * both hear about it.
 *
 * Only a transaction hash is sent. The payment-receipt edge function reads
 * everything else off Base itself, so nothing the browser says about amounts or
 * recipients is ever believed.
 *
 * Fire and forget: never awaited by the purchase, never throws. A purchase
 * that went through must never look like it failed because a notice did not.
 */
export type PaymentKind = 'world_key' | 'wwat' | 'coin_buy' | 'song_copy' | 'song_sell' | 'drop_collect';

/* Base nodes can lag a few seconds behind the wallet that just confirmed. */
const DELAYS_MS = [0, 6000, 20000];

export function reportPayment(txHash: string | null | undefined, kind: PaymentKind, contextId?: string | null): void {
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return;
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) return;
      for (const delay of DELAYS_MS) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          const { error } = await supabase.functions.invoke('payment-receipt', {
            body: { txHash, kind, contextId: contextId ?? undefined },
          });
          if (!error) return;
          // Only "not confirmed yet" or "could not reach Base" is worth another go.
          const status = (error as { context?: { status?: number } }).context?.status;
          if (status && status !== 409 && status !== 503) return;
        } catch {
          /* try again */
        }
      }
    } catch {
      /* a notice is never worth an error */
    }
  })();
}
