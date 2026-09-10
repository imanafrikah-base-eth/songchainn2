import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * The wallets on this account, and the one money moves through.
 *
 * A connection used to live only in the tab it happened in, so the app asked
 * to connect a wallet that was already connected and the top bar never
 * showed one. Every wallet a person adds is now kept with how they connected
 * it, and exactly one is active. Everything that spends reads the active
 * one, so a person with three wallets always knows which is about to pay.
 */

export type WalletProvider =
  | 'metamask' | 'coinbase' | 'farcaster' | 'zora' | 'rainbow' | 'phantom' | 'rabby' | 'walletconnect' | 'other';

export interface MyWallet {
  id: string;
  address: string;
  provider: WalletProvider;
  label: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

/** What to call each one on screen. */
export const WALLET_NAMES: Record<WalletProvider, string> = {
  metamask: 'MetaMask',
  coinbase: 'Base app',
  farcaster: 'Farcaster',
  zora: 'Zora',
  rainbow: 'Rainbow',
  phantom: 'Phantom',
  rabby: 'Rabby',
  walletconnect: 'WalletConnect',
  other: 'Wallet',
};

/** Work out which wallet a connection came from, by its own name. */
export function providerFromRdns(rdns?: string | null, name?: string | null): WalletProvider {
  const s = `${rdns ?? ''} ${name ?? ''}`.toLowerCase();
  if (s.includes('metamask')) return 'metamask';
  if (s.includes('coinbase') || s.includes('base')) return 'coinbase';
  if (s.includes('farcaster') || s.includes('warpcast')) return 'farcaster';
  if (s.includes('zora')) return 'zora';
  if (s.includes('rainbow')) return 'rainbow';
  if (s.includes('phantom')) return 'phantom';
  if (s.includes('rabby')) return 'rabby';
  if (s.includes('walletconnect')) return 'walletconnect';
  return 'other';
}

export function shortAddress(address?: string | null): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function useMyWallets() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['my-wallets', user?.id];

  const query = useQuery<MyWallet[]>({
    queryKey: key,
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_wallets' as never)
        .select('id, address, provider, label, is_active, created_at, last_used_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true });
      if (error) return [];
      return (data ?? []) as unknown as MyWallet[];
    },
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    // The gates and the coin rails read the active address off the profile.
    await queryClient.invalidateQueries({ queryKey: ['audience-profile'] });
  }, [queryClient, user?.id]);

  const setActive = useMutation({
    mutationFn: async (address: string) => {
      const { error } = await supabase.rpc('set_active_wallet' as never, { p_address: address } as never);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const forget = useMutation({
    mutationFn: async (address: string) => {
      const { error } = await supabase.rpc('forget_wallet' as never, { p_address: address } as never);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const wallets = query.data ?? [];
  return {
    wallets,
    active: wallets.find((w) => w.is_active) ?? null,
    isLoading: query.isLoading,
    setActive,
    forget,
    refresh,
  };
}

/**
 * Remember a wallet the moment it connects. Safe to call every time; the
 * server keeps one row per address and makes the first one active.
 */
export async function rememberWallet(address: string, provider: WalletProvider = 'other', label?: string): Promise<void> {
  try {
    await supabase.rpc('add_my_wallet' as never, { p_address: address, p_provider: provider, p_label: label ?? null } as never);
  } catch {
    /* the address still works for this session */
  }
}
