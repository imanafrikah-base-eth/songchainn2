import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ROOM_TIMELINE_KEY } from '@/hooks/useRoomTimeline';

/** Song requests open at this many SONGCHAINN points (founder, 15 Sep 2026). The server enforces it. */
export const ROOM_REQUEST_MIN_POINTS = 100;

/**
 * Asking the Room for a song, and taking a request back. The line itself
 * comes with the Room's schedule (useRoomTimeline), because a request is a
 * place on that schedule: it plays next for the whole room.
 */
export function useRoomRequests() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const request = useCallback(
    async (songId: string, name?: string | null): Promise<{ ok: true; ahead: number; pointsLeft: number | null } | { ok: false; error: string }> => {
      setPending(true);
      try {
        const { data, error } = await supabase.rpc('request_room_song' as never, { p_song_id: songId, p_name: name ?? null } as never);
        if (error) return { ok: false, error: error.message || 'That request did not go through.' };
        await queryClient.invalidateQueries({ queryKey: ROOM_TIMELINE_KEY });
        const rows = data as unknown;
        const row = (Array.isArray(rows) ? rows[0] : rows) as { ahead?: number; points_left?: number } | null;
        return { ok: true, ahead: Number(row?.ahead ?? 0), pointsLeft: row?.points_left == null ? null : Number(row.points_left) };
      } finally {
        setPending(false);
      }
    },
    [queryClient],
  );

  const cancel = useCallback(
    async (requestId: string): Promise<string | null> => {
      const { error } = await supabase.rpc('cancel_room_request' as never, { p_request_id: requestId } as never);
      await queryClient.invalidateQueries({ queryKey: ROOM_TIMELINE_KEY });
      return error ? error.message || 'Could not take that request back.' : null;
    },
    [queryClient],
  );

  return { request, cancel, pending };
}
