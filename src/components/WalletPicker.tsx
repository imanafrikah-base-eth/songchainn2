import { useEffect, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useWalletOptions } from "@/hooks/useDiscoveredWallets";
import { prefetchSdkWallets } from "@/lib/baseWallet";

interface WalletPickerProps {
  /** Called with the chosen wallet's rdns, or undefined for the default provider */
  onConnect: (walletRdns?: string) => void;
  busy: boolean;
  /** Button content while a connection is in flight (spinner + status text) */
  busyContent: ReactNode;
}

/**
 * Wallet chooser for sign-in. Lists every installed wallet announced via
 * EIP-6963 (MetaMask, Coinbase/Base app, Rainbow, Rabby, Phantom, ...), then
 * the wallet apps reachable through their SDKs, so a phone browser with no
 * extension still connects to the wallet already on the device without
 * leaving SONGCHAINN.
 */
export function WalletPicker({ onConnect, busy, busyContent }: WalletPickerProps) {
  const options = useWalletOptions();

  // Warm the SDK modules while the list is on screen, so a tap connects at once.
  useEffect(() => {
    prefetchSdkWallets();
  }, []);

  if (busy) {
    return (
      <button
        disabled
        className="w-full h-14 flex items-center justify-center gap-2 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm opacity-60 mb-3"
      >
        {busyContent}
      </button>
    );
  }

  if (options.length === 0) return null;

  if (options.length === 1) {
    const w = options[0];
    return (
      <button
        onClick={() => onConnect(w.rdns)}
        className="w-full h-14 flex items-center justify-center gap-3 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm hover:opacity-95 active:scale-[0.98] transition-all mb-3"
      >
        <img src={w.icon} alt="" className="w-6 h-6 rounded-md" />
        Continue with {w.name}
      </button>
    );
  }

  return (
    <div className="space-y-2 mb-3">
      <p className="text-xs text-muted-foreground text-center">Choose a wallet</p>
      {options.map((w) => (
        <button
          key={w.rdns}
          onClick={() => onConnect(w.rdns)}
          className="w-full h-14 flex items-center justify-between gap-3 px-4 rounded-2xl glass border border-border/60 text-foreground hover:bg-secondary/50 transition-colors press-effect"
        >
          <span className="flex items-center gap-3 min-w-0">
            <img src={w.icon} alt="" className="w-7 h-7 rounded-lg shrink-0" />
            <span className="min-w-0 text-left">
              <span className="block font-semibold text-sm truncate">{w.name}</span>
              {w.sdk && (
                <span className="block text-[11px] text-muted-foreground">Opens the wallet on this device and brings you back here</span>
              )}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  );
}
