import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let isActive = true;

    const fetchCount = async () => {
      try {
        const liveUsersCountRes = await (supabase as any)
          .from('room_live_users')
          .select('user_id')
          .eq('room_id', roomId);

        if (!isActive) return;
        if (!liveUsersCountRes?.error && Array.isArray(liveUsersCountRes?.data)) {
          const uniqueUsers = new Set(
            (liveUsersCountRes.data as Array<{ user_id?: string | null }>)
              .map((row) => (typeof row?.user_id === 'string' ? row.user_id : ''))
              .filter((value) => value.length > 0)
          );
          const liveUsersCount = uniqueUsers.size;
          setCount(isListening ? Math.max(1, liveUsersCount) : liveUsersCount);
          return;
        }

        const { data, error } = await (supabase as any)
          .from('room_live_counts')
          .select('*')
          .eq('room_id', roomId)
          .maybeSingle();

        if (!isActive) return;
        if (!error) {
          const nextCount = resolveLiveCount((data ?? null) as RoomLiveCountRow | null);
          setCount(isListening ? Math.max(1, nextCount) : nextCount);
          return;
        }

        const fallback = await (supabase as any)
          .from('room_profiles')
          .select('user_id', { count: 'exact', head: true })
          .eq('room_id', roomId)
          .eq('is_active', true);

        if (!isActive) return;
        if (!fallback?.error) {
          const fallbackCount = Math.max(0, Number(fallback?.count ?? 0));
          setCount(isListening ? Math.max(1, fallbackCount) : fallbackCount);
          return;
        }

        const liveUsersFallback = await (supabase as any)
          .from('room_live_users')
          .select('user_id', { count: 'exact', head: true })
          .eq('room_id', roomId);

        if (!isActive) return;
        if (!liveUsersFallback?.error) {
          const liveUsersCount = Math.max(0, Number(liveUsersFallback?.count ?? 0));
          setCount(isListening ? Math.max(1, liveUsersCount) : liveUsersCount);
          return;
        }

        setCount(isListening ? 1 : 0);
      } catch {
        if (!isActive) return;
        setCount(isListening ? 1 : 0);
      }
    };

    const channel = supabase
      .channel(`room-live-counts:${roomId}`)
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

    const interval = window.setInterval(() => {
      void fetchCount();
    }, 5000);

    void fetchCount();

    return () => {
      isActive = false;
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [isListening, roomId]);

  return count;
}
