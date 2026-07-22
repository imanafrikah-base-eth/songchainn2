// Client-side access hook for a world. Asks the world-gate edge function
// which rings are open for the connected wallet. The server is the only
// enforcement boundary (spec §03: gate on the server); this hook exists so
// the client can paint doors and re-resolve on wallet change.
// Fail closed: any error resolves to locked doors, never open ones.

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { getConnectedAccounts } from '@/lib/baseWallet';
import { requestWalletConnection } from '@/lib/walletGate';
import type { WorldConfig, WorldRings } from './types';

function prelaunchRings(): WorldRings {
  return {
    ring0: true,
    ring1: false,
    ring2: false,
    council: false,
    balance: 0,
    thresholds: { FAN: 1_000, INSIDER: 10_000 },
    rank: null,
    tokenLive: false,
  };
}

export interface WorldAccess {
  wallet: string | null;
  rings: WorldRings;
  isResolving: boolean;
  connect: () => Promise<string | null>;
  refresh: () => void;
}

export function useWorldAccess(world: WorldConfig): WorldAccess {
  const [wallet, setWallet] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Recover an already-connected wallet: the signed-in user's saved address
  // first, then any account the browser wallet already exposes.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (isSupabaseConfigured) {
          const { data } = await supabase.auth.getSession();
          const saved = (data?.session?.user?.user_metadata as { wallet_address?: string } | undefined)
            ?.wallet_address;
          if (active && saved) {
            setWallet(saved);
            return;
          }
        }
        const accounts = await getConnectedAccounts();
        if (active && accounts[0]) setWallet(accounts[0]);
      } catch {
        // No wallet recoverable; the visitor connects explicitly.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['world-gate', world.slug, wallet?.toLowerCase() ?? null],
    queryFn: async (): Promise<WorldRings> => {
      if (!isSupabaseConfigured) return prelaunchRings();
      const { data: payload, error } = await supabase.functions.invoke('world-gate', {
        body: { world: world.slug, wallet },
      });
      if (error || !payload?.rings) return prelaunchRings();
      return payload.rings as WorldRings;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const connect = useCallback(async () => {
    const address = await requestWalletConnection();
    if (address) {
      setWallet(address);
      void queryClient.invalidateQueries({ queryKey: ['world-gate', world.slug] });
    }
    return address;
  }, [queryClient, world.slug]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    wallet,
    rings: data ?? prelaunchRings(),
    isResolving: isLoading,
    connect,
    refresh,
  };
}
