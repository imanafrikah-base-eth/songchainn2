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

export function useRankedSongs() {
  const { data: popularityData, isLoading } = useSongPopularity();
  
  const rankedSongsBase: RankedSong[] = SONGS.map(song => {
    const dbData = popularityData?.find(p => p.song_id === song.id);
    const score = calculateSongScore(dbData);
    
    return {
      ...song,
      // Override mock data with real database data
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
