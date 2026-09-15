import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** The Room's three minute segment, the same clock the Room plays on. */
export const ROOM_SEGMENT_SECONDS = 180;
export const roomSlotAt = (ms: number) => Math.floor(ms / 1000 / ROOM_SEGMENT_SECONDS);

export interface RoomRequest {
  id: string;
  song_id: string;
  slot: number;
  requested_by: string;
  requester_name: string | null;
  created_at: string;
}

const KEY = ['room-song-requests'] as const;

/**
 * The Room's request line: every song somebody asked for that the room has not
 * moved past yet, in the order it was asked for. Everyone reads the same line
 * and it updates live, so a request shows up for the whole room the moment it
 * is made.
 */
export function useRoomRequests(enabled: boolean) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const query = useQuery({
    queryKey: KEY,
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<RoomRequest[]> => {
      const since = roomSlotAt(Date.now()) - 40;
      const { data, error } = await supabase
        .from('room_song_requests' as never)
        .select('id, song_id, slot, requested_by, requester_name, created_at')
        .eq('room_id', 'global')
        .eq('status', 'queued')
        .gte('slot', since)
        .order('slot', { ascending: true })
        .limit(60);
      if (error) throw error;
      return ((data ?? []) as unknown as RoomRequest[]).map((r) => ({ ...r, slot: Number(r.slot) }));
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel('room-song-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_song_requests' }, () => {
        void queryClient.invalidateQueries({ queryKey: KEY });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);

  const request = useCallback(
    async (songId: string, name?: string | null): Promise<{ ok: true; ahead: number } | { ok: false; error: string }> => {
      setPending(true);
      try {
        const { data, error } = await supabase.rpc('request_room_song' as never, { p_song_id: songId, p_name: name ?? null } as never);
        if (error) return { ok: false, error: error.message || 'That request did not go through.' };
        void queryClient.invalidateQueries({ queryKey: KEY });
        const rows = data as unknown;
        const row = (Array.isArray(rows) ? rows[0] : rows) as { ahead?: number } | null;
        return { ok: true, ahead: Number(row?.ahead ?? 0) };
      } finally {
        setPending(false);
      }
    },
    [queryClient],
  );

  const cancel = useCallback(
    async (requestId: string): Promise<string | null> => {
      const { error } = await supabase.rpc('cancel_room_request' as never, { p_request_id: requestId } as never);
      void queryClient.invalidateQueries({ queryKey: KEY });
      return error ? error.message || 'Could not take that request back.' : null;
    },
    [queryClient],
  );

  return { requests: query.data ?? [], isLoading: query.isLoading, request, cancel, pending };
}
