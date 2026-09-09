import { getAddress } from "viem";

export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_ID_HEX = "0x2105";

export interface EIP1193Provider {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, callback: (...args: any[]) => void) => void;
  removeListener?: (event: string, callback: (...args: any[]) => void) => void;
}

interface ConnectResult {
  success: boolean;
  address?: string;
  chainId?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// EIP-6963 multi-wallet discovery
// Modern wallets (MetaMask, Coinbase/Base, Rainbow, Rabby, Phantom, ...)
// announce themselves via window events so multiple installed wallets can
// coexist instead of fighting over window.ethereum.
// ---------------------------------------------------------------------------

export interface WalletInfo {
  uuid: string;
  name: string;
  icon: string; // data: URI supplied by the wallet
  rdns: string; // reverse-DNS id, e.g. "io.metamask", "com.coinbase.wallet"
}

export interface DiscoveredWallet {
  info: WalletInfo;
  provider: EIP1193Provider;
}

// Replaced immutably on every announcement so React external-store
// subscribers see a new reference and re-render.
let discoveredWallets: DiscoveredWallet[] = [];
const walletListeners = new Set<() => void>();
let activeProvider: EIP1193Provider | null = null;
let discoveryStarted = false;

function startWalletDiscovery(): void {
  if (typeof window === "undefined" || discoveryStarted) return;
  discoveryStarted = true;

  window.addEventListener("eip6963:announceProvider", (event: Event) => {
    const detail = (event as CustomEvent).detail as DiscoveredWallet | undefined;
    if (!detail?.info?.rdns || typeof detail.provider?.request !== "function") return;
    const entry: DiscoveredWallet = { info: detail.info, provider: detail.provider };
    const existing = discoveredWallets.findIndex((w) => w.info.rdns === detail.info.rdns);
    discoveredWallets = existing >= 0
      ? discoveredWallets.map((w, i) => (i === existing ? entry : w))
      : [...discoveredWallets, entry];
    optionsDirty = true;
    walletListeners.forEach((cb) => cb());
  });

  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

// Kick off discovery as soon as this module loads so wallets are known
// by the time any UI renders.
startWalletDiscovery();

export function getDiscoveredWallets(): DiscoveredWallet[] {
  startWalletDiscovery();
  return discoveredWallets;
}

/** Subscribe to wallet discovery changes. Returns an unsubscribe function. */
export function subscribeWallets(callback: () => void): () => void {
  startWalletDiscovery();
  walletListeners.add(callback);
  return () => walletListeners.delete(callback);
}

// ---------------------------------------------------------------------------
// Wallets that need no extension: the wallet app already on the phone.
//
// A phone browser has no injected provider, and the old answer was a link
// that opened SONGCHAINN inside the wallet's own browser, so the person left
// the app to connect. These two go the other way. Coinbase's SDK reaches the
// Base app / Coinbase Wallet on the device (or a passkey wallet with no app
// at all) and comes straight back; MetaMask's SDK hands off to the MetaMask
// app and returns the same way. Both load on demand, in their own chunk, so
// nobody pays for them until they tap a wallet.
// ---------------------------------------------------------------------------

export const COINBASE_SDK_RDNS = "com.coinbase.wallet.sdk";
export const METAMASK_SDK_RDNS = "io.metamask.sdk";
const SDK_STORE_KEY = "songchainn_wallet_sdk";

export interface WalletOption {
  rdns: string;
  name: string;
  icon: string;
  /** True when the wallet is reached through its SDK rather than an injected provider. */
  sdk: boolean;
}

const COINBASE_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#0052FF"/><rect x="10" y="10" width="12" height="12" rx="2.5" fill="#fff"/></svg>',
  );
const METAMASK_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#F6851B"/><path d="M8 9l8 5 8-5-2 9-6 4-6-4z" fill="#fff"/></svg>',
  );

interface SdkWalletDef {
  rdns: string;
  name: string;
  icon: string;
  /** An injected wallet that makes this SDK entry redundant. */
  covers: (injectedRdns: string) => boolean;
  /** The module only; cheap to prefetch, no side effects. */
  prefetch: () => Promise<unknown>;
  load: () => Promise<EIP1193Provider>;
}

function appMeta() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.songchainn.xyz";
  return { name: "SONGCHAINN", url: origin, icon: origin + "/songchainn-logo.webp" };
}

const SDK_WALLETS: SdkWalletDef[] = [
  {
    rdns: COINBASE_SDK_RDNS,
    name: "Base app / Coinbase Wallet",
    icon: COINBASE_ICON,
    covers: (r) => r.startsWith("com.coinbase"),
    prefetch: () => import("@coinbase/wallet-sdk"),
    load: async () => {
      const { createCoinbaseWalletSDK } = await import("@coinbase/wallet-sdk");
      const m = appMeta();
      const sdk = createCoinbaseWalletSDK({
        appName: m.name,
        appLogoUrl: m.icon,
        appChainIds: [BASE_CHAIN_ID],
        // 'all' lets the person choose: the wallet app already on the phone,
        // or a passkey wallet that needs no app.
        preference: { options: "all" },
      });
      return sdk.getProvider() as unknown as EIP1193Provider;
    },
  },
  {
    rdns: METAMASK_SDK_RDNS,
    name: "MetaMask",
    icon: METAMASK_ICON,
    covers: (r) => r.startsWith("io.metamask"),
    prefetch: () => import("@metamask/sdk"),
    load: async () => {
      const { MetaMaskSDK } = await import("@metamask/sdk");
      const m = appMeta();
      const sdk = new MetaMaskSDK({
        dappMetadata: { name: m.name, url: m.url, iconUrl: m.icon },
        checkInstallationImmediately: false,
        useDeeplink: true,
        logging: { developerMode: false },
      });
      await sdk.init();
      const provider = sdk.getProvider();
      if (!provider) throw new Error("MetaMask could not start. Try again.");
      return provider as unknown as EIP1193Provider;
    },
  },
];

const sdkProviders = new Map<string, Promise<EIP1193Provider>>();

export function isSdkWallet(rdns?: string | null): boolean {
  return !!rdns && SDK_WALLETS.some((d) => d.rdns === rdns);
}

/** Warm the SDK modules while a picker is on screen, so a tap connects at once. */
export function prefetchSdkWallets(): void {
  if (typeof window === "undefined") return;
  for (const d of SDK_WALLETS) void d.prefetch().catch(() => undefined);
}

function loadSdkWallet(rdns: string): Promise<EIP1193Provider> {
  const def = SDK_WALLETS.find((d) => d.rdns === rdns);
  if (!def) return Promise.reject(new Error("Unknown wallet"));
  let pending = sdkProviders.get(rdns);
  if (!pending) {
    pending = def.load().catch((err) => {
      sdkProviders.delete(rdns);
      throw err;
    });
    sdkProviders.set(rdns, pending);
  }
  return pending;
}

let optionsCache: WalletOption[] = [];
let optionsDirty = true;

/**
 * Every way to connect from here: each installed wallet, then the SDK-backed
 * ones that are not already covered by an installed wallet. Never empty, so
 * a phone browser always has a real option rather than a link out.
 */
export function getWalletOptions(): WalletOption[] {
  startWalletDiscovery();
  if (optionsDirty) {
    const injected = discoveredWallets.map((w) => ({ rdns: w.info.rdns, name: w.info.name, icon: w.info.icon, sdk: false }));
    const extra = SDK_WALLETS
      .filter((d) => !discoveredWallets.some((w) => d.covers(w.info.rdns)))
      .map((d) => ({ rdns: d.rdns, name: d.name, icon: d.icon, sdk: true }));
    optionsCache = [...injected, ...extra];
    optionsDirty = false;
  }
  return optionsCache;
}

/**
 * Pick which wallet subsequent connect/sign calls should use: an installed
 * one by its EIP-6963 id, an SDK one (loaded here), or undefined for
 * window.ethereum. The SDK choice is remembered so a reload finds the same
 * wallet again without asking.
 */
export async function selectWallet(rdns?: string): Promise<void> {
  if (!rdns) {
    activeProvider = null;
    forgetSdkChoice();
    return;
  }
  if (isSdkWallet(rdns)) {
    activeProvider = await loadSdkWallet(rdns);
    try { localStorage.setItem(SDK_STORE_KEY, rdns); } catch { /* private mode */ }
    return;
  }
  const match = discoveredWallets.find((w) => w.info.rdns === rdns);
  activeProvider = match ? match.provider : null;
  forgetSdkChoice();
}

function forgetSdkChoice(): void {
  try { localStorage.removeItem(SDK_STORE_KEY); } catch { /* private mode */ }
}

/** After a reload, quietly bring back the SDK wallet they last connected with. */
function restoreSdkWallet(): void {
  if (typeof window === "undefined") return;
  let rdns: string | null = null;
  try { rdns = localStorage.getItem(SDK_STORE_KEY); } catch { return; }
  if (!rdns || !isSdkWallet(rdns)) return;
  void loadSdkWallet(rdns)
    .then((provider) => {
      if (!activeProvider) {
        activeProvider = provider;
        walletListeners.forEach((cb) => cb());
      }
    })
    .catch(() => forgetSdkChoice());
}
restoreSdkWallet();

export function hasWalletProvider(): boolean {
  if (typeof window === "undefined") return false;
  if (getDiscoveredWallets().length > 0) return true;
  const ethereum = (window as any).ethereum;
  return !!ethereum?.request;
}

export function getWalletProvider(): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  if (activeProvider) return activeProvider;
  const ethereum = (window as any).ethereum;
  if (ethereum?.request) return ethereum as EIP1193Provider;
  // No injected window.ethereum but an EIP-6963 wallet announced itself
  return discoveredWallets[0]?.provider ?? null;
}

/**
 * EIP-55 checksum an address.
 *
 * SIWE (EIP-4361) requires the address line to be checksummed, and strict
 * wallets enforce it. Phantom parses the message, compares the address line
 * against its own account, and refuses to even display the request when the
 * casing does not match, with "the address does not match the provided
 * address for verification". Wallets return accounts in mixed casing, so
 * normalise before the address goes anywhere near a message or a signature.
 */
export function toChecksumAddress(address: string): string {
  try {
    return getAddress(address as `0x${string}`);
  } catch {
    return address;
  }
}

export function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function switchToBaseChain(provider: EIP1193Provider): Promise<boolean> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
    return true;
  } catch (switchError: any) {
    // Chain not added, try to add it
    if (switchError?.code === 4902) {
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: BASE_CHAIN_ID_HEX,
              chainName: "Base",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://mainnet.base.org"],
              blockExplorerUrls: ["https://basescan.org"],
            },
          ],
        });
        return true;
      } catch (addError) {
        if (import.meta.env.DEV) {
          console.error("Failed to add Base chain:", addError);
        }
        return false;
      }
    }
    // User rejected or other error - still try to proceed
    if (import.meta.env.DEV) {
      console.warn("Chain switch warning:", switchError);
    }
    return true;
  }
}

export async function connectWallet(walletRdns?: string): Promise<ConnectResult> {
  if (walletRdns) {
    try {
      await selectWallet(walletRdns);
    } catch (err: any) {
      return { success: false, error: err?.message || "That wallet could not be started. Try again." };
    }
  }
  const provider = getWalletProvider();
  
  if (!provider) {
    return {
      success: false,
      error: "No wallet detected. Please install MetaMask, Coinbase Wallet, or another Web3 wallet.",
    };
  }

  try {
    // Request account access
    const accounts = await provider.request({
      method: "eth_requestAccounts",
      params: [],
    });

    if (!accounts || accounts.length === 0) {
      return {
        success: false,
        error: "No accounts returned from wallet",
      };
    }

    const address = toChecksumAddress(accounts[0]);

    // Switch to Base chain
    await switchToBaseChain(provider);

    // Get current chain ID
    const chainIdHex = await provider.request({ method: "eth_chainId" });
    const chainId = parseInt(chainIdHex, 16);

    return {
      success: true,
      address,
      chainId,
    };
  } catch (error: any) {
    // User rejected request
    if (error?.code === 4001) {
      return { success: false, error: "Connection request was rejected" };
    }

    if (import.meta.env.DEV) {
      console.error("Wallet connection error:", error);
    }
    return {
      success: false,
      error: error?.message || "Failed to connect wallet",
    };
  }
}

export async function getConnectedAccounts(): Promise<string[]> {
  const provider = getWalletProvider();
  if (!provider) return [];

  try {
    const accounts = await provider.request({
      method: "eth_accounts",
      params: [],
    });
    return accounts || [];
  } catch {
    return [];
  }
}

export async function signMessage(message: string, address: string): Promise<{ signature?: string; error?: string }> {
  const provider = getWalletProvider();
  if (!provider) {
    return { error: "No wallet provider" };
  }

  try {
    const signature = await provider.request({
      method: "personal_sign",
      params: [message, address],
    });
    return { signature };
  } catch (error: any) {
    if (error?.code === 4001) {
      return { error: "Signature request was rejected" };
    }
    return { error: error?.message || "Failed to sign message" };
  }
}

export async function sendTransaction(params: {
  from: string;
  to: string;
  value: string;
  data?: string;
}): Promise<{ txHash?: string; error?: string }> {
  const provider = getWalletProvider();
  if (!provider) {
    return { error: "No wallet provider" };
  }

  try {
    // Ensure we're on Base
    await switchToBaseChain(provider);

    const txHash = await provider.request({
      method: "eth_sendTransaction",
      params: [{
        from: params.from,
        to: params.to,
        value: params.value,
        data: params.data || "0x",
      }],
    });

    return { txHash };
  } catch (error: any) {
    if (error?.code === 4001) {
      return { error: "Transaction was rejected" };
    }
    return { error: error?.message || "Transaction failed" };
  }
}
