import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * The Room's schedule, kept by the server (room_now). Everybody in the Room
 * reads the same one: the song on now, when it started, what comes after it,
 * and the request line. Every player seeks to it, so the whole room hears the
 * same second of the same song.
 */

export interface RoomEntry {
  id: number;
  songId: string;
  /** Server clock, ms. */
  startsAt: number;
  endsAt: number;
  duration: number;
  lengthKnown: boolean;
  requestId: string | null;
  requestedBy: string | null;
  requesterName: string | null;
}

export interface RoomWaitingRequest {
  id: string;
  songId: string;
  requestedBy: string;
  requesterName: string | null;
  createdAt: string;
}

export interface RoomTimeline {
  entries: RoomEntry[];
  waiting: RoomWaitingRequest[];
  /** Server clock minus this device's clock, ms. */
  offsetMs: number;
}

export const ROOM_TIMELINE_KEY = ['room-timeline'] as const;

// Postgres sends microseconds; not every browser parses more than three digits.
const parseTime = (value: unknown) => Date.parse(String(value).replace(/(\.\d{3})\d+/, '$1'));

export async function fetchRoomTimeline(): Promise<RoomTimeline> {
  const sentAt = Date.now();
  const { data, error } = await supabase.rpc('room_now' as never);
  const receivedAt = Date.now();
  if (error) throw error;
  const raw = (data ?? {}) as { now?: string; entries?: Array<Record<string, unknown>>; waiting?: Array<Record<string, unknown>> };
  const serverNow = parseTime(raw.now);
  return {
    offsetMs: Number.isFinite(serverNow) ? serverNow - (sentAt + receivedAt) / 2 : 0,
    entries: (raw.entries ?? []).map((e) => ({
      id: Number(e.id),
      songId: String(e.song_id),
      startsAt: parseTime(e.starts_at),
      endsAt: parseTime(e.ends_at),
      duration: Number(e.duration_seconds),
      lengthKnown: Boolean(e.length_known),
      requestId: e.request_id ? String(e.request_id) : null,
      requestedBy: e.requested_by ? String(e.requested_by) : null,
      requesterName: e.requester_name ? String(e.requester_name) : null,
    })),
    waiting: (raw.waiting ?? []).map((w) => ({
      id: String(w.id),
      songId: String(w.song_id),
      requestedBy: String(w.requested_by),
      requesterName: w.requester_name ? String(w.requester_name) : null,
      createdAt: String(w.created_at),
    })),
  };
}

/** The server's clock, read on this device. */
export const roomClock = (timeline: RoomTimeline) => Date.now() + timeline.offsetMs;

/** The entry playing at `serverNowMs`, and the one after it. */
export function roomEntriesAt(timeline: RoomTimeline, serverNowMs: number) {
  const index = timeline.entries.findIndex((e) => e.startsAt <= serverNowMs && e.endsAt > serverNowMs);
  if (index < 0) return { current: null, next: timeline.entries.find((e) => e.startsAt > serverNowMs) ?? null };
  return { current: timeline.entries[index], next: timeline.entries[index + 1] ?? null };
}

export function useRoomTimeline(enabled: boolean) {
  return useQuery({
    queryKey: ROOM_TIMELINE_KEY,
    queryFn: fetchRoomTimeline,
    enabled,
    staleTime: 5_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
