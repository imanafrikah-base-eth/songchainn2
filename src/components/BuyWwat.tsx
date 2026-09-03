import { useState } from 'react';
import { Coins, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { buyCoinWithEth } from '@/lib/zoraTrading';
import { requestWalletConnection } from '@/lib/walletGate';
import { WWAT_TOKEN_ADDRESS, wwatIsLive } from '@/battlezone/config';

/**
 * Getting hold of $WWAT, one tap from wherever you needed it.
 *
 * Two ways out on purpose. A connected wallet buys in place, and everyone else
 * gets the coin's own page on Zora, which works on any device with any wallet
 * and needs nothing from us. Somebody who wants to host a battle should never
 * hit a dead end because their wallet is on their other phone.
 *
 * Hidden entirely when the coin is not configured, rather than showing a button
 * that cannot do anything.
 */

/** The coin's page on Zora, carrying the SONGCHAINN referrer. */
const ZORA_URL =
  `https://zora.co/coin/base:${WWAT_TOKEN_ADDRESS}` +
  '?referrer=0x5b4613a4deeadc0a8cc8540e35c0c65e52645433';

const AMOUNTS = ['0.002', '0.005', '0.01'] as const;

export function BuyWwat({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (!wwatIsLive()) return null;

  const buy = async (ethAmount: string) => {
    setBusy(ethAmount);
    try {
      const address = await requestWalletConnection();
      if (!address) {
        toast.error('Connect a wallet to buy here', {
          description: 'Or open the coin on Zora and buy there instead.',
        });
        return;
      }
      const res = await buyCoinWithEth({
        coinAddress: WWAT_TOKEN_ADDRESS as `0x${string}`,
        ethAmount,
        userAddress: address as `0x${string}`,
      });
      if (res.success) {
        toast.success('You hold $WWAT', { description: 'You can host a battle with it now.' });
        setOpen(false);
      } else {
        toast.error('That did not go through', { description: res.error });
      }
    } finally {
      setBusy(null);
    }
  };

  if (compact && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <Coins className="h-3.5 w-3.5" aria-hidden="true" />
        Get $WWAT
      </button>
    );
  }

  return (
    <div className="live-surface rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="text-sm font-semibold text-foreground">$WWAT</span>
        <span className="ml-auto text-xs text-muted-foreground">Hosting a battle is paid in it</span>
      </div>

      <div className="mt-3 flex gap-2">
        {AMOUNTS.map((amount) => (
          <button
            key={amount}
            onClick={() => void buy(amount)}
            disabled={busy !== null}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {busy === amount ? (
              <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              `${amount} ETH`
            )}
          </button>
        ))}
      </div>

      <a
        href={ZORA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        Buy it on Zora instead
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  );
}
