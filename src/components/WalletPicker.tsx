import { type ReactNode } from "react";
import { Wallet, ChevronRight } from "lucide-react";
import { useDiscoveredWallets } from "@/hooks/useDiscoveredWallets";

interface WalletPickerProps {
  /** Called with the chosen wallet's rdns, or undefined for the default provider */
  onConnect: (walletRdns?: string) => void;
  busy: boolean;
  /** Button content while a connection is in flight (spinner + status text) */
  busyContent: ReactNode;
}

/**
 * Wallet chooser for sign-in. Lists every installed wallet announced via
 * EIP-6963 (MetaMask, Coinbase/Base app, Rainbow, Rabby, Phantom, ...).
 * Falls back to a single generic connect button when only window.ethereum
 * exists, and renders nothing when no wallet is installed (the parent
 * shows install links in that case).
 */
export function WalletPicker({ onConnect, busy, busyContent }: WalletPickerProps) {
  const wallets = useDiscoveredWallets();
  const hasLegacyProvider =
    typeof window !== "undefined" && !!(window as any).ethereum?.request;

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

  if (wallets.length === 0) {
    if (!hasLegacyProvider) return null;
    return (
      <button
        onClick={() => onConnect()}
        className="w-full h-14 flex items-center justify-center gap-2 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm hover:opacity-95 active:scale-[0.98] transition-all mb-3"
      >
        <Wallet className="w-5 h-5 mr-2" />
        Connect Wallet
      </button>
    );
  }

  if (wallets.length === 1) {
    const w = wallets[0];
    return (
      <button
        onClick={() => onConnect(w.info.rdns)}
        className="w-full h-14 flex items-center justify-center gap-3 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm hover:opacity-95 active:scale-[0.98] transition-all mb-3"
      >
        <img src={w.info.icon} alt="" className="w-6 h-6 rounded-md" />
        Continue with {w.info.name}
      </button>
    );
  }

  return (
    <div className="space-y-2 mb-3">
      <p className="text-xs text-muted-foreground text-center">Choose a wallet</p>
      {wallets.map((w) => (
        <button
          key={w.info.rdns}
          onClick={() => onConnect(w.info.rdns)}
          className="w-full h-14 flex items-center justify-between gap-3 px-4 rounded-2xl glass border border-border/60 text-foreground hover:bg-secondary/50 transition-colors press-effect"
        >
          <span className="flex items-center gap-3">
            <img src={w.info.icon} alt="" className="w-7 h-7 rounded-lg" />
            <span className="font-semibold text-sm">{w.info.name}</span>
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}
