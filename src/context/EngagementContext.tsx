import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';

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
  sendPulse: (songId: string, options?: { roomName?: string | null }) => void;
}

interface PointsBreakdown {
  listening: number;
  likes: number;
  streak: number;
  total: number;
}

const EngagementContext = createContext<EngagementContextType | undefined>(undefined);

const POINTS_PER_PLAY = 2;
const POINTS_PER_LIKE = 1;
const STREAK_BONUS = 5;
const PLAY_DEDUPE_WINDOW_MS = 30_000;
const PULSE_DEDUPE_WINDOW_MS = 500;
const OFFLINE_PLAYS_KEY = 'songchainn_offline_plays_v1';

interface OfflinePlay {
  songId: string;
  timestamp: number;
  durationSeconds: number;
}

export function EngagementProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
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

    setTodayPlays(prev => prev + 1);
    setTotalPlays(prev => prev + 1);
    setEngagementPoints(prev => prev + POINTS_PER_PLAY);

    (async () => {
      await supabase.from('song_analytics').insert({
        event_type: 'play',
        song_id: songId,
        user_id: user?.id ?? null,
      } as any);
    })();
  }, [user]);

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
    const syncOfflinePlays = async () => {
      if (offlinePlaysRef.current.length === 0) return;
      if (!navigator.onLine) return;
      const batch = offlinePlaysRef.current;
      offlinePlaysRef.current = [];
      localStorage.removeItem(OFFLINE_PLAYS_KEY);
      try {
        const payload = batch
          .filter((p) => p.durationSeconds >= 15)
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
  }, [user]);

  const sendPulse = useCallback((songId: string, options?: { roomName?: string | null }) => {
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

    // Broadcast to other online users via Supabase Realtime
    const channelName = `pulse-${payload.roomId || 'global'}`;
    void supabase.channel(channelName).send({
      type: 'broadcast',
      event: 'pulse',
      payload: { songId, userId: user?.id ?? null, timestamp: payload.timestamp },
    });

    (async () => {
      try {
        await supabase.from('song_analytics').insert({
          event_type: 'pulse',
          song_id: songId,
          user_id: user?.id ?? null,
        } as any);
      } catch {
        if (import.meta.env.DEV) {
          console.error('Failed to record pulse event');
        }
      }
    })();
  }, [user]);

  const toggleLike = useCallback(async (songId: string) => {
    const isCurrentlyLiked = likedSongs.has(songId);
    
    // Optimistically update UI
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

    if (user) {
      try {
        if (isCurrentlyLiked) {
          await supabase.from('liked_songs').delete().eq('user_id', user.id).eq('song_id', songId);
        } else {
          await supabase.from('liked_songs').insert({ user_id: user.id, song_id: songId } as any);

          const { data: existingLikes, error: selectError } = await supabase
            .from('social_posts')
            .select('id')
            .eq('user_id', user.id)
            .eq('song_id', songId)
            .eq('post_type', 'song_like')
            .limit(1);

          if (!selectError && (!existingLikes || existingLikes.length === 0)) {
            await supabase.from('social_posts').insert({
              user_id: user.id,
              song_id: songId,
              playlist_id: null,
              content: null,
              post_type: 'song_like',
            } as any);
          }
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Failed to toggle like or create social post', error);
        }
      }
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
    throw new Error('useEngagement must be used within an EngagementProvider');
  }
  return context;
}
