import { connectWallet, getDiscoveredWallets } from '@/lib/baseWallet';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

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

export function isWalletGateOpen(): boolean {
  return modalOpen;
}

/** Persist the connected address on the Supabase user so it survives reloads. */
async function persistWalletAddress(address: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      await supabase.auth.updateUser({ data: { wallet_address: address } });
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
export function resolveWalletGate(address: string | null): void {
  modalOpen = false;
  notifyGate();
  const resolve = pendingResolver;
  pendingResolver = null;
  if (address) void persistWalletAddress(address);
  resolve?.(address);
}

export async function requestWalletConnection(): Promise<string | null> {
  // Fast path 1: inside a Farcaster / Base miniapp use the frame wallet.
  const frameAddress = await connectViaFarcasterFrame();
  if (frameAddress) {
    void persistWalletAddress(frameAddress);
    return frameAddress;
  }

  // Fast path 2: a single obvious wallet - connect directly, no picker.
  const wallets = getDiscoveredWallets();
  const hasLegacy = typeof window !== 'undefined' && !!(window as any).ethereum?.request;
  if (wallets.length === 1 || (wallets.length === 0 && hasLegacy)) {
    const result = await connectWallet(wallets[0]?.info.rdns);
    if (result.success && result.address) {
      void persistWalletAddress(result.address);
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
