import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getEnv } from '@/lib/env';
import type { WorldTrack } from '@/hooks/useWorldTracks';

/**
 * Asking to play a song that lives in a world.
 *
 * The browser never decides this. It asks world-track-url, which reads the
 * caller's own verified wallet, prices what they hold at that moment, and
 * either hands back a link that lasts two minutes or says plainly what it
 * would take. Everything the answer says is what the lock screen shows, so a
 * person is never told a number we did not actually read.
 */

export type WorldTrackReason =
  | 'holds'
  | 'owner'
  | 'signed_out'
  | 'no_wallet'
  | 'no_coin'
  | 'not_enough'
  | 'not_ready'
  | 'no_track'
  | 'check_failed';

export interface WorldTrackAnswer {
  allowed: boolean;
  reason: WorldTrackReason;
  url?: string;
  balance: number;
  usdValue: number;
  needUsd: number;
  coinAddress: string | null;
  zoraHandle: string | null;
  worldSlug: string;
  streetSlug: string | null;
  title: string;
  partLabel: string | null;
}

export function useWorldTrackPlay() {
  const [asking, setAsking] = useState<string | null>(null);

  const ask = useCallback(async (track: WorldTrack): Promise<WorldTrackAnswer | null> => {
    setAsking(track.id);
    try {
      const { supabaseUrl, supabaseAnonKey } = getEnv();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? supabaseAnonKey;
      const res = await fetch(`${supabaseUrl}/functions/v1/world-track-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ trackId: track.id }),
      });
      const answer = (await res.json()) as Partial<WorldTrackAnswer>;
      return {
        allowed: Boolean(answer.allowed),
        reason: (answer.reason as WorldTrackReason) ?? 'check_failed',
        url: typeof answer.url === 'string' ? answer.url : undefined,
        balance: Number(answer.balance ?? 0),
        usdValue: Number(answer.usdValue ?? 0),
        needUsd: Number(answer.needUsd ?? track.unlockUsd),
        coinAddress: (answer.coinAddress as string | null) ?? null,
        zoraHandle: (answer.zoraHandle as string | null) ?? null,
        worldSlug: (answer.worldSlug as string) ?? track.worldSlug,
        streetSlug: (answer.streetSlug as string | null) ?? track.streetSlug,
        title: (answer.title as string) ?? track.title,
        partLabel: (answer.partLabel as string | null) ?? track.partLabel,
      };
    } catch {
      // The network, not the wallet. Say so rather than accusing anybody of
      // holding nothing.
      return {
        allowed: false,
        reason: 'check_failed',
        balance: 0,
        usdValue: 0,
        needUsd: track.unlockUsd,
        coinAddress: null,
        zoraHandle: null,
        worldSlug: track.worldSlug,
        streetSlug: track.streetSlug,
        title: track.title,
        partLabel: track.partLabel,
      };
    } finally {
      setAsking(null);
    }
  }, []);

  return { ask, asking };
}
