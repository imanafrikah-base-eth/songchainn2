import { useEffect, useRef, useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { requestWalletConnection } from '@/lib/walletGate';
import { getConnectedAccounts, getWalletProvider, toChecksumAddress } from '@/lib/baseWallet';
import { useMyWallets, WALLET_NAMES, providerFromRdns, rememberWallet, shortAddress } from '@/hooks/useMyWallets';

/**
 * The wallet, in the top bar.
 *
 * Connected, it shows the wallet and its ETH on Base, and opens the wallet
 * page. Not connected, it is one tap to connect. It never nags.
 *
 * A wallet connected in the browser used to show up here while the wallet page
 * said "None yet", because the connection lived only in this tab and never
 * reached the account (founder, 14 Sep 2026). Whatever wallet this browser is
 * already connected with is now kept on the account, quietly, with no popup:
 * the person already approved it for this site.
 */
export function WalletChip() {
  const navigate = useNavigate();
  // Inside the battle zone the chip opens the battle wallet, so nobody is thrown out of the arena.
  const location = useLocation();
  const { walletAddress, user } = useAuth();
  const { active, wallets, isLoading: walletsLoading, refresh } = useMyWallets();
  const [browserAddress, setBrowserAddress] = useState<string | null>(null);
  const address = active?.address ?? walletAddress ?? browserAddress;
  const { display, isLoading } = useWalletBalance(address);
  const [connecting, setConnecting] = useState(false);
  const saving = useRef(new Set<string>());

  // A wallet this browser already approved for SONGCHAINN. eth_accounts never opens a popup.
  useEffect(() => {
    if (!user?.id || active) return;
    let cancelled = false;
    void getConnectedAccounts().then((accounts) => {
      if (!cancelled && accounts[0]) setBrowserAddress(toChecksumAddress(accounts[0]));
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, active]);

  // Keep it on the account, once, so every page (and the wallet page) knows it.
  useEffect(() => {
    if (!user?.id || walletsLoading) return;
    const candidate = walletAddress ?? browserAddress;
    if (!candidate || !/^0x[0-9a-fA-F]{40}$/.test(candidate)) return;
    const known = wallets.some((w) => w.address.toLowerCase() === candidate.toLowerCase());
    if (known || saving.current.has(candidate.toLowerCase())) return;
    saving.current.add(candidate.toLowerCase());
    const info = (getWalletProvider() as { isMetaMask?: boolean; isCoinbaseWallet?: boolean } | null) ?? null;
    const provider = providerFromRdns(info?.isMetaMask ? 'io.metamask' : info?.isCoinbaseWallet ? 'com.coinbase.wallet' : null);
    void rememberWallet(candidate, provider).then(() => refresh());
  }, [user?.id, walletsLoading, walletAddress, browserAddress, wallets, refresh]);

  // No wallet control for somebody who is not even signed in.
  if (!user) return null;

  const connect = async () => {
    setConnecting(true);
    try {
      const got = await requestWalletConnection();
      if (got) {
        await rememberWallet(got, 'other');
        await refresh();
        toast.success('Wallet connected on Base', { description: 'It is on your account now.' });
      }
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
        aria-label="Connect a wallet on Base"
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

  const shown = isLoading && display == null ? '...' : display ?? '0';
  const which = active ? WALLET_NAMES[active.provider] : 'Wallet';
  const more = wallets.length > 1 ? ` and ${wallets.length - 1} more` : '';

  return (
    <button
      onClick={() => navigate(location.pathname.startsWith('/wavewarz-africa') ? '/wavewarz-africa/wallet' : '/wallet')}
      aria-label={`${which} connected, ${shortAddress(address)}${more}, ${shown} ETH on Base. Open your wallet.`}
      title={`${which} · ${shortAddress(address)} · Base`}
      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-primary/20"
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="tabular-nums">{shown}</span>
      <span className="hidden text-[10px] font-medium text-muted-foreground sm:inline">ETH</span>
      <span className="hidden text-[10px] text-muted-foreground md:inline">{shortAddress(address)}</span>
      {wallets.length > 1 && (
        <span className="rounded-full bg-primary/20 px-1 text-[9px] font-bold text-primary">{wallets.length}</span>
      )}
    </button>
  );
}
