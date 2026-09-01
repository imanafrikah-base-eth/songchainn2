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
    thresholds: { FAN: 500_000, INSIDER: 5_000_000 },
    rank: null,
    tokenLive: false,
  };
}

/**
 * Dev-only rings override, so the inside of a world can be reviewed before its
 * token is live. `?preview=fan` on a world route paints the doors a fan would
 * see; `insider` and `council` paint the ones above it.
 *
 * `import.meta.env.DEV` compiles to `false` in every built bundle and this
 * whole branch is dropped, so it cannot reach production. The world-gate edge
 * function stays the only real enforcement boundary regardless: this paints
 * doors, it does not open them.
 */
function devPreviewView(): string | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const fromUrl = new URLSearchParams(window.location.search).get('preview');
  // Held for the tab, because clicking through to a room drops the query
  // string and the preview would silently fall back to locked doors.
  try {
    if (fromUrl) sessionStorage.setItem('world-preview', fromUrl);
    return fromUrl ?? sessionStorage.getItem('world-preview');
  } catch {
    return fromUrl;
  }
}

/**
 * A door also asks whether a wallet is connected at all, so a preview with no
 * wallet paints every gated door 'no-wallet' and the review shows the outside
 * again. This stands in for one. Obviously fake, and dev-only.
 */
const PREVIEW_WALLET = '0x0000000000000000000000000000000000000001';

function devPreviewRings(): WorldRings | null {
  const view = devPreviewView();
  if (!view) return null;
  const level = ({ fan: 1, insider: 2, council: 3 } as Record<string, number>)[view.toLowerCase()];
  if (!level) return null;
  const thresholds = { FAN: 500_000, INSIDER: 5_000_000 };
  return {
    ring0: true,
    ring1: level >= 1,
    ring2: level >= 2,
    council: level >= 3,
    balance: level >= 3 ? 50_000_000 : level >= 2 ? thresholds.INSIDER : thresholds.FAN,
    thresholds,
    rank: level >= 3 ? 1 : null,
    tokenLive: true,
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
    queryKey: ['world-gate', world.slug, wallet?.toLowerCase() ?? null, devPreviewView()],
    queryFn: async (): Promise<WorldRings> => {
      const preview = devPreviewRings();
      if (preview) return preview;
      if (!isSupabaseConfigured) return prelaunchRings();
      const { data: payload, error } = await supabase.functions.invoke('world-gate', {
        body: { world: world.slug, wallet },
      });
      const rings = (error || !payload?.rings ? prelaunchRings() : (payload.rings as WorldRings));

      /*
       * Doors an artist locked with one of their own songs are answered from the
       * visitor's song holdings, not from the world token. Those balances were
       * read from Base by the song-holdings function, so a song key is checked
       * against a real chain balance rather than anything the browser claims.
       */
      const { data: holder } = await supabase.rpc('get_my_holder_profile' as never);
      const holdings = (holder as { holdings?: Array<{ song_id: string; balance: string }> } | null)
        ?.holdings ?? [];
      const heldSongs: Record<string, string> = {};
      for (const h of holdings) heldSongs[h.song_id] = h.balance;

      return { ...rings, heldSongs };
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
    wallet: wallet ?? (devPreviewView() ? PREVIEW_WALLET : null),
    rings: data ?? prelaunchRings(),
    isResolving: isLoading,
    connect,
    refresh,
  };
}
