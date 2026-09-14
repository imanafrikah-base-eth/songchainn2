import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, formatEther, http, type Address } from 'viem';
import { base } from 'viem/chains';

interface WalletBalanceState {
  /** ETH on Base as a plain decimal string ("0.00005"), safe for Number(). */
  balance: string | null;
  /** The same, short and readable for the screen ("<0.0001", "0.0421"). */
  display: string | null;
  balanceWei: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });

/** Short and honest: never rounds a real balance down to "0". */
export function formatEth(eth: number): string {
  if (!Number.isFinite(eth) || eth <= 0) return '0';
  if (eth < 0.0001) return '<0.0001';
  if (eth < 1) return eth.toFixed(4);
  return eth.toFixed(3);
}

/**
 * ETH on Base for an address.
 *
 * Read from Base itself, not through the wallet. Asking the wallet returned
 * whatever network it happened to be on (Ethereum, say), and the balance came
 * back as the string "<0.0001", which every Number() on screen turned into NaN
 * (founder, 14 Sep 2026). `balance` is a real decimal now and `display` is the
 * short form.
 */
export function useWalletBalance(walletAddress: string | null): WalletBalanceState {
  const [balanceWei, setBalanceWei] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      setBalanceWei(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const wei = await client.getBalance({ address: walletAddress as Address });
      setBalanceWei(wei.toString());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (!walletAddress) return;
    const interval = setInterval(() => void fetchBalance(), 30000);
    return () => clearInterval(interval);
  }, [walletAddress, fetchBalance]);

  const balance = balanceWei == null ? null : formatEther(BigInt(balanceWei));
  const display = balance == null ? null : formatEth(Number(balance));

  return { balance, display, balanceWei, isLoading, error, refetch: fetchBalance };
}
