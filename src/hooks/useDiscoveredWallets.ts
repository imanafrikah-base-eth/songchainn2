import { useSyncExternalStore } from "react";
import { getDiscoveredWallets, subscribeWallets, type DiscoveredWallet } from "@/lib/baseWallet";

const emptyWallets: DiscoveredWallet[] = [];

function getSnapshot(): DiscoveredWallet[] {
  return getDiscoveredWallets();
}

function getServerSnapshot(): DiscoveredWallet[] {
  return emptyWallets;
}

/**
 * Live list of installed wallets announced via EIP-6963
 * (MetaMask, Coinbase/Base, Rainbow, Rabby, Phantom, ...).
 * Re-renders when a new wallet announces itself.
 */
export function useDiscoveredWallets(): DiscoveredWallet[] {
  return useSyncExternalStore(subscribeWallets, getSnapshot, getServerSnapshot);
}
