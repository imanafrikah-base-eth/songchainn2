import { useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { requestWalletConnection } from '@/lib/walletGate';

/**
 * The wallet, in the top bar, the way every app that handles money does it.
 *
 * Connected, it shows the balance and opens the wallet page. Not connected, it
 * is a one tap connect and nothing more. It never nags: somebody listening to
 * music has no reason to connect anything, and the whole product works without
 * a wallet, so this stays a small quiet control rather than a call to action.
 *
 * Balance is shown to four decimals. ETH on Base is usually a fraction, and
 * rounding it to two turns most real balances into "0.00", which reads as empty
 * when it is not.
 */
export function WalletChip() {
  const navigate = useNavigate();
  const { walletAddress, user } = useAuth();
  const { balance, isLoading } = useWalletBalance(walletAddress);
  const [connecting, setConnecting] = useState(false);

  // No wallet control for somebody who is not even signed in.
  if (!user) return null;

  const connect = async () => {
    setConnecting(true);
    try {
      const address = await requestWalletConnection();
      if (address) toast.success('Wallet connected');
    } catch (err) {
      toast.error('Could not connect that wallet', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setConnecting(false);
    }
  };

  if (!walletAddress) {
    return (
      <button
        onClick={() => void connect()}
        disabled={connecting}
        aria-label="Connect a wallet"
        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
      >
        {connecting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">Connect</span>
      </button>
    );
  }

  const shown =
    isLoading || balance == null
      ? '...'
      : Number(balance).toLocaleString(undefined, {
          minimumFractionDigits: 4,
          maximumFractionDigits: 4,
        });

  return (
    <button
      onClick={() => navigate('/wallet')}
      aria-label="Your wallet"
      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
    >
      <Wallet className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="tabular-nums">{shown}</span>
      <span className="text-[10px] font-medium text-muted-foreground">ETH</span>
    </button>
  );
}
