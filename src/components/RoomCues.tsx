import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { usePlayerActions, useSafePlayerState } from '@/context/PlayerContext';
import { supabase } from '@/integrations/supabase/client';
import {
  onRoomNameAnnounced,
  playRoomCue,
  primeRoomCues,
  roomSoundsOn,
  setRoomCueSender,
  type RoomCueEvent,
} from '@/lib/roomCues';

const ROOM_ID = 'global';
/** Someone whose connection drops and comes back is not a new arrival. */
const REARRIVAL_QUIET_MS = 2 * 60 * 1000;
/** Arrivals this close together are one announcement. */
const ARRIVAL_GATHER_MS = 1200;

/**
 * The Room's sounds, for everyone in the Room and nobody else. It lives in
 * AppShell next to RoomPresenceKeeper, not in Room.tsx, because the person the
 * sounds matter to most has hidden the Room and is listening on another page.
 *
 * Arrivals come from Realtime presence on a channel of its own, which every
 * device in room mode joins. Presence says who is here without trusting a
 * broadcast to arrive, and one person on two tabs is still one arrival.
 * Messages and reactions are broadcasts on the same channel, sent by Room.tsx.
 */
export function RoomCues() {
  const { user } = useAuth();
  const playerState = useSafePlayerState();

  useEffect(() => primeRoomCues(), []);

  if (!user || !playerState?.isRoomMode) return null;
  return <RoomCueChannel userId={user.id} />;
}

function cleanName(raw: unknown) {
  if (typeof raw !== 'string') return '';
  const printable = [...raw].filter((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code >= 32 && code !== 127;
  }).join('');
  return printable.replace(/https?:\/\/\S+/gi, '').trim().slice(0, 24);
}

function arrivalLine(names: string[]) {
  if (names.length === 1) return `${names[0]} joined the Room`;
  if (names.length === 2) return `${names[0]} and ${names[1]} joined the Room`;
  return `${names[0]} and ${names.length - 1} others joined the Room`;
}

function RoomCueChannel({ userId }: { userId: string }) {
  const { duckFor } = usePlayerActions();
  const duckRef = useRef(duckFor);
  duckRef.current = duckFor;

  useEffect(() => {
    let active = true;
    let ready = false;
    let greeted = false;
    let name = '';
    const lastArrivalAt = new Map<string, number>();
    let gathered: string[] = [];
    let gatherTimer: number | null = null;

    const cue = (kind: Parameters<typeof playRoomCue>[0], seed?: string) => {
      if (!playRoomCue(kind, seed)) return;
      if (kind === 'join') duckRef.current(0.35, 650);
      else if (kind === 'self-join') duckRef.current(0.5, 500);
      else if (kind === 'message') duckRef.current(0.65, 120);
    };

    const announceArrivals = () => {
      gatherTimer = null;
      const names = gathered;
      gathered = [];
      if (!active || names.length === 0) return;
      cue('join');
      if (roomSoundsOn()) {
        try {
          navigator.vibrate?.(30);
        } catch {
          void 0;
        }
      }
      toast(arrivalLine(names), { icon: '🎧', duration: 3500 });
    };

    const channel = supabase.channel(`room-cues:${ROOM_ID}`, {
      config: { presence: { key: userId }, broadcast: { self: false } },
    });

    const track = () => {
      if (!active) return;
      void channel.track({ name: name || 'A listener' }).catch(() => undefined);
    };

    channel.on('presence', { event: 'join' }, ({ key, currentPresences, newPresences }) => {
      // The first read after subscribing is everyone already here, not arrivals.
      if (!ready || key === userId) return;
      // Already here on another tab, or a name change re-tracked.
      if (currentPresences.length > 0) return;
      const now = Date.now();
      const last = lastArrivalAt.get(key) ?? 0;
      lastArrivalAt.set(key, now);
      if (now - last < REARRIVAL_QUIET_MS) return;
      const arrived = cleanName((newPresences[0] as { name?: unknown } | undefined)?.name) || 'A listener';
      gathered.push(arrived);
      if (!gatherTimer) gatherTimer = window.setTimeout(announceArrivals, ARRIVAL_GATHER_MS);
    });

    channel.on('presence', { event: 'leave' }, ({ key, currentPresences }) => {
      if (currentPresences.length === 0) lastArrivalAt.set(key, Date.now());
    });

    channel.on('presence', { event: 'sync' }, () => {
      if (ready) return;
      ready = true;
      // Everyone already here counts as seen, so a blip in their connection
      // right after you arrive does not announce them.
      const now = Date.now();
      for (const key of Object.keys(channel.presenceState())) lastArrivalAt.set(key, now);
    });

    channel.on('broadcast', { event: 'message' }, () => {
      cue('message');
    });

    channel.on('broadcast', { event: 'reaction' }, ({ payload }) => {
      const emoji = typeof payload?.emoji === 'string' ? payload.emoji.slice(0, 16) : '';
      cue('reaction', emoji);
    });

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED' || !active) return;
      track();
      // Your own way in, once per visit, not on every reconnect.
      if (!greeted) {
        greeted = true;
        cue('self-join');
      }
    });

    setRoomCueSender((next: RoomCueEvent) => {
      const { event, ...payload } = next;
      void channel.send({ type: 'broadcast', event, payload }).catch(() => undefined);
    });

    // The name others see when you walk in. Room.tsx remembers it on this
    // device; the saved one covers a visit that never opened the Room page.
    try {
      name = cleanName(localStorage.getItem(`room_username:${userId}`));
    } catch {
      void 0;
    }
    if (!name) {
      void (supabase as any)
        .from('room_profiles')
        .select('room_name, has_custom_name')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data }: { data: { room_name?: string; has_custom_name?: boolean } | null }) => {
          const saved = data?.has_custom_name ? cleanName(data.room_name) : '';
          if (!active || !saved || name) return;
          name = saved;
          if (ready) track();
        });
    }
    const stopNames = onRoomNameAnnounced((next) => {
      const cleaned = cleanName(next);
      if (!cleaned || cleaned === name) return;
      name = cleaned;
      if (ready) track();
    });

    return () => {
      active = false;
      stopNames();
      setRoomCueSender(null);
      if (gatherTimer) window.clearTimeout(gatherTimer);
      void channel.untrack().catch(() => undefined);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
