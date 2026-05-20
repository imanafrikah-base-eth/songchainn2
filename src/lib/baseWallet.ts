export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_ID_HEX = "0x2105";

interface EIP1193Provider {
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

export function hasWalletProvider(): boolean {
  if (typeof window === "undefined") return false;
  const ethereum = (window as any).ethereum;
  return !!ethereum?.request;
}

export function getWalletProvider(): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  const ethereum = (window as any).ethereum;
  if (!ethereum?.request) return null;
  return ethereum as EIP1193Provider;
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

export async function connectWallet(): Promise<ConnectResult> {
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

    const address = accounts[0];

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
