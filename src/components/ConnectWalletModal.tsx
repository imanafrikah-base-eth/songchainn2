import { useState, useSyncExternalStore } from 'react';
import { Wallet, ExternalLink, Loader2, ChevronRight, X } from 'lucide-react';
import { connectWallet } from '@/lib/baseWallet';
import { useDiscoveredWallets } from '@/hooks/useDiscoveredWallets';
import { isWalletGateOpen, subscribeWalletGate, resolveWalletGate } from '@/lib/walletGate';

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Global wallet-connect prompt, opened by requestWalletConnection() whenever
 * a trading action (buy, sell, unlock) needs a wallet. Adapts to environment:
 * wallet picker on desktop, open-in-wallet deep links on mobile browsers
 * without an injected wallet, install links otherwise.
 */
export function ConnectWalletModal() {
  const open = useSyncExternalStore(subscribeWalletGate, isWalletGateOpen, () => false);
  const wallets = useDiscoveredWallets();
  const [connectingRdns, setConnectingRdns] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            Buying, selling and collecting songs happens on Base. Connect a wallet to continue.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4">
            <p className="text-sm text-destructive text-center">{error}</p>
          </div>
        )}

        {wallets.length > 0 ? (
          <div className="space-y-2">
            {wallets.map((w) => (
              <button
                key={w.info.rdns}
                onClick={() => handlePick(w.info.rdns)}
                disabled={connectingRdns !== null}
                className="w-full h-14 flex items-center justify-between gap-3 px-4 rounded-2xl glass border border-border/60 text-foreground hover:bg-secondary/50 transition-colors press-effect disabled:opacity-60"
              >
                <span className="flex items-center gap-3">
                  <img src={w.info.icon} alt="" className="w-7 h-7 rounded-lg" />
                  <span className="font-semibold text-sm">{w.info.name}</span>
                </span>
                {connectingRdns === w.info.rdns ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        ) : mobile ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center mb-1">
              Open $ongChainn inside your wallet app to connect:
            </p>
            <a
              href={`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(currentUrl)}`}
              className="w-full h-14 flex items-center justify-between gap-3 px-4 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm hover:opacity-95 transition-all press-effect"
            >
              <span>Open in Base app / Coinbase Wallet</span>
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={`https://metamask.app.link/dapp/${currentHostPath}`}
              className="w-full h-14 flex items-center justify-between gap-3 px-4 rounded-2xl glass border border-border/60 text-foreground hover:bg-secondary/50 transition-colors press-effect font-semibold text-sm"
            >
              <span>Open in MetaMask</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center mb-1">
              No wallet detected. Install one, then come back:
            </p>
            <div className="flex gap-2">
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl glass text-primary hover:bg-secondary/50 transition-colors font-medium text-sm press-effect"
              >
                MetaMask
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://www.coinbase.com/wallet"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl glass text-primary hover:bg-secondary/50 transition-colors font-medium text-sm press-effect"
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
