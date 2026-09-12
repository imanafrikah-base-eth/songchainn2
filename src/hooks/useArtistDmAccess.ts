import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * May the signed-in person message this musician?
 *
 * Fans reach a musician only while holding that musician's artist coin. The
 * answer comes from the artist-dm-gate edge function, which reads the coin off
 * Base for the caller's verified wallets and records it, and the DM RPCs
 * enforce that record. This hook only explains; it never unlocks anything.
 */

export type ArtistDmReason =
  | 'not_artist'
  | 'exempt'
  | 'replied'
  | 'holds'
  | 'no_balance'
  | 'no_verified_wallet'
  | 'no_coin'
  | 'check_failed';

export interface ArtistDmAccess {
  allowed: boolean;
  reason: ArtistDmReason;
  balance: number;
  /** What the holding is worth, priced by the server from Zora. */
  usdValue: number;
  coinAddress: string | null;
  zoraHandle: string | null;
}

const CHECK_FAILED: ArtistDmAccess = {
  allowed: false,
  reason: 'check_failed',
  balance: 0,
  usdValue: 0,
  coinAddress: null,
  zoraHandle: null,
};

/** The server holds a holdings check for 15 minutes; the client trusts it for 5. */
const ACCESS_STALE_MS = 5 * 60_000;

export async function checkArtistDmAccess(artistUserId: string): Promise<ArtistDmAccess> {
  const { data, error } = await supabase.functions.invoke('artist-dm-gate', {
    body: { artistUserId },
  });
  const res = data as Partial<ArtistDmAccess> | null;
  if (error || !res || typeof res.allowed !== 'boolean' || !res.reason) return CHECK_FAILED;
  return {
    allowed: res.allowed,
    reason: res.reason,
    balance: Number(res.balance ?? 0),
    usdValue: Number(res.usdValue ?? 0),
    coinAddress: res.coinAddress ?? null,
    zoraHandle: res.zoraHandle ?? null,
  };
}

/** True when a DM RPC refused because the coin is needed. */
export function isCoinRequiredError(message: string | null | undefined): boolean {
  return typeof message === 'string' && message.includes('COIN_REQUIRED');
}

export function artistDmAccessKey(userId: string | undefined, artistUserId: string | null | undefined) {
  return ['artist-dm-access', userId ?? null, artistUserId ?? null] as const;
}

/**
 * The gate for one musician. Not run until asked (enabled defaults to false),
 * because every run is a read from Base.
 */
export function useArtistDmAccess(artistUserId: string | null | undefined, options: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: artistDmAccessKey(user?.id, artistUserId),
    enabled: Boolean(options.enabled && user && artistUserId && user.id !== artistUserId),
    staleTime: ACCESS_STALE_MS,
    retry: false,
    queryFn: () => checkArtistDmAccess(artistUserId as string),
  });
}

/**
 * The gate plus an on-demand check. check() reuses a recent answer; check(true)
 * always asks Base again, which is what "I just bought it" needs.
 */
export function useArtistDmGate(artistUserId: string | null | undefined, options: { autoCheck?: boolean } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useArtistDmAccess(artistUserId, { enabled: options.autoCheck });

  const check = useCallback(
    async (force = false): Promise<ArtistDmAccess> => {
      if (!user || !artistUserId) return CHECK_FAILED;
      try {
        return await queryClient.fetchQuery({
          queryKey: artistDmAccessKey(user.id, artistUserId),
          queryFn: () => checkArtistDmAccess(artistUserId),
          staleTime: force ? 0 : ACCESS_STALE_MS,
          retry: false,
        });
      } catch {
        return CHECK_FAILED;
      }
    },
    [user, artistUserId, queryClient],
  );

  return { access: query.data, isChecking: query.isFetching, check };
}
