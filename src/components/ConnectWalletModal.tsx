import { useEffect, useState, useSyncExternalStore } from 'react';
import { Wallet, ExternalLink, Loader2, ChevronRight, X } from 'lucide-react';
import { connectWallet, prefetchSdkWallets } from '@/lib/baseWallet';
import { rememberReturnPath } from '@/lib/deviceGuards';
import { useWalletOptions } from '@/hooks/useDiscoveredWallets';
import { isWalletGateOpen, subscribeWalletGate, resolveWalletGate } from '@/lib/walletGate';

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Global wallet-connect prompt, opened by requestWalletConnection() whenever
 * a trading action (buy, sell, unlock) needs a wallet.
 *
 * Every option here connects without leaving SONGCHAINN: an installed
 * wallet directly, or the wallet app already on the phone through its SDK,
 * which hands off and brings the person straight back to this page. The
 * old "open SONGCHAINN inside your wallet's browser" links are kept only as
 * a last resort at the bottom.
 */
export function ConnectWalletModal() {
  const open = useSyncExternalStore(subscribeWalletGate, isWalletGateOpen, () => false);
  const options = useWalletOptions();
  const [connectingRdns, setConnectingRdns] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Warm the SDK modules the moment the sheet opens, so a tap connects at once.
  useEffect(() => {
    if (open) prefetchSdkWallets();
  }, [open]);

  if (!open) return null;

  const mobile = isMobileBrowser();
  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://songchainn.xyz';
  const currentHostPath =
    typeof window !== 'undefined'
      ? `${window.location.host}${window.location.pathname}`
      : 'songchainn.xyz';

  const handlePick = async (rdns: string) => {
    setError(null);
    setConnectingRdns(rdns);
    // Wherever the wallet app sends the person back to, this is where they were.
    rememberReturnPath();
    try {
      const result = await connectWallet(rdns);
      if (result.success && result.address) {
        resolveWalletGate(result.address);
      } else {
        setError(result.error || 'Failed to connect wallet');
      }
    } catch (err: any) {
      setError(err?.message || 'Connection failed');
    } finally {
      setConnectingRdns(null);
    }
  };

  const close = () => {
    setError(null);
    setConnectingRdns(null);
    resolveWalletGate(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full sm:max-w-md glass-card bg-card border border-border/60 rounded-t-3xl sm:rounded-3xl p-6 pb-8 sm:pb-6">
        <button
          onClick={close}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-primary/20 flex items-center justify-center">
            <Wallet className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            Connect a Base wallet
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Buying, selling and collecting songs happens on Base. Connect the wallet on this device and you come straight back here.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4">
            <p className="text-sm text-destructive text-center">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          {options.map((w) => (
            <button
              key={w.rdns}
              onClick={() => handlePick(w.rdns)}
              disabled={connectingRdns !== null}
              className="w-full h-14 flex items-center justify-between gap-3 px-4 rounded-2xl glass border border-border/60 text-foreground hover:bg-secondary/50 transition-colors press-effect disabled:opacity-60"
            >
              <span className="flex items-center gap-3 min-w-0">
                <img src={w.icon} alt="" className="w-7 h-7 rounded-lg shrink-0" />
                <span className="min-w-0 text-left">
                  <span className="block font-semibold text-sm truncate">{w.name}</span>
                  {w.sdk && (
                    <span className="block text-[11px] text-muted-foreground">
                      {mobile ? 'Opens the app on this phone, then brings you back' : 'No extension needed'}
                    </span>
                  )}
                </span>
              </span>
              {connectingRdns === w.rdns ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>
          ))}
        </div>

        {connectingRdns && (
          <p className="mt-3 text-xs text-muted-foreground text-center">
            Approve it in your wallet. This page waits for you.
          </p>
        )}

        {mobile ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-center text-xs text-muted-foreground">
              Wallet not responding? Open $ongChainn inside it instead
            </summary>
            <div className="mt-2 space-y-2">
              <a
                href={`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(currentUrl)}`}
                className="w-full h-12 flex items-center justify-between gap-3 px-4 rounded-2xl glass border border-border/60 text-foreground text-sm font-semibold hover:bg-secondary/50 transition-colors press-effect"
              >
                <span>Open in Base app / Coinbase Wallet</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href={`https://metamask.app.link/dapp/${currentHostPath}`}
                className="w-full h-12 flex items-center justify-between gap-3 px-4 rounded-2xl glass border border-border/60 text-foreground text-sm font-semibold hover:bg-secondary/50 transition-colors press-effect"
              >
                <span>Open in MetaMask</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </details>
        ) : (
          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground mb-2">
              Prefer a browser extension? Install one, then come back:
            </p>
            <div className="flex gap-2">
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl glass text-primary hover:bg-secondary/50 transition-colors font-medium text-sm press-effect"
              >
                MetaMask
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://www.coinbase.com/wallet"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl glass text-primary hover:bg-secondary/50 transition-colors font-medium text-sm press-effect"
              >
                Coinbase
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
