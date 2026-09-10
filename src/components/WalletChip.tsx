import { useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { requestWalletConnection } from '@/lib/walletGate';
import { useMyWallets, WALLET_NAMES, shortAddress } from '@/hooks/useMyWallets';

/**
 * The wallet, in the top bar, the way every app that handles money does it.
 *
 * Connected, it says which wallet and what is in it, and opens the wallet
 * page. Not connected, it is a one tap connect and nothing more. It never
 * nags: somebody listening to music has no reason to connect anything, and
 * the whole product works without a wallet.
 *
 * It used to ask to connect a wallet that was already connected, because a
 * connection lived only in the tab it happened in. The account remembers now,
 * so this shows the real state from the first paint.
 *
 * Balance is shown to four decimals. ETH on Base is usually a fraction, and
 * rounding it to two turns most real balances into "0.00", which reads as
 * empty when it is not.
 */
export function WalletChip() {
  const navigate = useNavigate();
  const { walletAddress, user } = useAuth();
  const { active, wallets } = useMyWallets();
  const address = active?.address ?? walletAddress;
  const { balance, isLoading } = useWalletBalance(address);
  const [connecting, setConnecting] = useState(false);

  // No wallet control for somebody who is not even signed in.
  if (!user) return null;

  const connect = async () => {
    setConnecting(true);
    try {
      const got = await requestWalletConnection();
      if (got) toast.success('Wallet connected', { description: 'It is on your account now.' });
    } catch (err) {
      toast.error('Could not connect that wallet', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setConnecting(false);
    }
  };

  if (!address) {
    return (
      <button
        onClick={() => void connect()}
        disabled={connecting}
        aria-label="Connect a wallet"
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
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
  const which = active ? WALLET_NAMES[active.provider] : 'Wallet';
  const more = wallets.length > 1 ? ` and ${wallets.length - 1} more` : '';

  return (
    <button
      onClick={() => navigate('/wallet')}
      aria-label={`${which} connected, ${shortAddress(address)}${more}. Open your wallet.`}
      title={`${which} · ${shortAddress(address)}`}
      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-primary/20"
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="tabular-nums">{shown}</span>
      <span className="hidden text-[10px] font-medium text-muted-foreground xs:inline">ETH</span>
      {wallets.length > 1 && (
        <span className="rounded-full bg-primary/20 px-1 text-[9px] font-bold text-primary">{wallets.length}</span>
      )}
    </button>
  );
}
