import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSafePlayerState } from '@/context/PlayerContext';
import { supabase } from '@/integrations/supabase/client';
import { getEnv } from '@/lib/env';
import { refreshRoomOnlineCount } from '@/hooks/useRoomOnlineCount';

const ROOM_ID = 'global';

/**
 * Keeps the user's Room presence alive for as long as they are in room
 * mode, no matter which page they are on. Before this, presence lived in
 * Room.tsx and died on unmount, so hiding the room made the live count
 * drop to 0 even though the user was still listening. Leaving room mode
 * (or signing out) leaves the room.
 *
 * So does closing the tab, reloading or navigating away from the app. That
 * used to send nothing at all, so the person kept counting as live for up to
 * 90 seconds after they had gone (the live views wait that long for a
 * heartbeat). An ordinary request is cancelled as the page unloads, so the
 * leave goes out as a keepalive fetch, which the browser finishes on its own.
 * A page restored from the back-forward cache joins again.
 */
export function RoomPresenceKeeper() {
  const { user } = useAuth();
  const playerState = useSafePlayerState();
  const isRoomMode = Boolean(playerState?.isRoomMode);

  const userId = user?.id;

  useEffect(() => {
    if (!userId || !isRoomMode) return;

    let heartbeat: number | null = null;
    let token: string | null = null;
    /* Set the moment this person leaves, so a beat or a rejoin still in flight
       can never put them back in the Room after they have gone. */
    let stopped = false;
    const { supabaseUrl, supabaseAnonKey } = getEnv();

    /* Awaited, always. A Supabase query builder is lazy: "void supabase.rpc()"
       builds the request and never sends it. That is how the join and every
       heartbeat went missing and the Room read 0 live with people in it. */
    const rpc = async (fn: 'join_room' | 'heartbeat_room' | 'leave_room') => {
      const { data, error } = await (supabase as any).rpc(fn, { _room_id: ROOM_ID });
      if (error) console.warn(`[room] ${fn} failed`, error.message);
      return { data, error };
    };

    const join = async () => {
      if (stopped) return;
      await rpc('join_room');
      if (!stopped) refreshRoomOnlineCount(ROOM_ID);
    };

    /* heartbeat_room says false when this person's row is no longer in (a leave
       from another tab, or the row was switched off). Still in the Room here,
       so join again. */
    const beat = async () => {
      if (stopped) return;
      const { data, error } = await rpc('heartbeat_room');
      if (!stopped && !error && data === false) await join();
    };

    /* A phone wakes a hidden page's timers about once a minute; coming back to
       the screen beats straight away rather than waiting for the next one. */
    const onVisible = () => {
      if (document.visibilityState === 'visible') void beat();
    };

    void supabase.auth.getSession().then(({ data }) => {
      token = data.session?.access_token ?? null;
    });
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      token = session?.access_token ?? null;
    });

    const leaveOnUnload = () => {
      if (!token || !supabaseUrl || !supabaseAnonKey) return;
      try {
        void fetch(`${supabaseUrl}/rest/v1/rpc/leave_room`, {
          method: 'POST',
          keepalive: true,
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ _room_id: ROOM_ID }),
        }).catch(() => undefined);
      } catch {
        void 0;
      }
    };
    const rejoinFromCache = (e: PageTransitionEvent) => {
      if (e.persisted) void join();
    };

    void join();
    // Every 20 seconds, well inside the 90 second window the live views allow.
    heartbeat = window.setInterval(() => {
      void beat();
    }, 20000);
    window.addEventListener('pagehide', leaveOnUnload);
    window.addEventListener('pageshow', rejoinFromCache);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      if (heartbeat) window.clearInterval(heartbeat);
      window.removeEventListener('pagehide', leaveOnUnload);
      window.removeEventListener('pageshow', rejoinFromCache);
      document.removeEventListener('visibilitychange', onVisible);
      authSub.subscription.unsubscribe();
      // The number on this screen follows the moment the leave lands.
      void rpc('leave_room').then(() => refreshRoomOnlineCount(ROOM_ID));
    };
    // The user id, not the user object: a new object for the same person used
    // to leave the Room and join it again, and the two could land out of order.
  }, [userId, isRoomMode]);

  return null;
}
