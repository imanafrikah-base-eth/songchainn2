import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSongCoin } from '@/hooks/useSongCoins';
import { buyCoinWithEth, sellCoinForEth, getCoinTokenBalance, type TradeResult } from '@/lib/zoraTrading';
import {
  getOfflinePlays,
  setOfflinePlays,
  decrementOfflinePlays,
  clearPreviewData
} from '@/lib/songRegistry';

export type OwnershipStatus = 'free' | 'preview' | 'preview_used' | 'owned' | 'offline_ready';

interface SongOwnership {
  status: OwnershipStatus;
  balance: bigint;
  offlinePlaysRemaining: number;
  previewSecondsRemaining: number;
  isLoading: boolean;
  canPlay: boolean;
  isPreviewOnly: boolean;
  isLocked: boolean;
  coinAddress: string | null;
  checkOwnership: () => Promise<void>;
  unlockSong: (ethAmount: string, walletAddressOverride?: string, onStatusUpdate?: (status: string) => void) => Promise<TradeResult>;
  sellSong: (amount?: bigint, walletAddressOverride?: string, onStatusUpdate?: (status: string) => void) => Promise<TradeResult>;
  recordPreviewPlay: () => void;
  recordOfflinePlay: () => number;
}

/**
 * Hook to manage song ownership state and playback permissions.
 * Ownership = holding balance of the song's real Zora Content Coin on Base.
 */
export function useSongOwnership(songId: string): SongOwnership {
  const { user } = useAuth();
  const coin = useSongCoin(songId);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [offlinePlaysRemaining, setOfflinePlaysRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const userAddress = user?.user_metadata?.wallet_address;
  const coinAddress = coin?.zora_coin_address ?? null;
  const isTokenGated = !!coinAddress;

  const previewSecondsRemaining = 0;

  const getStatus = useCallback((): OwnershipStatus => {
    if (!isTokenGated) return 'free';

    if (balance > BigInt(0)) {
      const offlinePlays = getOfflinePlays(songId);
      if (offlinePlays > 0) return 'offline_ready';
      return 'owned';
    }
    return 'preview';
  }, [isTokenGated, balance, songId]);

  const status = getStatus();

  const isLocked = status === 'preview_used';
  const canPlay = status !== 'preview_used';
  const isPreviewOnly = status === 'preview';

  const checkOwnership = useCallback(async () => {
    if (!isTokenGated || !userAddress || !coinAddress) {
      setBalance(BigInt(0));
      return;
    }

    setIsLoading(true);
    try {
      const onChainBalance = await getCoinTokenBalance(
        coinAddress as `0x${string}`,
        userAddress as `0x${string}`
      );
      setBalance(onChainBalance);

      if (onChainBalance > BigInt(0)) {
        const currentOffline = getOfflinePlays(songId);
        if (currentOffline === 0) {
          setOfflinePlays(songId, 1000);
          setOfflinePlaysRemaining(1000);
        } else {
          setOfflinePlaysRemaining(currentOffline);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error checking song ownership:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isTokenGated, userAddress, songId, coinAddress]);

  useEffect(() => {
    if (isTokenGated) setOfflinePlaysRemaining(getOfflinePlays(songId));
  }, [isTokenGated, songId]);

  useEffect(() => {
    if (userAddress && isTokenGated) {
      checkOwnership();
    }
  }, [userAddress, isTokenGated, checkOwnership]);

  const unlockSong = useCallback(async (
    ethAmount: string,
    walletAddressOverride?: string,
    onStatusUpdate?: (status: string) => void
  ): Promise<TradeResult> => {
    if (!isTokenGated || !coinAddress) {
      return { success: false, error: 'Song is not token-gated' };
    }

    const addressToUse = walletAddressOverride || userAddress;
    if (!addressToUse) {
      return { success: false, error: 'Please connect your wallet first' };
    }

    onStatusUpdate?.('Confirm in your wallet...');
    const result = await buyCoinWithEth({
      coinAddress: coinAddress as `0x${string}`,
      ethAmount,
      userAddress: addressToUse as `0x${string}`,
    });

    if (result.success) {
      onStatusUpdate?.('Finalizing...');
      clearPreviewData(songId, addressToUse);
      await checkOwnership();
    }

    return result;
  }, [isTokenGated, coinAddress, userAddress, songId, checkOwnership]);

  const sellSong = useCallback(async (
    amount?: bigint,
    walletAddressOverride?: string,
    onStatusUpdate?: (status: string) => void
  ): Promise<TradeResult> => {
    if (!coinAddress) {
      return { success: false, error: 'Song is not token-gated' };
    }

    const addressToUse = walletAddressOverride || userAddress;
    if (!addressToUse) {
      return { success: false, error: 'Please connect your wallet first' };
    }

    const amountToSell = amount ?? balance;
    if (amountToSell <= BigInt(0) || amountToSell > balance) {
      return { success: false, error: 'Nothing to sell' };
    }

    onStatusUpdate?.('Confirm in your wallet...');
    const result = await sellCoinForEth({
      coinAddress: coinAddress as `0x${string}`,
      tokenAmount: amountToSell,
      userAddress: addressToUse as `0x${string}`,
    });

    if (result.success) {
      onStatusUpdate?.('Finalizing...');
      await checkOwnership();
    }

    return result;
  }, [coinAddress, userAddress, balance, checkOwnership]);

  const recordPreviewPlay = useCallback(() => {}, []);

  const recordOfflinePlay = useCallback((): number => {
    if (!isTokenGated || status !== 'offline_ready') return 0;

    const remaining = decrementOfflinePlays(songId);
    setOfflinePlaysRemaining(remaining);
    return remaining;
  }, [isTokenGated, status, songId]);

  return {
    status,
    balance,
    offlinePlaysRemaining,
    previewSecondsRemaining,
    isLoading,
    canPlay,
    isPreviewOnly,
    isLocked,
    coinAddress,
    checkOwnership,
    unlockSong,
    sellSong,
    recordPreviewPlay,
    recordOfflinePlay
  };
}

/**
 * Get display text for ownership status
 */
export function getOwnershipLabel(status: OwnershipStatus, offlinePlays?: number): string {
  switch (status) {
    case 'free':
      return '';
    case 'preview':
      return 'Stream';
    case 'preview_used':
      return 'Stream';
    case 'owned':
      return 'Owned';
    case 'offline_ready':
      return `Offline Ready (${offlinePlays} plays)`;
    default:
      return '';
  }
}
