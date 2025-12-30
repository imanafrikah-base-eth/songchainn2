import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type PresenceMeta = { in_room?: boolean };

let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let sharedUserId: string | null = null;
let sharedCount = 0;
let sharedRefs = 0;
const sharedListeners = new Set<(count: number) => void>();

function computeInRoomCount(channel: ReturnType<typeof supabase.channel>) {
  const state = channel.presenceState() as Record<string, PresenceMeta[]>;
  let count = 0;
  for (const metas of Object.values(state)) {
    if (Array.isArray(metas) && metas.some(m => Boolean(m?.in_room))) count += 1;
  }
  return count;
}

function emitSharedCount(next: number) {
  sharedCount = next;
  for (const listener of sharedListeners) listener(next);
}

async function ensureSharedChannel(userId: string) {
  if (sharedChannel && sharedUserId === userId) return sharedChannel;

  if (sharedChannel) {
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
  }

  sharedUserId = userId;

  const channel = supabase.channel('room-presence', {
    config: {
      presence: { key: userId },
    },
  });
  sharedChannel = channel;

  const sync = () => emitSharedCount(computeInRoomCount(channel));

  channel.on('presence', { event: 'sync' }, sync);
  channel.on('presence', { event: 'join' }, sync);
  channel.on('presence', { event: 'leave' }, sync);

  await new Promise<void>(resolve => {
    channel.subscribe(async status => {
      if (status !== 'SUBSCRIBED') return;
      try {
        await channel.track({ in_room: false });
      } catch {
        void 0;
      }
      sync();
      resolve();
    });
  });

  return channel;
}

function releaseSharedChannel() {
  if (sharedRefs > 0) return;
  if (!sharedChannel) return;
  supabase.removeChannel(sharedChannel);
  sharedChannel = null;
  sharedUserId = null;
  sharedCount = 0;
}

export function useRoomOnlineCount(userId: string | null | undefined) {
  const [count, setCount] = useState(sharedCount);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }

    sharedRefs += 1;
    const listener = (next: number) => setCount(next);
    sharedListeners.add(listener);
    setCount(sharedCount);

    void ensureSharedChannel(userId);

    return () => {
      sharedListeners.delete(listener);
      sharedRefs = Math.max(0, sharedRefs - 1);
      if (sharedRefs === 0) releaseSharedChannel();
    };
  }, [userId]);

  return count;
}

