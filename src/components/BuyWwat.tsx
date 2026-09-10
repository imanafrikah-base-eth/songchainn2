import { useState } from 'react';
import { Coins, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { buyCoinWithEth } from '@/lib/zoraTrading';
import { requestWalletConnection } from '@/lib/walletGate';
import { WWAT_TOKEN_ADDRESS, wwatIsLive } from '@/battlezone/config';

/**
 * Getting hold of $WWAT, one tap from wherever you needed it.
 *
 * Bought right here, in the person's own wallet, on the same rails as a world
 * key. No wallet yet? The wallet sheet opens, connects the one on the device
 * and comes back. Nobody is sent to another site to buy it.
 *
 * Hidden entirely when the coin is not configured, rather than showing a button
 * that cannot do anything.
 */

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
        toast.error('Connect a wallet to buy $WWAT', {
          description: 'The wallet on this device works. It comes back here when it is done.',
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

      <p className="mt-3 text-xs text-muted-foreground">Paid from your own wallet on Base. It never leaves $ongChainn.</p>
    </div>
  );
}
