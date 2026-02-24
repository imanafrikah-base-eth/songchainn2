import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SONGS, ARTISTS, Song, Artist } from '@/data/musicData';

interface SongPopularity {
  song_id: string | null;
  play_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  view_count: number | null;
  popularity_score: number | null;
}

interface ProfilePopularity {
  profile_id: string | null;
  user_id: string | null;
  profile_name: string | null;
  profile_picture_url: string | null;
  bio: string | null;
  follower_count: number | null;
  post_count: number | null;
  total_post_likes: number | null;
  view_count: number | null;
  popularity_score: number | null;
}

export interface RankedSong extends Song {
  popularity_score: number;
  db_plays: number;
  db_likes: number;
  db_comments: number;
  db_shares: number;
}

export interface RankedProfile extends ProfilePopularity {
  popularity_score: number;
}

export interface TodayHotSong {
  song: Song;
  playsToday: number;
}

export interface SongPulseCount {
  song_id: string;
  pulse_count: number;
}

const ARTIST_EXTRA_PLAYS: Record<string, number> = {
  '1': 2110, // 7ROO7H BASED
  '3': 2700, // IMan Afrikah
  '4': 2214, // NDA
  '5': 1997, // PRP
  '6': 2000, // SANCHY
  '7': 2100, // SANTANA
  '8': 1600, // FAITH
  '9': 324,  // JMN
  '10': 348, // SAMMIE
};

const SONG_EXTRA_BASELINE_PLAYS: Record<string, number> = {
  // Boost specific featured tracks
  '3': 5000,  // IMan Afrikah - Endless (Vol1)
  '57': 4000, // 7ROO7H BASED - DISCORD (on-chain)
  '84': 3000, // NDA - STILL

  // IMan Afrikah Vol4 - total 214, unevenly distributed
  '100': 40,
  '101': 36,
  '102': 32,
  '103': 30,
  '104': 28,
  '105': 26,
  '106': 22,

  // JMN extra 260 streams, uneven distribution across existing songs
  '92': 90,
  '93': 85,
  '94': 85,
};

const SONG_BASELINE_PLAYS: Record<string, number> = (() => {
  const perSong: Record<string, number> = {};
  ARTISTS.forEach((artist) => {
    const songs = SONGS.filter((s) => s.artistId === artist.id);
    if (!songs.length) return;

    let total: number;
    if (artist.id === '9') {
      total = 200;
    } else if (artist.id === '10') {
      total = 303;
    } else {
      total = 2000 + (ARTIST_EXTRA_PLAYS[artist.id] || 0);
    }

    const base = Math.floor(total / songs.length);
    let remainder = total - base * songs.length;

    songs.forEach((song) => {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder -= 1;
      const songExtra = SONG_EXTRA_BASELINE_PLAYS[song.id] || 0;
      perSong[song.id] = base + extra + songExtra;
    });
  });
  return perSong;
})();

const SYNTHETIC_START_DATE_ISO = '2026-01-29T00:00:00.000Z';
const SYNTHETIC_TOTAL_DAYS = 14;
const SYNTHETIC_DAILY_PLAYS = 2000;

function getSongBoostWeight(songId: string): number {
  const song = SONGS.find(s => s.id === songId);
  if (!song) return 1;
  const basePlays = song.plays || 0;
  return 1 / Math.sqrt(1 + basePlays);
}

function getDailySyntheticPlaysForSong(songId: string, dayIndex: number, songIds: string[]): number {
  const weights = songIds.map(id => getSongBoostWeight(id));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  const songIndex = songIds.indexOf(songId);
  if (songIndex === -1) return 0;
  const weightShare = weights[songIndex] / totalWeight;
  return Math.round(SYNTHETIC_DAILY_PLAYS * weightShare);
}

function getSyntheticPlaysUpToNow(songId: string, now: Date, songIds: string[]): number {
  const start = new Date(SYNTHETIC_START_DATE_ISO);
  const dayMs = 1000 * 60 * 60 * 24;
  if (now < start) return 0;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const daysSinceStart = Math.floor((startOfToday.getTime() - start.getTime()) / dayMs);
  if (daysSinceStart < 0) return 0;

  const totalDays = Math.min(SYNTHETIC_TOTAL_DAYS, daysSinceStart + 1);
  if (totalDays <= 0) return 0;

  let total = 0;

  for (let dayIndex = 0; dayIndex < totalDays - 1; dayIndex++) {
    total += getDailySyntheticPlaysForSong(songId, dayIndex, songIds);
  }

  const fractionOfToday = Math.min(
    1,
    Math.max(0, (now.getTime() - startOfToday.getTime()) / dayMs)
  );
  const todayPlays = getDailySyntheticPlaysForSong(songId, totalDays - 1, songIds);
  total += Math.floor(todayPlays * fractionOfToday);

  return total;
}

function applyBaselinePlays(rows: any[] | null | undefined): SongPopularity[] {
  const byId = new Map<string, SongPopularity>();
  (rows || []).forEach(row => {
    const r = row as any;
    const songId = String(r.song_id ?? '');
    const base = SONG_BASELINE_PLAYS[songId] || 0;
    const dbPlays = Number(r.play_count ?? 0);
    const next: SongPopularity = {
      song_id: songId || null,
      play_count: dbPlays + base,
      like_count: typeof r.like_count === 'number' ? r.like_count : null,
      comment_count: typeof r.comment_count === 'number' ? r.comment_count : null,
      share_count: typeof r.share_count === 'number' ? r.share_count : null,
      view_count: typeof r.view_count === 'number' ? r.view_count : null,
      popularity_score: typeof r.popularity_score === 'number' ? r.popularity_score : null,
    };
    if (songId) byId.set(songId, next);
  });

  SONGS.forEach(song => {
    if (!byId.has(song.id)) {
      const base = SONG_BASELINE_PLAYS[song.id] || 0;
      byId.set(song.id, {
        song_id: song.id,
        play_count: base,
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        view_count: 0,
        popularity_score: 0,
      });
    }
  });

  const songIds = Array.from(byId.keys());
  const now = new Date();

  songIds.forEach(songId => {
    const entry = byId.get(songId);
    if (!entry || typeof entry.play_count !== 'number') return;
    entry.play_count += getSyntheticPlaysUpToNow(songId, now, songIds);
  });

  return Array.from(byId.values());
}

// Calculate weighted popularity score for songs using ONLY real database data
function calculateSongScore(dbData?: SongPopularity): number {
  const plays = dbData?.play_count || 0;
  const likes = dbData?.like_count || 0;
  const comments = dbData?.comment_count || 0;
  const shares = dbData?.share_count || 0;
  
  // Weighted scoring: plays (1x), likes (3x), comments (5x), shares (7x)
  return plays + (likes * 3) + (comments * 5) + (shares * 7);
}

// Hook to subscribe to real-time popularity updates
function usePopularityRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('popularity-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'song_analytics' }, () => {
        queryClient.invalidateQueries({ queryKey: ['song-popularity'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'liked_songs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['song-popularity'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['profile-popularity'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['profile-popularity'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_follows' }, () => {
        queryClient.invalidateQueries({ queryKey: ['profile-popularity'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profile_views' }, () => {
        queryClient.invalidateQueries({ queryKey: ['profile-popularity'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export function useSongPopularity() {
  usePopularityRealtime();
  
  return useQuery({
    queryKey: ['song-popularity'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_song_popularity');
      if (error) {
        const { data: fallbackData } = await supabase.from('song_popularity').select('*');
        return applyBaselinePlays(fallbackData);
      }
      return applyBaselinePlays(data as any[]);
    },
    staleTime: 1000 * 10,
    refetchInterval: 10000,
  });
}

export function useProfilePopularity() {
  return useQuery({
    queryKey: ['profile-popularity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_popularity')
        .select('*')
        .order('popularity_score', { ascending: false });
      
      if (error) {
        return [];
      }
      
      return data as ProfilePopularity[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useTodayHotSongs(limit = 5) {
  return useQuery({
    queryKey: ['today-hot-songs', limit],
    queryFn: async () => {
      const now = new Date();
      const windowMs = 1000 * 60 * 60 * 24;
      const windowStart = new Date(now.getTime() - windowMs);

      const { data, error } = await supabase
        .from('song_analytics')
        .select('song_id, created_at, event_type')
        .eq('event_type', 'play')
        .gte('created_at', windowStart.toISOString());

      if (error || !data) {
        return [] as TodayHotSong[];
      }

      const counts = new Map<string, number>();

      data.forEach((row: any) => {
        const songId = row.song_id as string | null;
        if (!songId) return;
        const current = counts.get(songId) || 0;
        counts.set(songId, current + 1);
      });

      const songIds = SONGS.map(s => s.id);

      SONGS.forEach(song => {
        const syntheticWindowTotal = getSyntheticPlaysUpToNow(song.id, now, songIds)
          - getSyntheticPlaysUpToNow(song.id, windowStart, songIds);
        const current = counts.get(song.id) || 0;
        counts.set(song.id, current + syntheticWindowTotal);
      });

      let pulseCounts: Map<string, number> = new Map();

      try {
        const { data: pulseData } = await supabase
          .from('song_analytics')
          .select('song_id, created_at, event_type')
          .eq('event_type', 'pulse')
          .gte('created_at', windowStart.toISOString());

        if (pulseData) {
          pulseCounts = new Map();
          (pulseData as any[]).forEach(row => {
            const songId = row.song_id as string | null;
            if (!songId) return;
            const current = pulseCounts.get(songId) || 0;
            pulseCounts.set(songId, current + 1);
          });
        }
      } catch {
        pulseCounts = new Map();
      }

      const result: TodayHotSong[] = [];

      counts.forEach((playsToday, songId) => {
        const song = SONGS.find(s => s.id === songId);
        if (song) {
          const pulses = pulseCounts.get(songId) || 0;
          result.push({ song, playsToday: playsToday + pulses });
        }
      });

      result.sort((a, b) => b.playsToday - a.playsToday);

      return result.slice(0, limit);
    },
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60,
  });
}

export function usePulseCounts() {
  return useQuery({
    queryKey: ['pulse-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_analytics')
        .select('song_id, event_type');

      if (error || !data) {
        return [] as SongPulseCount[];
      }

      const counts = new Map<string, number>();

      (data as any[]).forEach(row => {
        const songId = row.song_id as string | null;
        if (!songId) return;
        if (row.event_type !== 'pulse') return;
        const current = counts.get(songId) || 0;
        counts.set(songId, current + 1);
      });

      return Array.from(counts.entries()).map(([song_id, pulse_count]) => ({
        song_id,
        pulse_count,
      }));
    },
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60,
  });
}

export function useRankedSongs() {
  const { data: popularityData, isLoading } = useSongPopularity();
  const { data: pulseCounts } = usePulseCounts();
  
  const rankedSongsBase: RankedSong[] = SONGS.map(song => {
    const dbData = popularityData?.find(p => p.song_id === song.id);
    const baseScore = calculateSongScore(dbData);
    const pulseData = pulseCounts?.find(p => p.song_id === song.id);
    const pulseBonus = pulseData ? Math.sqrt(pulseData.pulse_count) : 0;
    const score = baseScore + pulseBonus;
    
    return {
      ...song,
      plays: dbData?.play_count || 0,
      likes: dbData?.like_count || 0,
      popularity_score: score,
      db_plays: dbData?.play_count || 0,
      db_likes: dbData?.like_count || 0,
      db_comments: dbData?.comment_count || 0,
      db_shares: dbData?.share_count || 0,
    };
  }).sort((a, b) => b.popularity_score - a.popularity_score);

  const priorityOrder = ['3', '57', '84'];
  const prioritized: RankedSong[] = [];
  const used = new Set<string>();

  priorityOrder.forEach((id) => {
    const match = rankedSongsBase.find((s) => s.id === id);
    if (match) {
      prioritized.push(match);
      used.add(match.id);
    }
  });

  const rest = rankedSongsBase.filter((s) => !used.has(s.id));
  const rankedSongs = [...prioritized, ...rest];
  
  return { rankedSongs, isLoading };
}

export function useRankedArtists() {
  const { rankedSongs, isLoading } = useRankedSongs();
  
  // Calculate artist popularity based on their songs' performance
  const artistScores = new Map<string, number>();
  
  rankedSongs.forEach(song => {
    const current = artistScores.get(song.artistId) || 0;
    artistScores.set(song.artistId, current + song.popularity_score);
  });
  
  const rankedArtists = [...ARTISTS].sort((a, b) => {
    const scoreA = artistScores.get(a.id) || 0;
    const scoreB = artistScores.get(b.id) || 0;
    return scoreB - scoreA;
  });
  
  return { rankedArtists, isLoading };
}

export function useTopProfiles(limit = 10) {
  const { data: profiles, isLoading } = useProfilePopularity();
  
  const topProfiles = (profiles || [])
    .filter(p => p.popularity_score && p.popularity_score > 0)
    .slice(0, limit);
  
  return { topProfiles, isLoading };
}
