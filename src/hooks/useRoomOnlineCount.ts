import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/*
 * How many people are live in a room, shared across everything that asks.
 *
 * Navigation, NavRail, the audio player, the bottom tab bar and Home all ask
 * for the "global" count, and they are all mounted at the same time. The
 * first version of this hook opened a fresh realtime channel and ran the same
 * query from every one of those mounts, so Home alone held five identical
 * WebSocket subscriptions. Now there is one channel and one query per room,
 * kept in module state, and every mount just listens. The channel is torn
 * down a few seconds after the last listener leaves, so a route change that
 * unmounts and remounts the nav does not reconnect.
 *
 * Same shape as useNotifications, which got this right first.
 */

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

async function readLiveCount(roomId: string): Promise<number> {
  try {
    // Prefer room_live_users (a view over room_profiles filtered to users
    // seen in the last 90s). An empty result IS the answer, zero people
    // live, so never fall through to stale sources on success.
    const liveUsersRes = await (supabase as any)
      .from('room_live_users')
      .select('user_id')
      .eq('room_id', roomId);

    if (!liveUsersRes?.error && Array.isArray(liveUsersRes?.data)) {
      const uniqueUsers = new Set(
        (liveUsersRes.data as Array<{ user_id?: string | null }>)
          .map((row) => (typeof row?.user_id === 'string' ? row.user_id : ''))
          .filter((v) => v.length > 0),
      );
      return uniqueUsers.size;
    }

    // Fallback (view query errored): room_live_counts aggregate row
    const { data: countData, error: countError } = await (supabase as any)
      .from('room_live_counts')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle();

    if (!countError) {
      return countData ? resolveLiveCount(countData as RoomLiveCountRow) : 0;
    }

    // Last resort: count room_profiles rows, but only ones with a fresh
    // heartbeat. is_active alone lingers forever when a user closes the app
    // without a clean leave_room.
    const freshCutoff = new Date(Date.now() - 90 * 1000).toISOString();
    const profilesRes = await (supabase as any)
      .from('room_profiles')
      .select('user_id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('is_active', true)
      .gte('last_seen_at', freshCutoff);

    if (!profilesRes?.error) {
      return Math.max(0, Number(profilesRes?.count ?? 0));
    }
    return 0;
  } catch {
    return 0;
  }
}

type Listener = (count: number) => void;

interface RoomEntry {
  count: number;
  listeners: Set<Listener>;
  channel: RealtimeChannel;
  /** Set once the last listener leaves; cancelled if one returns in time. */
  teardown: ReturnType<typeof setTimeout> | null;
  /** One query in flight at a time; a burst of change events coalesces. */
  inFlight: Promise<void> | null;
  /** A change arrived while a query was running, so run once more after it. */
  dirty: boolean;
}

const rooms = new Map<string, RoomEntry>();

/** How long a room's channel stays open with nobody listening. */
const LINGER_MS = 5_000;

function refresh(roomId: string): void {
  const entry = rooms.get(roomId);
  if (!entry) return;
  if (entry.inFlight) {
    entry.dirty = true;
    return;
  }
  entry.inFlight = readLiveCount(roomId).then((count) => {
    const live = rooms.get(roomId);
    if (!live) return;
    live.inFlight = null;
    if (live.count !== count) {
      live.count = count;
      for (const notify of live.listeners) notify(count);
    }
    if (live.dirty) {
      live.dirty = false;
      refresh(roomId);
    }
  });
}

function ensureRoom(roomId: string): RoomEntry {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const onChange = () => refresh(roomId);
  const channel = supabase
    .channel(`room-live-counts:${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_live_users', filter: `room_id=eq.${roomId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_profiles', filter: `room_id=eq.${roomId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_live_counts', filter: `room_id=eq.${roomId}` },
      onChange,
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') refresh(roomId);
    });

  const entry: RoomEntry = {
    count: 0,
    listeners: new Set(),
    channel,
    teardown: null,
    inFlight: null,
    dirty: false,
  };
  rooms.set(roomId, entry);
  refresh(roomId);
  return entry;
}

function release(roomId: string, listener: Listener): void {
  const entry = rooms.get(roomId);
  if (!entry) return;
  entry.listeners.delete(listener);
  if (entry.listeners.size > 0 || entry.teardown) return;
  entry.teardown = setTimeout(() => {
    const live = rooms.get(roomId);
    if (!live || live.listeners.size > 0) return;
    rooms.delete(roomId);
    void supabase.removeChannel(live.channel);
  }, LINGER_MS);
}

export function useRoomOnlineCount(params?: {
  roomId?: string;
  viewerUserId?: string | null;
  isListening?: boolean;
  username?: string | null;
}) {
  const roomId = params?.roomId || 'global';
  const [count, setCount] = useState(() => rooms.get(roomId)?.count ?? 0);

  useEffect(() => {
    const entry = ensureRoom(roomId);
    if (entry.teardown) {
      clearTimeout(entry.teardown);
      entry.teardown = null;
    }
    entry.listeners.add(setCount);
    setCount(entry.count);
    return () => release(roomId, setCount);
  }, [roomId]);

  return count;
}
