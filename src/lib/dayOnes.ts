import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Day Ones: the numbered receipt of when a fan found a song and its artist.
 *
 * Earned in the app with a real listen and a like (migration
 * 20260914001300_day_ones), numbered in the order fans got there, and
 * optionally recorded on Base as an EAS attestation from SONGCHAINN to the
 * fan's wallet (edge function day-one-attest). Recognition and access, never
 * a stake or a promise of money.
 */

export interface DayOne {
  id: string;
  kind: 'song' | 'artist';
  target_id: string;
  artist_id: string | null;
  fan_number: number;
  earned_at: string;
  total_fans: number;
  song_title: string | null;
  artist_name: string | null;
  cover_url: string | null;
  attestation_uid: string | null;
  attested_to: string | null;
  attest_tx: string | null;
  attested_at: string | null;
}

export interface FirstFan {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  fan_number: number;
  earned_at: string;
  on_chain: boolean;
}

export const easscanUrl = (uid: string) => `https://base.easscan.org/attestation/view/${uid}`;

/** "#7 of 212", or "#7" while the count is tiny. */
export function numberLine(d: Pick<DayOne, 'fan_number' | 'total_fans'>): string {
  return d.total_fans > d.fan_number ? `#${d.fan_number} of ${d.total_fans}` : `#${d.fan_number}`;
}

export function useMyDayOnes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['day-ones', 'mine', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<DayOne[]> => {
      const { data, error } = await supabase.rpc('my_day_ones' as never);
      if (error) throw error;
      return (data ?? []) as unknown as DayOne[];
    },
  });
}

export function useArtistDayOnes(artistId: string | null | undefined, limit = 100) {
  return useQuery({
    queryKey: ['day-ones', 'artist', artistId, limit],
    enabled: !!artistId,
    staleTime: 30_000,
    queryFn: async (): Promise<FirstFan[]> => {
      const { data, error } = await supabase.rpc('artist_day_ones' as never, { _artist_id: artistId, _limit: limit } as never);
      if (error) throw error;
      return (data ?? []) as unknown as FirstFan[];
    },
  });
}

export interface AttesterStatus {
  attester: string;
  balanceEth: string;
  funded: boolean;
  schemaUid: string;
  registered: boolean;
}

export function useDayOneChainStatus() {
  return useQuery({
    queryKey: ['day-ones', 'chain-status'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AttesterStatus | null> => {
      const { data, error } = await supabase.functions.invoke('day-one-attest', { body: { action: 'status' } });
      if (error) return null;
      return data as AttesterStatus;
    },
  });
}

export type RecordResult =
  | { ok: true; uid: string; url: string }
  | { ok: false; error: string; needsWallet?: boolean };

/** Record one receipt on Base. SONGCHAINN pays the fee; the fan signs nothing. */
export async function recordDayOneOnBase(receiptId: string): Promise<RecordResult> {
  const { data, error } = await supabase.functions.invoke('day-one-attest', { body: { action: 'attest', receiptId } });
  if (error) {
    let message = 'Base did not take it just now. Try again in a minute.';
    let needsWallet = false;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
      needsWallet = Boolean(body?.needsWallet);
    } catch {
      /* keep the plain message */
    }
    return { ok: false, error: message, needsWallet };
  }
  const d = data as { uid?: string; url?: string; error?: string };
  if (!d?.uid) return { ok: false, error: d?.error ?? 'Base did not take it just now.' };
  return { ok: true, uid: d.uid, url: d.url ?? easscanUrl(d.uid) };
}

/**
 * Hears a receipt the moment it is earned and hands it to `onEarned`, so the
 * app can say "You are Day One #7" while the song is still playing.
 */
export function useDayOneEarned(onEarned: (receipt: { id: string; kind: string; target_id: string; fan_number: number }) => void) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const handler = useRef(onEarned);
  handler.current = onEarned;
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`day-ones-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'day_one_receipts', filter: `user_id=eq.${user.id}` },
        (payload) => {
          void queryClient.invalidateQueries({ queryKey: ['day-ones'] });
          const row = payload.new as { id: string; kind: string; target_id: string; fan_number: number };
          if (row?.id) handler.current(row);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
}
