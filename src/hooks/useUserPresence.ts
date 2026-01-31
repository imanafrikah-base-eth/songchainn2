import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/context/AuthContext';
import { isSupabaseConfigured, supabase } from '@/integrations/supabase/client';

type PresenceMeta = {
  last_seen_at?: number;
  now_playing_song_id?: string | null;
};

type UseUserPresenceOptions = {
  includeLastSeen?: boolean;
  includeNowPlayingFallback?: boolean;
};

type UseOnlineUsersOptions = {
  includeLastSeen?: boolean;
};

const PRESENCE_KEY = 'songchainn:presence';
const FALLBACK_ONLINE_WINDOW_MS = 45_000;
const FALLBACK_HEARTBEAT_MS = 15_000;
const REALTIME_HEARTBEAT_MS = 15_000;

let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let sharedUserId: string | null = null;
let sharedPresence: Record<string, PresenceMeta[]> = {};
let sharedLastSeen: Record<string, number> = {};
let sharedRefs = 0;
let sharedHeartbeat: number | null = null;
const sharedListeners = new Set<() => void>();

function emitSharedUpdate() {
  for (const listener of sharedListeners) listener();
}

function updatePresenceState(channel: ReturnType<typeof supabase.channel>) {
  const next = channel.presenceState() as Record<string, PresenceMeta[]>;
  const now = Date.now();
  for (const userId of Object.keys(sharedPresence)) {
    if (!next[userId]) sharedLastSeen[userId] = now;
  }
  for (const [userId, metas] of Object.entries(next)) {
    if (!Array.isArray(metas)) continue;
    const latest = metas
      .map(meta => (typeof meta?.last_seen_at === 'number' ? meta.last_seen_at : null))
      .filter((value): value is number => typeof value === 'number')
      .sort((a, b) => b - a)[0];
    if (latest !== undefined) sharedLastSeen[userId] = latest;
  }
  sharedPresence = next;
  emitSharedUpdate();
}

function startHeartbeat(channel: ReturnType<typeof supabase.channel>) {
  if (sharedHeartbeat) return;
  sharedHeartbeat = window.setInterval(() => {
    void channel.track({ last_seen_at: Date.now() });
  }, REALTIME_HEARTBEAT_MS);
  void channel.track({ last_seen_at: Date.now() });
}

function stopHeartbeat() {
  if (!sharedHeartbeat) return;
  window.clearInterval(sharedHeartbeat);
  sharedHeartbeat = null;
}

async function ensureSharedChannel(userId: string) {
  if (!isSupabaseConfigured) return null;
  if (sharedChannel && sharedUserId === userId) return sharedChannel;
  if (sharedChannel) {
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
  }
  sharedUserId = userId;
  const channel = supabase.channel('global-presence', {
    config: {
      presence: { key: userId },
    },
  });
  sharedChannel = channel;
  const sync = () => updatePresenceState(channel);
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
  startHeartbeat(channel);
  return channel;
}

function releaseSharedChannel() {
  if (sharedRefs > 0) return;
  if (sharedChannel) {
    supabase.removeChannel(sharedChannel);
  }
  sharedChannel = null;
  sharedUserId = null;
  sharedPresence = {};
  sharedLastSeen = {};
  stopHeartbeat();
}

function readPresence(): Record<string, PresenceMeta> {
  try {
    const raw = localStorage.getItem(PRESENCE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PresenceMeta>;
  } catch {
    return {};
  }
}

function writePresence(map: Record<string, PresenceMeta>) {
  try {
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(map));
  } catch {
    void 0;
  }
}

function touchPresence(selfUserId: string) {
  const map = readPresence();
  map[selfUserId] = { ...(map[selfUserId] || {}), last_seen_at: Date.now() };
  writePresence(map);
}

export function useUserPresence(targetUserId: string | null | undefined, options?: UseUserPresenceOptions) {
  const { user } = useAuth();
  const selfUserId = user?.id ?? null;
  const includeLastSeen = options?.includeLastSeen ?? false;

  const [, setPresenceVersion] = useState(0);

  useEffect(() => {
    if (!selfUserId) return;
    if (isSupabaseConfigured) {
      sharedRefs += 1;
      const listener = () => setPresenceVersion(v => v + 1);
      sharedListeners.add(listener);
      void ensureSharedChannel(selfUserId);
      return () => {
        sharedListeners.delete(listener);
        sharedRefs = Math.max(0, sharedRefs - 1);
        if (sharedRefs === 0) releaseSharedChannel();
      };
    }

    touchPresence(selfUserId);
    const interval = window.setInterval(() => {
      touchPresence(selfUserId);
      setPresenceVersion(v => v + 1);
    }, FALLBACK_HEARTBEAT_MS);

    const onStorage = (e: StorageEvent) => {
      if (e.key === PRESENCE_KEY) setPresenceVersion(v => v + 1);
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('storage', onStorage);
      touchPresence(selfUserId);
    };
  }, [selfUserId]);

  const computed = (() => {
    if (!targetUserId) return { isOnline: false, lastSeenAt: null as number | null };
    if (isSupabaseConfigured) {
      const metas = sharedPresence[targetUserId];
      const isOnline = Array.isArray(metas) && metas.length > 0;
      if (!includeLastSeen) return { isOnline, lastSeenAt: null };
      const latestMeta = metas
        ?.map(meta => (typeof meta?.last_seen_at === 'number' ? meta.last_seen_at : null))
        .filter((value): value is number => typeof value === 'number')
        .sort((a, b) => b - a)[0];
      const lastSeenAt = latestMeta ?? sharedLastSeen[targetUserId] ?? null;
      return { isOnline, lastSeenAt };
    }
    const map = readPresence();
    const meta = map[targetUserId];
    const lastSeen = typeof meta?.last_seen_at === 'number' ? meta.last_seen_at : null;
    const isOnline = lastSeen !== null && Date.now() - lastSeen <= FALLBACK_ONLINE_WINDOW_MS;
    return { isOnline, lastSeenAt: includeLastSeen ? lastSeen : null };
  })();

  return {
    isOnline: computed.isOnline,
    lastSeenAt: computed.lastSeenAt,
  };
}

export function useOnlineUsers(userIds: string[] | null | undefined, options?: UseOnlineUsersOptions) {
  const { user } = useAuth();
  const selfUserId = user?.id ?? null;
  const includeLastSeen = options?.includeLastSeen ?? false;
  const [, setPresenceVersion] = useState(0);

  useEffect(() => {
    if (!selfUserId) return;
    if (isSupabaseConfigured) {
      sharedRefs += 1;
      const listener = () => setPresenceVersion(v => v + 1);
      sharedListeners.add(listener);
      void ensureSharedChannel(selfUserId);
      return () => {
        sharedListeners.delete(listener);
        sharedRefs = Math.max(0, sharedRefs - 1);
        if (sharedRefs === 0) releaseSharedChannel();
      };
    }

    touchPresence(selfUserId);
    const interval = window.setInterval(() => {
      touchPresence(selfUserId);
      setPresenceVersion(v => v + 1);
    }, FALLBACK_HEARTBEAT_MS);

    const onStorage = (e: StorageEvent) => {
      if (e.key === PRESENCE_KEY) setPresenceVersion(v => v + 1);
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('storage', onStorage);
      touchPresence(selfUserId);
    };
  }, [selfUserId]);

  const normalizedUserIds = useMemo(() => {
    if (!Array.isArray(userIds)) return [];
    const unique = new Set<string>();
    for (const id of userIds) {
      if (typeof id === 'string' && id) unique.add(id);
    }
    return Array.from(unique);
  }, [userIds]);

  const onlineUserIds = new Set<string>();
  const lastSeenByUserId: Record<string, number | null> = {};
  if (!normalizedUserIds.length) return { onlineUserIds, lastSeenByUserId };
  if (isSupabaseConfigured) {
    for (const userId of normalizedUserIds) {
      const metas = sharedPresence[userId];
      if (Array.isArray(metas) && metas.length > 0) onlineUserIds.add(userId);
      if (includeLastSeen) {
        const latestMeta = metas
          ?.map(meta => (typeof meta?.last_seen_at === 'number' ? meta.last_seen_at : null))
          .filter((value): value is number => typeof value === 'number')
          .sort((a, b) => b - a)[0];
        lastSeenByUserId[userId] = latestMeta ?? sharedLastSeen[userId] ?? null;
      }
    }
    return { onlineUserIds, lastSeenByUserId };
  }
  const map = readPresence();
  for (const userId of normalizedUserIds) {
    const meta = map[userId];
    const lastSeen = typeof meta?.last_seen_at === 'number' ? meta.last_seen_at : null;
    if (lastSeen !== null && Date.now() - lastSeen <= FALLBACK_ONLINE_WINDOW_MS) onlineUserIds.add(userId);
    if (includeLastSeen) lastSeenByUserId[userId] = lastSeen;
  }
  return { onlineUserIds, lastSeenByUserId };
}

export function formatPresenceLabel(isOnline: boolean, lastSeenAt: number | null) {
  if (isOnline) return 'Online';
  if (!lastSeenAt) return 'Offline';
  return `Last seen ${formatDistanceToNow(new Date(lastSeenAt), { addSuffix: true })}`;
}
