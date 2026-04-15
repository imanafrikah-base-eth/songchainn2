/**
 * SongRegistry Smart Contract Integration
 * 
 * ERC-1155 contract for song ownership on Base blockchain.
 * Contract address: 0x39e8317fEEBE3129f3d876c1F6D35271849797F9
 */

import { getWalletProvider, BASE_CHAIN_ID_HEX } from './baseWallet';

// Contract address on Base mainnet
export const SONG_REGISTRY_ADDRESS = "0x39e8317fEEBE3129f3d876c1F6D35271849797F9";

// Re-export for convenience
export { BASE_CHAIN_ID_HEX as BASE_CHAIN_ID };

// Interface for on-chain song data
export interface OnChainSong {
  songId: number;
  tokenAddress: string;
  artistWallet: string;
  priceWei?: string;
}

// Map of app song IDs to on-chain song data
export const ON_CHAIN_SONGS: Record<string, OnChainSong> = {

};

/**
 * Check if a song has on-chain integration
 */
export function isOnChainSong(songId: string): boolean {
  return songId in ON_CHAIN_SONGS;
}

/**
 * Get on-chain data for a song
 */
export function getOnChainSongData(songId: string): OnChainSong | null {
  return ON_CHAIN_SONGS[songId] || null;
}

/**
 * Offline plays storage keys
 */
const OFFLINE_PLAYS_PREFIX = "songchainn_offline_plays_";
const PREVIEW_USED_PREFIX = "songchainn_preview_used_";
const PREVIEW_TIME_PREFIX = "songchainn_preview_time_";
const PREVIEW_THRESHOLD_SECONDS = 5; // Lock after 5 seconds of preview playback

/**
 * Get remaining offline plays for a song
 */
export function getOfflinePlays(songId: string): number {
  const stored = localStorage.getItem(`${OFFLINE_PLAYS_PREFIX}${songId}`);
  return stored ? parseInt(stored, 10) : 0;
}

/**
 * Set offline plays for a song (granted when user holds $1+ worth)
 */
export function setOfflinePlays(songId: string, plays: number): void {
  localStorage.setItem(`${OFFLINE_PLAYS_PREFIX}${songId}`, plays.toString());
}

/**
 * Decrement offline plays after each offline playback
 */
export function decrementOfflinePlays(songId: string): number {
  const current = getOfflinePlays(songId);
  if (current > 0) {
    const newCount = current - 1;
    setOfflinePlays(songId, newCount);
    return newCount;
  }
  return 0;
}

/**
 * Get accumulated preview time for a song
 */
export function getPreviewTime(songId: string, userAddress?: string): number {
  const key = `${PREVIEW_TIME_PREFIX}${songId}_${userAddress || "anonymous"}`;
  const stored = localStorage.getItem(key);
  return stored ? parseFloat(stored) : 0;
}

/**
 * Add to accumulated preview time for a song
 * Returns true if preview threshold has been reached
 */
export function addPreviewTime(songId: string, seconds: number, userAddress?: string): boolean {
  const key = `${PREVIEW_TIME_PREFIX}${songId}_${userAddress || "anonymous"}`;
  const current = getPreviewTime(songId, userAddress);
  const newTotal = current + seconds;
  localStorage.setItem(key, newTotal.toString());
  
  // If threshold reached, mark preview as permanently used
  if (newTotal >= PREVIEW_THRESHOLD_SECONDS) {
    markPreviewUsed(songId, userAddress);
    return true;
  }
  return false;
}

/**
 * Check if preview has been used for a song (exceeded threshold)
 */
export function hasUsedPreview(songId: string, userAddress?: string): boolean {
  const key = `${PREVIEW_USED_PREFIX}${songId}_${userAddress || "anonymous"}`;
  return localStorage.getItem(key) === "true";
}

/**
 * Mark preview as permanently used for a song (locked until purchased)
 */
export function markPreviewUsed(songId: string, userAddress?: string): void {
  const key = `${PREVIEW_USED_PREFIX}${songId}_${userAddress || "anonymous"}`;
  localStorage.setItem(key, "true");
}

/**
 * Clear preview data when song is purchased (for ownership reset)
 */
export function clearPreviewData(songId: string, userAddress?: string): void {
  const timeKey = `${PREVIEW_TIME_PREFIX}${songId}_${userAddress || "anonymous"}`;
  const usedKey = `${PREVIEW_USED_PREFIX}${songId}_${userAddress || "anonymous"}`;
  localStorage.removeItem(timeKey);
  localStorage.removeItem(usedKey);
}

/**
 * Get the preview threshold in seconds
 */
export function getPreviewThreshold(): number {
  return PREVIEW_THRESHOLD_SECONDS;
}

/**
 * Calculate keccak256 hash for function signature (simplified for known functions)
 * This is a lookup table for the function selectors we use
 */
const FUNCTION_SELECTORS: Record<string, string> = {
  // keccak256("balanceOf(address,uint256)") = 0x00fdd58e
  "balanceOf": "00fdd58e",
  // keccak256("buySong(uint256,uint256)") = 0x74a56eb6
  "buySong": "74a56eb6",
  // keccak256("getSongPrice(uint256)") = 0x8c8d98a0 
  "getSongPrice": "8c8d98a0",
  // keccak256("getSongArtist(uint256)") = 0x6c0360eb
  "getSongArtist": "6c0360eb"
};

/**
 * Encode function call data for contract interaction
 * Uses proper ABI encoding for EVM function calls
 */
function encodeFunctionCall(functionName: string, params: any[]): string {
  const selector = FUNCTION_SELECTORS[functionName];
  if (!selector) {
    if (import.meta.env.DEV) {
      console.error(`Unknown function: ${functionName}`);
    }
    return "0x";
  }

  if (functionName === "balanceOf") {
    const [account, id] = params;
    // address is 20 bytes, padded to 32 bytes (64 hex chars)
    const addressPadded = account.slice(2).toLowerCase().padStart(64, "0");
    // uint256 is 32 bytes (64 hex chars)
    const idPadded = BigInt(id).toString(16).padStart(64, "0");
    return `0x${selector}${addressPadded}${idPadded}`;
  }
  
  if (functionName === "buySong") {
    const [songId, amount] = params;
    // Both are uint256, 32 bytes each
    const songIdPadded = BigInt(songId).toString(16).padStart(64, "0");
    const amountPadded = BigInt(amount).toString(16).padStart(64, "0");
    return `0x${selector}${songIdPadded}${amountPadded}`;
  }

  if (functionName === "getSongPrice") {
    const [songId] = params;
    const songIdPadded = BigInt(songId).toString(16).padStart(64, "0");
    return `0x${selector}${songIdPadded}`;
  }
  
  return "0x";
}

/**
 * Check user's token balance for a song
 */
export async function checkSongBalance(userAddress: string, songId: string): Promise<bigint> {
  const onChainData = getOnChainSongData(songId);
  if (!onChainData) return BigInt(0);
  
  const provider = getWalletProvider();
  if (!provider) {
    if (import.meta.env.DEV) {
      console.warn("No wallet provider available for balance check");
    }
    return BigInt(0);
  }
  
  try {
    const data = encodeFunctionCall("balanceOf", [userAddress, onChainData.songId]);
    
    const result = await provider.request({
      method: "eth_call",
      params: [
        {
          to: SONG_REGISTRY_ADDRESS,
          data
        },
        "latest"
      ]
    });
    
    return BigInt(result || "0");
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Error checking song balance:", error);
    }
    return BigInt(0);
  }
}

/**
 * Get song price from the smart contract
 */
export async function getSongPriceFromContract(songId: string): Promise<bigint | null> {
  const onChainData = getOnChainSongData(songId);
  if (!onChainData) return null;
  
  const provider = getWalletProvider();
  if (!provider) return null;
  
  try {
    const data = encodeFunctionCall("getSongPrice", [onChainData.songId]);
    
    const result = await provider.request({
      method: "eth_call",
      params: [
        {
          to: SONG_REGISTRY_ADDRESS,
          data
        },
        "latest"
      ]
    });
    
    return result ? BigInt(result) : null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Error fetching song price:", error);
    }
    return null;
  }
}

/**
 * Buy/unlock a song by sending ETH to the contract
 * The contract automatically handles:
 * - 95% to artist wallet
 * - 5% to $ongChainn treasury
 * - Minting ERC-1155 tokens to buyer
 * 
 * This function waits for blockchain confirmation before returning success
 */
export async function buySong(
  songId: string,
  amount: number = 1,
  priceWei: string,
  onStatusUpdate?: (status: string) => void
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const onChainData = getOnChainSongData(songId);
  if (!onChainData) {
    return { success: false, error: "Song not found on-chain" };
  }
  
  const provider = getWalletProvider();
  if (!provider) {
    return { success: false, error: "No wallet detected. Install MetaMask, Coinbase Wallet, Rainbow, or any wallet that supports Base." };
  }
  
  try {
    // Step 1: Get connected account
    onStatusUpdate?.("Connecting to wallet...");
    let accounts = await provider.request({ method: "eth_accounts" });
    
    if (!accounts || accounts.length === 0) {
      try {
        accounts = await provider.request({ method: "eth_requestAccounts" });
      } catch (e: any) {
        if (e?.code === 4001) {
          return { success: false, error: "Wallet connection rejected" };
        }
        return { success: false, error: "Please connect your wallet" };
      }
    }
    
    if (!accounts || accounts.length === 0) {
      return { success: false, error: "No wallet connected" };
    }
    
    const from = accounts[0];
    
    // Step 2: Ensure we're on Base network
    onStatusUpdate?.("Checking network...");
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    let currentChainId = await provider.request({ method: "eth_chainId" });

    if (currentChainId !== BASE_CHAIN_ID_HEX) {
      onStatusUpdate?.("Switching to Base network...");
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_CHAIN_ID_HEX }],
        });
      } catch (switchError: any) {
        if (switchError?.code === 4902) {
          // Chain not added, add it
          onStatusUpdate?.("Adding Base network...");
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
          } catch {
            return {
              success: false,
              error: "Failed to add Base network. Please add it in your wallet and try again.",
            };
          }
        } else if (switchError?.code === 4001) {
          return { success: false, error: "Please switch to Base network to continue" };
        } else {
          if (import.meta.env.DEV) {
            console.error("Chain switch error:", switchError);
          }
          return { success: false, error: "Failed to switch to Base network" };
        }
      }

      // Wait until the wallet actually reports Base (prevents race conditions)
      for (let i = 0; i < 12; i++) {
        await sleep(250);
        currentChainId = await provider.request({ method: "eth_chainId" });
        if (currentChainId === BASE_CHAIN_ID_HEX) break;
      }

      if (currentChainId !== BASE_CHAIN_ID_HEX) {
        return { success: false, error: "Network switch incomplete. Please try again." };
      }
    }

    // Step 3: Prepare transaction data
    onStatusUpdate?.("Preparing transaction...");
    const data = encodeFunctionCall("buySong", [onChainData.songId, amount]);

    if (data === "0x") {
      return { success: false, error: "Failed to encode transaction" };
    }

    // Convert price to hex - ensure it's valid
    const priceHex = `0x${BigInt(priceWei).toString(16)}`;

    // Transaction params - let wallet estimate gas for best reliability
    const txParams = {
      from,
      to: SONG_REGISTRY_ADDRESS,
      value: priceHex,
      data,
    };

    // Step 3.5: Preflight check (prevents "insufficient funds" due to fast-changing network fees)
    // We DO NOT force gas settings; we only estimate and make sure the wallet has enough for value + fee.
    try {
      onStatusUpdate?.("Estimating network fee...");
      const [gasPriceHex, balanceHex] = await Promise.all([
        provider.request({ method: "eth_gasPrice" }),
        provider.request({ method: "eth_getBalance", params: [from, "latest"] }),
      ]);

      const gasPrice = BigInt(gasPriceHex);
      const balanceWei = BigInt(balanceHex);

      // Use a fixed gas estimate (~100k) with buffer instead of eth_estimateGas 
      // (eth_estimateGas can revert if contract has validation issues we skip at runtime)
      const estimatedGas = BigInt(100000);
      const feeEstimateWei = (estimatedGas * gasPrice * BigInt(15)) / BigInt(10); // 50% buffer

      const requiredWei = BigInt(priceWei) + feeEstimateWei;

      if (balanceWei < requiredWei) {
        const shortWei = requiredWei - balanceWei;
        const shortEth = Number(shortWei) / 1e18;
        return {
          success: false,
          error: `Insufficient ETH. Add ~${shortEth.toFixed(5)} ETH on Base and try again.`,
        };
      }
    } catch (preflightError) {
      // If estimation fails for any wallet, don't block the flow — the wallet will still try.
      if (import.meta.env.DEV) {
        console.warn("Preflight balance check skipped:", preflightError);
      }
    }

    // Step 4: Send transaction
    onStatusUpdate?.("Confirm in your wallet...");

    let txHash: string;
    try {
      txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [txParams],
      });
    } catch (sendError: any) {
      if (import.meta.env.DEV) {
        console.error("Send transaction error:", sendError);
      }

      if (sendError?.code === 4001 || sendError?.code === "ACTION_REJECTED") {
        return { success: false, error: "Transaction cancelled" };
      }
      if (sendError?.code === -32002) {
        return {
          success: false,
          error: "A wallet request is already open. Please open your wallet and confirm or reject it.",
        };
      }
      if (
        sendError?.message?.toLowerCase().includes("insufficient") ||
        sendError?.message?.toLowerCase().includes("funds") ||
        sendError?.code === -32000
      ) {
        return {
          success: false,
          error: "Insufficient ETH for song price + network fee on Base. Please top up and try again.",
        };
      }
      if (sendError?.message?.toLowerCase().includes("nonce")) {
        return { success: false, error: "Transaction nonce issue. Please wait 30s and try again." };
      }
      if (
        sendError?.message?.toLowerCase().includes("underpriced") ||
        sendError?.message?.toLowerCase().includes("replacement")
      ) {
        return { success: false, error: "Network fee changed too fast. Please try again." };
      }

      return { success: false, error: sendError?.message || "Transaction failed" };
    }
    
    if (!txHash) {
      return { success: false, error: "No transaction hash received" };
    }

    // Step 5: Wait for blockchain confirmation (reduced timeout for faster feedback)
    onStatusUpdate?.("Transaction sent! Confirming...");

    const maxAttempts = 30; // ~60 seconds max (was 2 min - now faster feedback)
    const intervalMs = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Update status with elapsed time
      if (attempt > 0) {
        const seconds = attempt * 2;
        onStatusUpdate?.(`Confirming on blockchain... (${seconds}s)`);
      }

      try {
        const receipt = await provider.request({
          method: "eth_getTransactionReceipt",
          params: [txHash],
        });

        if (receipt) {
          const status = receipt.status;
          // Check for success (0x1 = success)
          if (status === "0x1" || status === 1 || status === "1") {
            onStatusUpdate?.("Transaction confirmed!");
            return { success: true, txHash };
          } else {
            // Transaction reverted on-chain
            return {
              success: false,
              txHash,
              error: "Transaction failed on blockchain. Please try again.",
            };
          }
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      } catch (receiptError) {
        if (import.meta.env.DEV) {
          console.error("Error checking receipt:", receiptError);
        }
        // Continue polling, don't fail yet
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    // Transaction submitted but not confirmed in time
    return {
      success: false,
      txHash,
      error: `Transaction still pending after 60s. View on BaseScan: basescan.org/tx/${txHash}`,
    };
    
  } catch (error: any) {
    if (import.meta.env.DEV) {
      console.error("Purchase error:", error);
    }
    
    // Handle specific error codes
    if (error?.code === 4001 || error?.code === "ACTION_REJECTED") {
      return { success: false, error: "Transaction cancelled" };
    }
    if (error?.code === -32603) {
      return { success: false, error: "Internal error. Please ensure you have enough ETH." };
    }
    if (error?.code === -32000) {
      return { success: false, error: "Insufficient funds for gas + value" };
    }
    if (error?.code === -32002) {
      return { success: false, error: "Request pending. Check your wallet." };
    }
    
    return { success: false, error: error?.message || "Transaction failed. Please try again." };
  }
}

/**
 * Format Wei to ETH string for display
 */
export function formatEthPrice(weiString: string): string {
  const wei = BigInt(weiString);
  const eth = Number(wei) / 1e18;
  return eth.toFixed(6);
}

/**
 * Parse ETH string to Wei
 */
export function parseEthToWei(ethAmount: string): string {
  const eth = parseFloat(ethAmount);
  const wei = BigInt(Math.floor(eth * 1e18));
  return wei.toString();
}
