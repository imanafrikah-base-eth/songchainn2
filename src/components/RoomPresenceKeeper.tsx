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

  useEffect(() => {
    if (!user || !isRoomMode) return;

    let heartbeat: number | null = null;
    let token: string | null = null;
    const { supabaseUrl, supabaseAnonKey } = getEnv();

    const rpc = (fn: 'join_room' | 'heartbeat_room' | 'leave_room') =>
      (supabase as any).rpc(fn, { _room_id: ROOM_ID });

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
      if (e.persisted) void rpc('join_room');
    };

    void rpc('join_room');
    // Every 20 seconds, inside the 60 second window the live views allow.
    heartbeat = window.setInterval(() => {
      void rpc('heartbeat_room');
    }, 20000);
    window.addEventListener('pagehide', leaveOnUnload);
    window.addEventListener('pageshow', rejoinFromCache);

    return () => {
      if (heartbeat) window.clearInterval(heartbeat);
      window.removeEventListener('pagehide', leaveOnUnload);
      window.removeEventListener('pageshow', rejoinFromCache);
      authSub.subscription.unsubscribe();
      // The number on this screen follows the moment the leave lands.
      void rpc('leave_room').then(() => refreshRoomOnlineCount(ROOM_ID));
    };
  }, [user, isRoomMode]);

  return null;
}
