import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSafePlayerState } from '@/context/PlayerContext';
import { supabase } from '@/integrations/supabase/client';

const ROOM_ID = 'global';

/**
 * Keeps the user's Room presence alive for as long as they are in room
 * mode, no matter which page they are on. Before this, presence lived in
 * Room.tsx and died on unmount, so hiding the room made the live count
 * drop to 0 even though the user was still listening. Leaving room mode
 * (or signing out) is the only thing that actually leaves the room.
 */
export function RoomPresenceKeeper() {
  const { user } = useAuth();
  const playerState = useSafePlayerState();
  const isRoomMode = Boolean(playerState?.isRoomMode);

  useEffect(() => {
    if (!user || !isRoomMode) return;

    let heartbeat: number | null = null;

    const rpc = (fn: 'join_room' | 'heartbeat_room' | 'leave_room') =>
      (supabase as any).rpc(fn, { _room_id: ROOM_ID });

    void rpc('join_room');
    heartbeat = window.setInterval(() => {
      void rpc('heartbeat_room');
    }, 25000);

    return () => {
      if (heartbeat) window.clearInterval(heartbeat);
      void rpc('leave_room');
    };
  }, [user, isRoomMode]);

  return null;
}
