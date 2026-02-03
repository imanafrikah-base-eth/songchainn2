import { useState, useEffect, useCallback } from 'react';
import { getWalletProvider } from '@/lib/baseWallet';

interface WalletBalanceState {
  balance: string | null;
  balanceWei: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and track wallet ETH balance on Base
 */
export function useWalletBalance(walletAddress: string | null): WalletBalanceState {
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceWei, setBalanceWei] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!walletAddress) {
      setBalance(null);
      setBalanceWei(null);
      return;
    }

    const provider = getWalletProvider();
    if (!provider) {
      setError('No wallet provider');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get balance in Wei (hex)
      const balanceHex = await provider.request({
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
      });

      // Convert hex to Wei string
      const weiValue = BigInt(balanceHex).toString();
      setBalanceWei(weiValue);

      // Convert Wei to ETH (divide by 10^18)
      const ethValue = Number(weiValue) / 1e18;
      
      // Format to reasonable decimal places
      let formatted: string;
      if (ethValue === 0) {
        formatted = '0';
      } else if (ethValue < 0.0001) {
        formatted = '<0.0001';
      } else if (ethValue < 0.01) {
        formatted = ethValue.toFixed(4);
      } else if (ethValue < 1) {
        formatted = ethValue.toFixed(3);
      } else {
        formatted = ethValue.toFixed(2);
      }

      setBalance(formatted);
    } catch (err: any) {
      if (import.meta.env.DEV) {
        console.error('Failed to fetch balance:', err);
      }
      setError(err?.message || 'Failed to fetch balance');
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  // Fetch on mount and when address changes
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!walletAddress) return;

    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [walletAddress, fetchBalance]);

  return {
    balance,
    balanceWei,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
