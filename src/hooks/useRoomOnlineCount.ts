import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type RoomLiveCountRow = {
  room_id?: string;
  listener_count?: number | null;
  online_count?: number | null;
  count?: number | null;
  live_count?: number | null;
  listeners?: number | null;
  total?: number | null;
};

function resolveLiveCount(row: RoomLiveCountRow | null | undefined) {
  const listenerCount = Number(row?.listener_count ?? 0);
  if (Number.isFinite(listenerCount) && listenerCount >= 0) return listenerCount;
  const onlineCount = Number(row?.online_count ?? 0);
  if (Number.isFinite(onlineCount) && onlineCount >= 0) return onlineCount;
  const liveCount = Number(row?.live_count ?? 0);
  if (Number.isFinite(liveCount) && liveCount >= 0) return liveCount;
  const listeners = Number(row?.listeners ?? 0);
  if (Number.isFinite(listeners) && listeners >= 0) return listeners;
  const total = Number(row?.total ?? 0);
  if (Number.isFinite(total) && total >= 0) return total;
  const genericCount = Number(row?.count ?? 0);
  if (Number.isFinite(genericCount) && genericCount >= 0) return genericCount;
  return 0;
}

export function useRoomOnlineCount(params?: { roomId?: string; viewerUserId?: string | null; isListening?: boolean; username?: string | null }) {
  const roomId = params?.roomId || 'global';
  const isListening = Boolean(params?.isListening);
  const [count, setCount] = useState(0);
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let isActive = true;

    const fetchCount = async () => {
      try {
        // Prefer room_live_users (a view over room_profiles filtered to users
        // seen in the last 90s). An empty result IS the answer — zero people
        // live — so never fall through to stale sources on success.
        const liveUsersRes = await (supabase as any)
          .from('room_live_users')
          .select('user_id')
          .eq('room_id', roomId);

        if (!isActive) return;
        if (!liveUsersRes?.error && Array.isArray(liveUsersRes?.data)) {
          const uniqueUsers = new Set(
            (liveUsersRes.data as Array<{ user_id?: string | null }>)
              .map((row) => (typeof row?.user_id === 'string' ? row.user_id : ''))
              .filter((v) => v.length > 0)
          );
          setCount(uniqueUsers.size);
          return;
        }

        // Fallback (view query errored): room_live_counts aggregate row
        const { data: countData, error: countError } = await (supabase as any)
          .from('room_live_counts')
          .select('*')
          .eq('room_id', roomId)
          .maybeSingle();

        if (!isActive) return;
        if (!countError) {
          setCount(countData ? resolveLiveCount(countData as RoomLiveCountRow) : 0);
          return;
        }

        // Last resort: count room_profiles rows, but only ones with a fresh
        // heartbeat — is_active alone lingers forever when a user closes the
        // app without a clean leave_room.
        const freshCutoff = new Date(Date.now() - 90 * 1000).toISOString();
        const profilesRes = await (supabase as any)
          .from('room_profiles')
          .select('user_id', { count: 'exact', head: true })
          .eq('room_id', roomId)
          .eq('is_active', true)
          .gte('last_seen_at', freshCutoff);

        if (!isActive) return;
        if (!profilesRes?.error) {
          setCount(Math.max(0, Number(profilesRes?.count ?? 0)));
          return;
        }

        setCount(0);
      } catch {
        if (!isActive) return;
        setCount(0);
      }
    };

    const channel = supabase
      .channel(`room-live-counts:${roomId}:${instanceId.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_live_users', filter: `room_id=eq.${roomId}` },
        () => {
          void fetchCount();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_profiles', filter: `room_id=eq.${roomId}` },
        () => {
          void fetchCount();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_live_counts', filter: `room_id=eq.${roomId}` },
        () => {
          void fetchCount();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void fetchCount();
        }
      });

    void fetchCount();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [isListening, roomId]);

  return count;
}
