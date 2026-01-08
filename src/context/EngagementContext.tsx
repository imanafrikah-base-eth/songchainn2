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
  toggleLike: (songId: string) => void;
  isLiked: (songId: string) => boolean;
  getPointsBreakdown: () => PointsBreakdown;
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

  // Sync liked songs from database when user logs in
  useEffect(() => {
    const syncLikesFromDatabase = async () => {
      if (user) {
        const { data } = await supabase.from('liked_songs').select('song_id').eq('user_id', user.id);
        setLikedSongsState(new Set((data || []).map((r: any) => r.song_id).filter(Boolean)));
      } else {
        // Fall back to localStorage for non-authenticated users
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
      if (isCurrentlyLiked) {
        await supabase.from('liked_songs').delete().eq('user_id', user.id).eq('song_id', songId);
      } else {
        await supabase.from('liked_songs').insert({ user_id: user.id, song_id: songId } as any);
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
      toggleLike,
      isLiked,
      getPointsBreakdown,
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
