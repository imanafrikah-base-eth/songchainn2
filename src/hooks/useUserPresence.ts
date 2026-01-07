import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

type PresenceMeta = {
  last_seen_at?: number;
  now_playing_song_id?: string | null;
};

type UseUserPresenceOptions = {
  includeLastSeen?: boolean;
  includeNowPlayingFallback?: boolean;
};

const PRESENCE_KEY = 'songchainn:presence';
const ONLINE_WINDOW_MS = 45_000;
const HEARTBEAT_MS = 15_000;

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
    touchPresence(selfUserId);
    const interval = window.setInterval(() => {
      touchPresence(selfUserId);
      setPresenceVersion(v => v + 1);
    }, HEARTBEAT_MS);

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
    const map = readPresence();
    const meta = map[targetUserId];
    const lastSeen = typeof meta?.last_seen_at === 'number' ? meta.last_seen_at : null;
    const isOnline = lastSeen !== null && Date.now() - lastSeen <= ONLINE_WINDOW_MS;
    return { isOnline, lastSeenAt: includeLastSeen ? lastSeen : null };
  })();

  return {
    isOnline: computed.isOnline,
    lastSeenAt: computed.lastSeenAt,
  };
}
