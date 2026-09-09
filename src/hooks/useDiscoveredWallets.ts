import { useSyncExternalStore } from "react";
import {
  getDiscoveredWallets,
  getWalletOptions,
  subscribeWallets,
  type DiscoveredWallet,
  type WalletOption,
} from "@/lib/baseWallet";

const emptyWallets: DiscoveredWallet[] = [];
const emptyOptions: WalletOption[] = [];

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

/**
 * Every way to connect from this browser: installed wallets first, then the
 * wallet apps reachable through their SDKs (Base app / Coinbase Wallet,
 * MetaMask). Never empty, so a phone always has a real option.
 */
export function useWalletOptions(): WalletOption[] {
  return useSyncExternalStore(subscribeWallets, getWalletOptions, () => emptyOptions);
}
