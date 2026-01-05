import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

type PresenceMeta = {
  last_seen_at?: number;
  now_playing_song_id?: string | null;
};

type UseUserPresenceOptions = {
  includeLastSeen?: boolean;
  includeNowPlayingFallback?: boolean;
};

let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let sharedSelfUserId: string | null = null;
let sharedRefs = 0;
const sharedListeners = new Set<() => void>();

function getPresenceState(channel: ReturnType<typeof supabase.channel>) {
  return channel.presenceState() as Record<string, PresenceMeta[]>;
}

function notifyPresenceChange() {
  for (const listener of sharedListeners) listener();
}

async function ensurePresenceChannel(selfUserId: string) {
  if (sharedChannel && sharedSelfUserId === selfUserId) return sharedChannel;

  if (sharedChannel) {
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
  }

  sharedSelfUserId = selfUserId;

  const channel = supabase.channel('global-presence', {
    config: {
      presence: { key: selfUserId },
    },
  });
  sharedChannel = channel;

  const sync = () => notifyPresenceChange();
  channel.on('presence', { event: 'sync' }, sync);
  channel.on('presence', { event: 'join' }, sync);
  channel.on('presence', { event: 'leave' }, sync);

  await new Promise<void>(resolve => {
    channel.subscribe(async status => {
      if (status !== 'SUBSCRIBED') return;
      try {
        await channel.track({ last_seen_at: Date.now(), now_playing_song_id: null });
      } catch {
        void 0;
      }
      sync();
      resolve();
    });
  });

  return channel;
}

function releasePresenceChannel() {
  if (sharedRefs > 0) return;
  if (!sharedChannel) return;
  supabase.removeChannel(sharedChannel);
  sharedChannel = null;
  sharedSelfUserId = null;
}

export function useUserPresence(targetUserId: string | null | undefined, options?: UseUserPresenceOptions) {
  const { user } = useAuth();
  const selfUserId = user?.id ?? null;
  const includeLastSeen = options?.includeLastSeen ?? false;

  const [, setPresenceVersion] = useState(0);

  useEffect(() => {
    if (!selfUserId) return;

    sharedRefs += 1;
    const listener = () => setPresenceVersion(v => v + 1);
    sharedListeners.add(listener);

    void ensurePresenceChannel(selfUserId);

    return () => {
      sharedListeners.delete(listener);
      sharedRefs = Math.max(0, sharedRefs - 1);
      if (sharedRefs === 0) releasePresenceChannel();
    };
  }, [selfUserId]);

  const computed = (() => {
    if (!targetUserId || !sharedChannel) return { isOnline: false, lastSeenAt: null as number | null };

    const state = getPresenceState(sharedChannel);
    const metas = state[targetUserId];
    const isOnline = Array.isArray(metas) && metas.length > 0;
    const lastSeenAt = includeLastSeen
      ? (metas?.map(m => m?.last_seen_at).filter((t): t is number => typeof t === 'number').sort((a, b) => b - a)[0] ?? null)
      : null;

    return { isOnline, lastSeenAt };
  })();

  return {
    isOnline: computed.isOnline,
    lastSeenAt: computed.lastSeenAt,
  };
}
