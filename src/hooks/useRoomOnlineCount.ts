import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type PresenceMeta = {
  user_id?: string;
  room_id?: string;
  username?: string;
  online_at?: string;
};

const VIEWER_KEY_STORAGE = 'songchainn:room_presence_viewer_key:v1';

let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let sharedRoomId: string | null = null;
let sharedViewerKey: string | null = null;
let sharedCount = 0;
let sharedRefs = 0;
const sharedListeners = new Set<(count: number) => void>();
let sharedShouldTrack = false;
let sharedTracked = false;
let sharedTrackMeta: PresenceMeta | null = null;

function makeViewerKey() {
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

function getViewerKey(viewerUserId: string | null | undefined) {
  if (viewerUserId) return viewerUserId;
  try {
    const existing = localStorage.getItem(VIEWER_KEY_STORAGE);
    if (existing) return existing;
    const created = makeViewerKey();
    localStorage.setItem(VIEWER_KEY_STORAGE, created);
    return created;
  } catch {
    return makeViewerKey();
  }
}

function computeListenerCount(channel: ReturnType<typeof supabase.channel>) {
  // Count is calculated from presenceState() keys (unique active listeners in this room channel).
  const state = channel.presenceState() as Record<string, PresenceMeta[]>;
  return Object.keys(state).length;
}

function emitSharedCount(next: number) {
  sharedCount = next;
  for (const listener of sharedListeners) listener(next);
}

async function ensureSharedChannel(roomId: string, viewerKey: string) {
  if (sharedChannel && sharedRoomId === roomId && sharedViewerKey === viewerKey) return sharedChannel;

  if (sharedChannel) {
    if (sharedTracked) {
      void sharedChannel.untrack().catch(() => void 0);
    }
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
    sharedTracked = false;
  }

  sharedRoomId = roomId;
  sharedViewerKey = viewerKey;

  const channel = supabase.channel(`room:${roomId}`, {
    config: {
      presence: { key: viewerKey },
    },
  });
  sharedChannel = channel;

  const sync = () => emitSharedCount(computeListenerCount(channel));

  // Remote presence updates are received here (sync/join/leave) and drive the badge count.
  channel.on('presence', { event: 'sync' }, sync);
  channel.on('presence', { event: 'join' }, sync);
  channel.on('presence', { event: 'leave' }, sync);

  await new Promise<void>(resolve => {
    channel.subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      sync();
      if (sharedShouldTrack && sharedTrackMeta) {
        // Presence is tracked here when the current user is an active listener.
        void channel.track(sharedTrackMeta).then(() => {
          sharedTracked = true;
        }).catch(() => void 0);
      }
      resolve();
    });
  });

  return channel;
}

function releaseSharedChannel() {
  if (sharedRefs > 0) return;
  if (!sharedChannel) return;
  // Cleanup happens here when no components are observing (unsubscribe to prevent leaks).
  if (sharedTracked) {
    void sharedChannel.untrack().catch(() => void 0);
    sharedTracked = false;
  }
  supabase.removeChannel(sharedChannel);
  sharedChannel = null;
  sharedRoomId = null;
  sharedViewerKey = null;
  sharedCount = 0;
}

export function useRoomOnlineCount(params?: { roomId?: string; viewerUserId?: string | null; isListening?: boolean; username?: string | null }) {
  const roomId = params?.roomId || 'global';
  const viewerKey = getViewerKey(params?.viewerUserId);
  const [count, setCount] = useState(sharedCount);

  useEffect(() => {
    sharedRefs += 1;
    const listener = (next: number) => setCount(next);
    sharedListeners.add(listener);
    setCount(sharedCount);

    void ensureSharedChannel(roomId, viewerKey);

    return () => {
      sharedListeners.delete(listener);
      sharedRefs = Math.max(0, sharedRefs - 1);
      if (sharedRefs === 0) releaseSharedChannel();
    };
  }, [roomId, viewerKey]);

  useEffect(() => {
    const shouldTrack = Boolean(params?.viewerUserId) && Boolean(params?.isListening);
    const username = (params?.username || '').trim().slice(0, 20) || 'Guest';

    sharedShouldTrack = shouldTrack;
    sharedTrackMeta = shouldTrack
      ? { user_id: params?.viewerUserId || undefined, room_id: roomId, username, online_at: new Date().toISOString() }
      : null;

    if (!sharedChannel) return;
    if (!shouldTrack && sharedTracked) {
      // Cleanup happens here when a listener stops listening (untrack to prevent stale counts).
      void sharedChannel.untrack().catch(() => void 0);
      sharedTracked = false;
      return;
    }
    if (shouldTrack && sharedTrackMeta) {
      void sharedChannel
        .track(sharedTrackMeta)
        .then(() => {
          sharedTracked = true;
        })
        .catch(() => void 0);
    }
  }, [params?.isListening, params?.username, params?.viewerUserId, roomId]);

  return count;
}
