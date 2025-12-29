import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

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
  
  const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set());
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
        const { data, error } = await supabase
          .from('liked_songs')
          .select('song_id')
          .eq('user_id', user.id);
        
        if (!error && data) {
          setLikedSongs(new Set(data.map(item => item.song_id)));
        }
      } else {
        // Fall back to localStorage for non-authenticated users
        const saved = localStorage.getItem('songchainn_likes');
        setLikedSongs(saved ? new Set(JSON.parse(saved)) : new Set());
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
  }, []);

  const toggleLike = useCallback(async (songId: string) => {
    const isCurrentlyLiked = likedSongs.has(songId);
    
    // Optimistically update UI
    setLikedSongs(prev => {
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

    // Persist to database if user is authenticated
    if (user) {
      // Check if offline - queue the action for later
      if (!navigator.onLine) {
        const queue = JSON.parse(localStorage.getItem('offline_action_queue') || '[]');
        queue.push({
          id: crypto.randomUUID(),
          type: isCurrentlyLiked ? 'unlike_song' : 'like_song',
          payload: { songId, userId: user.id },
          timestamp: Date.now(),
          retries: 0
        });
        localStorage.setItem('offline_action_queue', JSON.stringify(queue));
        return;
      }

      if (isCurrentlyLiked) {
        // Unlike: remove from liked_songs table
        const { error } = await supabase
          .from('liked_songs')
          .delete()
          .eq('user_id', user.id)
          .eq('song_id', songId);
        
        if (error) {
          console.error('Error unliking song:', error);
          // Revert optimistic update on error
          setLikedSongs(prev => new Set([...prev, songId]));
          setEngagementPoints(p => p + POINTS_PER_LIKE);
        }
      } else {
        // Like: add to liked_songs table
        const { error } = await supabase
          .from('liked_songs')
          .insert({ user_id: user.id, song_id: songId });
        
        if (error) {
          console.error('Error liking song:', error);
          // Revert optimistic update on error
          setLikedSongs(prev => {
            const newLikes = new Set(prev);
            newLikes.delete(songId);
            return newLikes;
          });
          setEngagementPoints(p => Math.max(0, p - POINTS_PER_LIKE));
        } else {
          // Also record a like event in song_analytics for popularity tracking
          await supabase.from('song_analytics').insert({
            song_id: songId,
            user_id: user.id,
            event_type: 'like'
          });
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
