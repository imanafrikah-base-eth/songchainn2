import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { usePlayerActions, useSafePlayerState } from '@/context/PlayerContext';
import { supabase } from '@/integrations/supabase/client';
import { ROOM_TIMELINE_KEY, roomClock, roomEntriesAt, useRoomTimeline, type RoomEntry } from '@/hooks/useRoomTimeline';
import { useRoomSongs } from '@/hooks/useRoomSongs';
import { roomListenGroup, setListenGroupResolver } from '@/lib/listenGroup';
import type { Song } from '@/data/musicData';

/**
 * Holds the player to the Room's schedule for as long as the person is in the
 * Room, on any page. It lives here and not in Room.tsx for the same reason
 * RoomPresenceKeeper does: hiding the Room unmounts the page, and a hidden
 * listener must keep hearing what everybody else hears, requests included.
 */
export function RoomTimelineSync() {
  const { user } = useAuth();
  const playerState = useSafePlayerState();
  if (!user || !playerState?.isRoomMode) return null;
  return <RoomTimelineDriver currentSongId={playerState.currentSong?.id ?? null} />;
}

function RoomTimelineDriver({ currentSongId }: { currentSongId: string | null }) {
  const queryClient = useQueryClient();
  const { data: timeline } = useRoomTimeline(true);
  const { byId, isLoading: isCatalogLoading } = useRoomSongs();
  const { syncRoom } = usePlayerActions();

  const currentSongIdRef = useRef(currentSongId);
  currentSongIdRef.current = currentSongId;

  // Any change to the schedule or the request line reaches every listener.
  useEffect(() => {
    let timer: number | null = null;
    const refresh = () => {
      if (timer) window.clearTimeout(timer);
      // A little spread, so a room full of listeners does not ask in the same millisecond.
      timer = window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ROOM_TIMELINE_KEY });
      }, 200 + Math.random() * 600);
    };
    const channel = supabase
      .channel('room-timeline')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_timeline' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_song_requests' }, refresh)
      .subscribe();
    return () => {
      if (timer) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Ask again as the song on now ends, so the song after the next is lined up
  // long before it is needed.
  useEffect(() => {
    if (!timeline) return;
    const now = roomClock(timeline);
    const { current } = roomEntriesAt(timeline, now);
    const wait = current ? current.endsAt - now + 400 + Math.random() * 1200 : 3000;
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ROOM_TIMELINE_KEY });
    }, Math.max(1000, wait));
    return () => window.clearTimeout(timer);
  }, [queryClient, timeline]);

  // Hold the player to the schedule, once a second.
  const lastCatalogRefreshRef = useRef(0);
  useEffect(() => {
    if (!timeline || isCatalogLoading) return;
    const run = () => {
      const now = roomClock(timeline);
      const { current, next } = roomEntriesAt(timeline, now);
      if (!current) return;
      const song = byId.get(current.songId);
      if (!song) {
        // Published after this device loaded the catalogue.
        if (Date.now() - lastCatalogRefreshRef.current > 30_000) {
          lastCatalogRefreshRef.current = Date.now();
          void queryClient.invalidateQueries({ queryKey: ['published-catalog'] });
        }
        return;
      }
      const nextSong = next ? byId.get(next.songId) ?? null : null;
      // A crossfade into the next song begins a few seconds before it is due.
      // That listener is on time, not drifting.
      if (next && nextSong && currentSongIdRef.current === nextSong.id && next.startsAt - now < 4000) {
        syncRoom({ song: nextSong, position: Math.max(0, (now - next.startsAt) / 1000), next: null, nextStartsAtMs: null });
        return;
      }
      syncRoom({
        song,
        position: Math.max(0, (now - current.startsAt) / 1000),
        next: nextSong,
        nextStartsAtMs: next ? next.startsAt - timeline.offsetMs : null,
      });
    };
    run();
    const id = window.setInterval(run, 1000);
    return () => window.clearInterval(id);
  }, [byId, isCatalogLoading, queryClient, syncRoom, timeline]);

  // The whole Room hears one play of one song, so all of those listens count
  // as a single stream. A listen reaches its half minute after the play began,
  // and by then the Room may already be lining up what comes next, so the song
  // is looked up in the schedule rather than assumed to be the one on now.
  useEffect(() => {
    if (!timeline) return;
    setListenGroupResolver((songId) => {
      if (!songId) return null;
      const now = roomClock(timeline);
      const { current } = roomEntriesAt(timeline, now);
      if (current?.songId === songId) return roomListenGroup(current.id);
      // The play that has just finished, or the one about to start: within a
      // couple of minutes either way, this is still that play.
      const near = timeline.entries
        .filter((e) => e.songId === songId && e.startsAt < now + 10_000 && e.endsAt > now - 120_000)
        .sort((a, b) => b.startsAt - a.startsAt)[0];
      return near ? roomListenGroup(near.id) : null;
    });
    // Out of the Room: a listen after this is this listener's own again.
    return () => setListenGroupResolver(null);
  }, [timeline]);

  // A record the server has no length for gets measured here, once, and the
  // schedule is corrected for everybody.
  const measuredRef = useRef(new Set<number>());
  const probesRef = useRef<HTMLAudioElement[]>([]);
  useEffect(() => {
    if (!timeline || isCatalogLoading) return;
    for (const entry of timeline.entries) {
      if (entry.lengthKnown || measuredRef.current.has(entry.id)) continue;
      const song = byId.get(entry.songId);
      if (!song) continue;
      measuredRef.current.add(entry.id);
      probesRef.current.push(measureLength(entry, song));
    }
  }, [byId, isCatalogLoading, timeline]);
  useEffect(() => () => {
    for (const probe of probesRef.current) probe.src = '';
  }, []);

  return null;
}

function measureLength(entry: RoomEntry, song: Song): HTMLAudioElement {
  const probe = new Audio();
  probe.preload = 'metadata';
  probe.muted = true;
  probe.addEventListener(
    'loadedmetadata',
    () => {
      const seconds = probe.duration;
      probe.src = '';
      if (!Number.isFinite(seconds) || seconds < 20) return;
      // Awaited through .then: a Supabase builder that is never awaited never sends.
      void supabase
        .rpc('room_report_length' as never, { p_entry_id: entry.id, p_seconds: Math.round(seconds * 100) / 100 } as never)
        .then(({ error }) => {
          if (error) console.warn('[room] length report failed', error.message);
        });
    },
    { once: true },
  );
  probe.src = song.audioUrl;
  return probe;
}
