import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type PresenceMeta = { in_room?: boolean };
const PRESENCE_KEY_PREFIX = 'songchainn:room_presence_key:v1:';

let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let sharedUserId: string | null = null;
let sharedPresenceKey: string | null = null;
let sharedCount = 0;
let sharedRefs = 0;
const sharedListeners = new Set<(count: number) => void>();

function makePresenceKey() {
  const maybeCrypto = globalThis.crypto as Crypto | undefined;
  if (maybeCrypto && 'randomUUID' in maybeCrypto && typeof maybeCrypto.randomUUID === 'function') {
    return maybeCrypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getOrCreatePresenceKey(userId: string) {
  try {
    const storageKey = `${PRESENCE_KEY_PREFIX}${userId}`;
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const created = makePresenceKey();
    localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return makePresenceKey();
  }
}

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
  const presenceKey = getOrCreatePresenceKey(userId);
  if (sharedChannel && sharedUserId === userId && sharedPresenceKey === presenceKey) return sharedChannel;

  if (sharedChannel) {
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
  }

  sharedUserId = userId;
  sharedPresenceKey = presenceKey;

  const channel = supabase.channel('room-presence', {
    config: {
      presence: { key: presenceKey },
    },
  });
  sharedChannel = channel;

  const sync = () => emitSharedCount(computeInRoomCount(channel));

  channel.on('presence', { event: 'sync' }, sync);
  channel.on('presence', { event: 'join' }, sync);
  channel.on('presence', { event: 'leave' }, sync);

  await new Promise<void>(resolve => {
    channel.subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
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
  sharedPresenceKey = null;
  sharedCount = 0;
}

export function useRoomOnlineCount(userId: string | null | undefined, inRoom: boolean | null | undefined) {
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

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const channel = await ensureSharedChannel(userId);
      try {
        await channel.track({ in_room: Boolean(inRoom) });
      } catch {
        void 0;
      }
    })();
  }, [userId, inRoom]);

  return count;
}
