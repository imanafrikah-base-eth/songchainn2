import { connectWallet, getDiscoveredWallets } from '@/lib/baseWallet';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { providerFromRdns, rememberWallet, type WalletProvider } from '@/hooks/useMyWallets';

/**
 * Smart wallet connection gate for trading actions (buy, sell, unlock).
 *
 * requestWalletConnection() resolves with an address using the fastest path
 * for the current environment:
 * - Farcaster / Base miniapp: the frame's built-in wallet, no UI
 * - Exactly one installed wallet: connect to it directly, no UI
 * - Several installed wallets: opens the global ConnectWalletModal picker
 * - No wallet: opens the modal with install / deep-link options
 */

type Resolver = (address: string | null) => void;

let pendingResolver: Resolver | null = null;
let modalOpen = false;
const gateListeners = new Set<() => void>();

function notifyGate(): void {
  gateListeners.forEach((cb) => cb());
}

export function subscribeWalletGate(callback: () => void): () => void {
  gateListeners.add(callback);
  return () => gateListeners.delete(callback);
}

/* Whoever is showing the wallet needs to know the moment one connects,
   without waiting for a reload. */
const walletListeners = new Set<(address: string | null) => void>();

export function subscribeWalletChanges(cb: (address: string | null) => void): () => void {
  walletListeners.add(cb);
  return () => walletListeners.delete(cb);
}

function walletChanged(address: string | null): void {
  walletListeners.forEach((cb) => cb(address));
}

export function isWalletGateOpen(): boolean {
  return modalOpen;
}

/**
 * Keep the connected address on the account, not just in this tab.
 *
 * It used to go only into auth metadata, which nothing read back, so the app
 * asked to connect a wallet that was already connected and the top bar never
 * showed one. Now it is a row on the account with the wallet it came from,
 * and everything that spends reads the active one.
 */
async function persistWalletAddress(address: string, provider: WalletProvider = 'other'): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      await supabase.auth.updateUser({ data: { wallet_address: address } });
      await rememberWallet(address, provider);
      walletChanged(address);
    }
  } catch {
    // Best effort only; the in-memory address still works for this session.
  }
}

async function connectViaFarcasterFrame(): Promise<string | null> {
  try {
    const { default: sdk } = await import('@farcaster/miniapp-sdk');
    const inMiniApp = await sdk.isInMiniApp().catch(() => false);
    if (!inMiniApp) return null;
    const provider = sdk.wallet?.ethProvider;
    if (!provider?.request) return null;
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Called by ConnectWalletModal when the user picks a wallet or cancels. */
export function resolveWalletGate(address: string | null, provider: WalletProvider = 'other'): void {
  modalOpen = false;
  notifyGate();
  const resolve = pendingResolver;
  pendingResolver = null;
  if (address) void persistWalletAddress(address, provider);
  resolve?.(address);
}

export async function requestWalletConnection(): Promise<string | null> {
  // Fast path 1: inside a Farcaster / Base miniapp use the frame wallet.
  const frameAddress = await connectViaFarcasterFrame();
  if (frameAddress) {
    void persistWalletAddress(frameAddress, 'farcaster');
    return frameAddress;
  }

  // Fast path 2: a single obvious wallet - connect directly, no picker.
  const wallets = getDiscoveredWallets();
  const hasLegacy = typeof window !== 'undefined' && !!(window as any).ethereum?.request;
  if (wallets.length === 1 || (wallets.length === 0 && hasLegacy)) {
    const only = wallets[0]?.info;
    const result = await connectWallet(only?.rdns);
    if (result.success && result.address) {
      void persistWalletAddress(result.address, providerFromRdns(only?.rdns, only?.name));
      return result.address;
    }
    // Fall through to the modal so the user sees options instead of a dead end.
  }

  // Modal path: several wallets to pick from, or none installed.
  if (pendingResolver) pendingResolver(null);
  modalOpen = true;
  notifyGate();
  return new Promise<string | null>((resolve) => {
    pendingResolver = resolve;
  });
}
