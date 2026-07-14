import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { broadcastCountDelta } from '@/hooks/usePopularity';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Subscribed broadcast channels keyed by channel name — reused across sendPulse calls.
// A channel must be subscribed before .send() works; creating a new one every call
// means nothing is ever actually broadcast.
const pulseChannels = new Map<string, RealtimeChannel>();

function getPulseChannel(channelName: string): RealtimeChannel {
  const existing = pulseChannels.get(channelName);
  if (existing) return existing;
  const ch = supabase.channel(channelName, { config: { broadcast: { self: false } } });
  ch.subscribe();
  pulseChannels.set(channelName, ch);
  return ch;
}

interface EngagementContextType {
  engagementPoints: number;
  currentStreak: number;
  todayPlays: number;
  totalPlays: number;
  likedSongs: Set<string>;
  addPlay: (songId: string) => void;
  addOfflinePlay: (songId: string, durationSeconds: number) => void;
  toggleLike: (songId: string) => void;
  isLiked: (songId: string) => boolean;
  getPointsBreakdown: () => PointsBreakdown;
  sendPulse: (songId: string, options?: { roomName?: string | null; positionSeconds?: number }) => void;
}

interface PointsBreakdown {
  listening: number;
  likes: number;
  streak: number;
  total: number;
}

const EngagementContext = createContext<EngagementContextType | undefined>(undefined);

// Safe no-op fallback — used when context is unavailable (HMR context-identity reset,
// brief state transitions, or components rendering before the provider mounts).
const ENGAGEMENT_NOOP: EngagementContextType = {
  engagementPoints: 0,
  currentStreak: 0,
  todayPlays: 0,
  totalPlays: 0,
  likedSongs: new Set<string>(),
  addPlay: () => {},
  addOfflinePlay: () => {},
  toggleLike: () => {},
  isLiked: () => false,
  getPointsBreakdown: () => ({ listening: 0, likes: 0, streak: 0, total: 0 }),
  sendPulse: () => {},
};

const POINTS_PER_PLAY = 2;
const POINTS_PER_LIKE = 1;
const STREAK_BONUS = 5;

// A stream counts only after 30 seconds of real playback — the rule Spotify and
// the other major DSPs use. Shared by the online player and the offline sync so
// the two can't drift apart and let short plays in through the back door.
export const PLAY_THRESHOLD_SECONDS = 30;

const PLAY_DEDUPE_WINDOW_MS = 30_000;
const PULSE_DEDUPE_WINDOW_MS = 500;
const OFFLINE_PLAYS_KEY = 'songchainn_offline_plays_v1';

interface OfflinePlay {
  songId: string;
  timestamp: number;
  durationSeconds: number;
}

export function EngagementProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [engagementPoints, setEngagementPoints] = useState(() => {
    const saved = localStorage.getItem('songchainn_points');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const [currentStreak, setCurrentStreak] = useState(() => {
    const saved = localStorage.getItem('songchainn_streak');
    return saved ? parseInt(saved, 10) : 1;
  });
  
  const [todayPlays, setTodayPlays] = useState(() => {
    const saved = localStorage.getItem('songchainn_today_plays');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const [totalPlays, setTotalPlays] = useState(() => {
    const saved = localStorage.getItem('songchainn_total_plays');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const [likedSongs, setLikedSongsState] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);
  const lastPlayRef = useRef<{ songId: string; at: number } | null>(null);
  const lastPulseAtRef = useRef<number>(0);
  const offlinePlaysRef = useRef<OfflinePlay[]>([]);
  const playChannelRef = useRef<BroadcastChannel | null>(null);
  const likeInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const raw = localStorage.getItem('songchainn_last_play');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { songId?: string; at?: number };
      if (typeof parsed.songId === 'string' && typeof parsed.at === 'number') {
        lastPlayRef.current = { songId: parsed.songId, at: parsed.at };
      }
    } catch {
      void 0;
    }
  }, []);

  // Cross-tab play deduplication via BroadcastChannel
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('songchainn:plays');
    playChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ songId: string; at: number }>) => {
      const { songId, at } = event.data;
      if (songId && at) lastPlayRef.current = { songId, at };
    };
    return () => {
      channel.close();
      playChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OFFLINE_PLAYS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as OfflinePlay[];
      if (Array.isArray(parsed)) {
        offlinePlaysRef.current = parsed.filter(
          (p) =>
            typeof p.songId === 'string' &&
            typeof p.timestamp === 'number' &&
            typeof p.durationSeconds === 'number' &&
            p.durationSeconds > 0,
        );
      }
    } catch {
      offlinePlaysRef.current = [];
    }
  }, []);

  useEffect(() => {
    const syncLikesFromDatabase = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('liked_songs')
          .select('song_id')
          .eq('user_id', user.id);
        if (error) {
          if (import.meta.env.DEV) {
            console.error('Failed to sync liked songs from Supabase', error);
          }
          setLikedSongsState(new Set());
        } else {
          setLikedSongsState(new Set((data || []).map((r: any) => r.song_id).filter(Boolean)));
        }
      } else {
        const saved = localStorage.getItem('songchainn_likes');
        setLikedSongsState(saved ? new Set(JSON.parse(saved)) : new Set());
      }
      setIsInitialized(true);
    };

    syncLikesFromDatabase();
  }, [user]);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('songchainn_points', engagementPoints.toString());
  }, [engagementPoints]);

  useEffect(() => {
    localStorage.setItem('songchainn_streak', currentStreak.toString());
  }, [currentStreak]);

  useEffect(() => {
    localStorage.setItem('songchainn_today_plays', todayPlays.toString());
  }, [todayPlays]);

  useEffect(() => {
    localStorage.setItem('songchainn_total_plays', totalPlays.toString());
  }, [totalPlays]);

  useEffect(() => {
    // Only persist to localStorage for non-authenticated users
    if (!user && isInitialized) {
      localStorage.setItem('songchainn_likes', JSON.stringify([...likedSongs]));
    }
  }, [likedSongs, user, isInitialized]);

  const ensureAnonymousId = () => {
    const key = 'songchainn_anon_id';
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const maybeCrypto = globalThis.crypto as Crypto | undefined;
      let next: string;
      if (maybeCrypto && 'randomUUID' in maybeCrypto && typeof maybeCrypto.randomUUID === 'function') {
        next = maybeCrypto.randomUUID();
      } else {
        next = `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
      localStorage.setItem(key, next);
      return next;
    } catch {
      return 'anon';
    }
  };

  const addPlay = useCallback((songId: string) => {
    const now = Date.now();
    const last = lastPlayRef.current;
    if (last && last.songId === songId && now - last.at < PLAY_DEDUPE_WINDOW_MS) return;
    lastPlayRef.current = { songId, at: now };
    localStorage.setItem('songchainn_last_play', JSON.stringify({ songId, at: now }));
    playChannelRef.current?.postMessage({ songId, at: now });

    setTodayPlays(prev => prev + 1);
    setTotalPlays(prev => prev + 1);
    setEngagementPoints(prev => prev + POINTS_PER_PLAY);

    // Optimistic update: increment play count in cache immediately
    queryClient.setQueryData(['song-popularity'], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((item: any) =>
        String(item.song_id) === String(songId)
          ? { ...item, play_count: (item.play_count || 0) + 1 }
          : item
      );
    });
    broadcastCountDelta('play', { songId });

    supabase.from('song_analytics').insert({
      event_type: 'play',
      song_id: songId,
      user_id: user?.id ?? null,
    } as any).then(({ error }) => {
      if (error) {
        if (import.meta.env.DEV) console.error('Failed to record play', error);
        // Roll back the optimistic increment so the count stays accurate
        queryClient.setQueryData(['song-popularity'], (old: any[] | undefined) => {
          if (!old) return old;
          return old.map((item: any) =>
            String(item.song_id) === String(songId)
              ? { ...item, play_count: Math.max(0, (item.play_count || 0) - 1) }
              : item
          );
        });
      } else {
        // INSERT confirmed — now refetch so the merged seed+db count is canonical
        queryClient.invalidateQueries({ queryKey: ['song-popularity'] });
        queryClient.invalidateQueries({ queryKey: ['today-hot-songs'] });
        queryClient.invalidateQueries({ queryKey: ['artist-stream-totals'] });
      }
    });
  }, [user, queryClient]);

  const addOfflinePlay = useCallback((songId: string, durationSeconds: number) => {
    if (!songId || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
    try {
      const now = Date.now();
      const plays = offlinePlaysRef.current;
      const thresholdMs = 30_000;
      const recent = plays.find(
        (p) => p.songId === songId && now - p.timestamp < thresholdMs,
      );
      if (recent) return;
      const updated: OfflinePlay[] = [
        ...plays,
        { songId, timestamp: now, durationSeconds },
      ].slice(-500);
      offlinePlaysRef.current = updated;
      localStorage.setItem(OFFLINE_PLAYS_KEY, JSON.stringify(updated));
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    // Don't sync while auth is still bootstrapping — user may appear null until
    // the session is restored, which would permanently attribute plays to no one.
    if (isAuthLoading) return;

    const syncOfflinePlays = async () => {
      if (offlinePlaysRef.current.length === 0) return;
      if (!navigator.onLine) return;
      const batch = offlinePlaysRef.current;
      offlinePlaysRef.current = [];
      localStorage.removeItem(OFFLINE_PLAYS_KEY);
      try {
        const payload = batch
          // Same 30s bar as online playback — an offline listen must be a real
          // listen too, or syncing back would smuggle in uncounted short plays.
          .filter((p) => p.durationSeconds >= PLAY_THRESHOLD_SECONDS)
          .map((p) => ({
            event_type: 'play',
            song_id: p.songId,
            user_id: user?.id ?? null,
          }));
        if (payload.length === 0) return;
        await supabase.from('song_analytics').insert(payload as any);
      } catch {
        offlinePlaysRef.current = batch;
        try {
          localStorage.setItem(OFFLINE_PLAYS_KEY, JSON.stringify(batch));
        } catch {
          void 0;
        }
      }
    };

    const handleOnline = () => {
      void syncOfflinePlays();
    };

    window.addEventListener('online', handleOnline);
    if (navigator.onLine) {
      void syncOfflinePlays();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [user, isAuthLoading]);

  const sendPulse = useCallback((songId: string, options?: { roomName?: string | null; positionSeconds?: number }) => {
    if (!songId) return;
    const now = Date.now();
    if (now - lastPulseAtRef.current < PULSE_DEDUPE_WINDOW_MS) return;
    lastPulseAtRef.current = now;

    const anonymousUserId = ensureAnonymousId();
    const payload = {
      songId,
      timestamp: new Date(now).toISOString(),
      anonymousUserId,
      roomId: options?.roomName || null,
    };

    window.dispatchEvent(new CustomEvent('songchainn:pulse', {
      detail: {
        songId,
        userId: user?.id ?? null,
        source: 'local',
        timestamp: payload.timestamp,
      },
    }));

    // Broadcast to other online users via Supabase Realtime.
    // Channel must be subscribed before .send() — getPulseChannel handles that.
    const channelName = `pulse-${payload.roomId || 'global'}`;
    void getPulseChannel(channelName).send({
      type: 'broadcast',
      event: 'pulse',
      payload: { songId, userId: user?.id ?? null, timestamp: payload.timestamp },
    });

    // Optimistic update: increment pulse count immediately
    queryClient.setQueryData(['pulse-counts'], (old: any[] | undefined) => {
      if (!old) return old;
      const existing = old.find((p: any) => String(p.song_id) === String(songId));
      if (existing) {
        return old.map((p: any) =>
          String(p.song_id) === String(songId)
            ? { ...p, pulse_count: (p.pulse_count || 0) + 1 }
            : p
        );
      }
      return [...old, { song_id: songId, pulse_count: 1 }];
    });

    (async () => {
      try {
        // A DB trigger on song_analytics (create_song_pulse_social_post) creates
        // the matching feed post server-side, with its own 4h-per-song cooldown.
        const positionSeconds =
          typeof options?.positionSeconds === 'number' && Number.isFinite(options.positionSeconds) && options.positionSeconds >= 0
            ? options.positionSeconds
            : null;
        await supabase.from('song_analytics').insert({
          event_type: 'pulse',
          song_id: songId,
          user_id: user?.id ?? null,
          position_seconds: positionSeconds,
        } as any);
        queryClient.invalidateQueries({ queryKey: ['pulse-counts'] });
      } catch {
        if (import.meta.env.DEV) {
          console.error('Failed to record pulse event');
        }
      }
    })();
  }, [user, queryClient]);

  const toggleLike = useCallback(async (songId: string) => {
    if (likeInFlightRef.current.has(songId)) return;
    likeInFlightRef.current.add(songId);

    const isCurrentlyLiked = likedSongs.has(songId);

    // Optimistically update UI — heart state and global like count
    setLikedSongsState(prev => {
      const newLikes = new Set(prev);
      if (isCurrentlyLiked) {
        newLikes.delete(songId);
        setEngagementPoints(p => Math.max(0, p - POINTS_PER_LIKE));
      } else {
        newLikes.add(songId);
        setEngagementPoints(p => p + POINTS_PER_LIKE);
      }
      return newLikes;
    });
    const likeDelta = isCurrentlyLiked ? -1 : 1;
    queryClient.setQueryData(['song-popularity'], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((item: any) =>
        String(item.song_id) === String(songId)
          ? { ...item, like_count: Math.max(0, (item.like_count || 0) + likeDelta) }
          : item
      );
    });
    broadcastCountDelta('like', { songId, delta: likeDelta });

    try {
      if (user) {
        if (isCurrentlyLiked) {
          const { error } = await supabase.from('liked_songs').delete().eq('user_id', user.id).eq('song_id', songId);
          if (error) throw error;
        } else {
          // A DB trigger on liked_songs (create_song_like_social_post) creates the
          // matching feed post server-side, at most once per user+song.
          const { error: insertError } = await supabase.from('liked_songs').insert({ user_id: user.id, song_id: songId } as any);
          if (insertError) throw insertError;
        }
        // Immediately refresh global like counts without waiting for realtime
        queryClient.invalidateQueries({ queryKey: ['song-popularity'] });
      }
    } catch (error) {
      // Revert optimistic update
      setLikedSongsState(prev => {
        const reverted = new Set(prev);
        if (isCurrentlyLiked) {
          reverted.add(songId);
          setEngagementPoints(p => p + POINTS_PER_LIKE);
        } else {
          reverted.delete(songId);
          setEngagementPoints(p => Math.max(0, p - POINTS_PER_LIKE));
        }
        return reverted;
      });
      if (import.meta.env.DEV) {
        console.error('Failed to toggle like', error);
      }
    } finally {
      likeInFlightRef.current.delete(songId);
    }
  }, [user, likedSongs]);

  const isLiked = useCallback((songId: string) => {
    return likedSongs.has(songId);
  }, [likedSongs]);

  const getPointsBreakdown = useCallback((): PointsBreakdown => {
    const listening = totalPlays * POINTS_PER_PLAY;
    const likes = likedSongs.size * POINTS_PER_LIKE;
    const streak = (currentStreak - 1) * STREAK_BONUS;
    return {
      listening,
      likes,
      streak,
      total: listening + likes + streak,
    };
  }, [totalPlays, likedSongs.size, currentStreak]);

  return (
    <EngagementContext.Provider value={{
      engagementPoints,
      currentStreak,
      todayPlays,
      totalPlays,
      likedSongs,
      addPlay,
      addOfflinePlay,
      toggleLike,
      isLiked,
      getPointsBreakdown,
      sendPulse,
    }}>
      {children}
    </EngagementContext.Provider>
  );
}

export function useEngagement() {
  const context = useContext(EngagementContext);
  if (context === undefined) {
    if (import.meta.env.DEV) {
      console.warn('[EngagementContext] useEngagement called outside provider — returning no-op. This is usually a Vite HMR context-identity reset; a full page reload will fix it.');
    }
    return ENGAGEMENT_NOOP;
  }
  return context;
}
