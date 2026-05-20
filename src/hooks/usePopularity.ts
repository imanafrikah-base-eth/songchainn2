import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SONGS, ARTISTS, Song, Artist } from '@/data/musicData';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface SongPopularity {
  song_id: string | null;
  play_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  view_count: number | null;
  popularity_score: number | null;
}

const numberOrZero = (value: number | null | undefined) => Number(value || 0);

// Deterministic play/like baseline for songs with no seed data.
// Uses the song ID to produce a stable non-zero floor so counts never start at 0.
function getSeedBaseline(songId: string): { plays: number; likes: number } {
  const n = parseInt(songId, 10) || 0;
  const plays = 180 + ((n * 41 + n * 7 + 23) % 520);
  return { plays, likes: Math.floor(plays * 0.27) };
}

function mergeSongPopularityWithSeed(rows: SongPopularity[] | null | undefined): SongPopularity[] {
  const merged = new Map<string, SongPopularity>();

  SONGS.forEach((song) => {
    const seedPlays = numberOrZero(song.plays);
    const seedLikes = numberOrZero(song.likes);
    const baseline = (seedPlays === 0) ? getSeedBaseline(song.id) : { plays: seedPlays, likes: seedLikes };
    merged.set(song.id, {
      song_id: song.id,
      play_count: Math.max(seedPlays, baseline.plays),
      like_count: Math.max(seedLikes, baseline.likes),
      comment_count: 0,
      share_count: 0,
      view_count: 0,
      popularity_score: null,
    });
  });

  (rows || []).forEach((row) => {
    const songId = String(row.song_id || '').trim();
    if (!songId) return;
    const seed = merged.get(songId);
    const seedPlays = numberOrZero(seed?.play_count);
    const seedLikes = numberOrZero(seed?.like_count);
    const dbPlays = numberOrZero(row.play_count);
    const dbLikes = numberOrZero(row.like_count);

    merged.set(songId, {
      song_id: songId,
      play_count: seedPlays + dbPlays,
      like_count: seedLikes + dbLikes,
      comment_count: numberOrZero(row.comment_count),
      share_count: numberOrZero(row.share_count),
      view_count: numberOrZero(row.view_count),
      popularity_score: row.popularity_score ?? null,
    });
  });

  return Array.from(merged.values());
}

export interface ArtistFollowerCount {
  artist_id: string;
  follower_count: number;
}

export interface ArtistStreamTotal {
  artist_id: string;
  stream_count: number;
}

const ARTIST_FOLLOWER_BASELINE = 71;

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

// Calculate weighted popularity score for songs using ONLY real database data
function calculateSongScore(dbData?: SongPopularity): number {
  const plays = dbData?.play_count || 0;
  const likes = dbData?.like_count || 0;
  const comments = dbData?.comment_count || 0;
  const shares = dbData?.share_count || 0;
  
  // Weighted scoring: plays (1x), likes (3x), comments (5x), shares (7x)
  return plays + (likes * 3) + (comments * 5) + (shares * 7);
}

let popularityChannel: RealtimeChannel | null = null;
let popularityChannelConsumers = 0;
let popularityChannelTeardownTimer: ReturnType<typeof setTimeout> | null = null;
// Track RPC capability per-session only — reset to null means "retry on next mount".
// Using a simple in-session flag avoids permanently disabling after a transient failure.
let canUseGetSongPopularityRpc: boolean | null = null;
let canUseGetArtistFollowCountsRpc: boolean | null = null;
let canUseGetTodayHotSongsRpc: boolean | null = null;
let canUseGetPulseCountsRpc: boolean | null = null;
// Reset capability flags every 5 minutes so a recovered Supabase project gets retried.
let lastRpcCapabilityReset = Date.now();
function maybeResetRpcFlags() {
  const now = Date.now();
  if (now - lastRpcCapabilityReset > 5 * 60 * 1000) {
    canUseGetSongPopularityRpc = null;
    canUseGetArtistFollowCountsRpc = null;
    canUseGetTodayHotSongsRpc = null;
    canUseGetPulseCountsRpc = null;
    lastRpcCapabilityReset = now;
  }
}

// ---------------------------------------------------------------------------
// Real-time count broadcast — instant cross-client play / like / follow deltas
// ---------------------------------------------------------------------------
let countsLiveChannel: RealtimeChannel | null = null;

interface CountDeltaPayload {
  type: 'play' | 'like' | 'follow';
  songId?: string;
  artistId?: string;
  delta?: number;
}

function handleCountDelta(queryClient: ReturnType<typeof useQueryClient>, p: CountDeltaPayload) {
  if (p.type === 'play' && p.songId) {
    queryClient.setQueryData(['song-popularity'], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((item: any) =>
        String(item.song_id) === String(p.songId)
          ? { ...item, play_count: (item.play_count || 0) + 1 }
          : item,
      );
    });
  } else if (p.type === 'like' && p.songId) {
    queryClient.setQueryData(['song-popularity'], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((item: any) =>
        String(item.song_id) === String(p.songId)
          ? { ...item, like_count: Math.max(0, (item.like_count || 0) + (p.delta ?? 0)) }
          : item,
      );
    });
  } else if (p.type === 'follow' && p.artistId) {
    queryClient.setQueryData(['artist-follower-counts'], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((item: any) =>
        String(item.artist_id) === String(p.artistId)
          ? { ...item, follower_count: Math.max(0, (item.follower_count || 0) + (p.delta ?? 0)) }
          : item,
      );
    });
  }
}

function ensureCountsLiveChannel(queryClient: ReturnType<typeof useQueryClient>): RealtimeChannel {
  if (countsLiveChannel) return countsLiveChannel;
  countsLiveChannel = supabase
    .channel('counts-live', { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'count-delta' }, ({ payload }) => {
      if (payload) handleCountDelta(queryClient, payload as CountDeltaPayload);
    })
    .subscribe();
  return countsLiveChannel;
}

export function broadcastCountDelta(type: 'play' | 'like' | 'follow', data: Omit<CountDeltaPayload, 'type'>): void {
  if (!countsLiveChannel) return;
  try {
    void countsLiveChannel.send({
      type: 'broadcast',
      event: 'count-delta',
      payload: { type, ...data } as CountDeltaPayload,
    });
  } catch { /* non-critical */ }
}

function invalidatePopularityQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['song-popularity'] });
  queryClient.invalidateQueries({ queryKey: ['artist-stream-totals'] });
  queryClient.invalidateQueries({ queryKey: ['pulse-counts'] });
}

function ensurePopularityChannel(queryClient: ReturnType<typeof useQueryClient>) {
  if (popularityChannel) return popularityChannel;

  popularityChannel = supabase
    .channel('popularity-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'song_analytics' }, () => {
      invalidatePopularityQueries(queryClient);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'song_popularity' }, () => {
      invalidatePopularityQueries(queryClient);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'liked_songs' }, () => {
      queryClient.invalidateQueries({ queryKey: ['song-popularity'] });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'liked_artists' }, () => {
      queryClient.invalidateQueries({ queryKey: ['artist-follower-counts'] });
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

  return popularityChannel;
}

// Hook to subscribe to real-time popularity updates
function usePopularityRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Keep exactly one shared realtime channel across hooks/components.
    if (popularityChannelTeardownTimer) {
      clearTimeout(popularityChannelTeardownTimer);
      popularityChannelTeardownTimer = null;
    }
    popularityChannelConsumers += 1;
    ensurePopularityChannel(queryClient);
    ensureCountsLiveChannel(queryClient);

    return () => {
      popularityChannelConsumers = Math.max(0, popularityChannelConsumers - 1);
      if (popularityChannelConsumers === 0) {
        // Delay teardown to survive StrictMode mount/unmount remount cycle in dev.
        popularityChannelTeardownTimer = setTimeout(() => {
          if (popularityChannelConsumers === 0 && popularityChannel) {
            supabase.removeChannel(popularityChannel);
            popularityChannel = null;
          }
          if (popularityChannelConsumers === 0 && countsLiveChannel) {
            supabase.removeChannel(countsLiveChannel);
            countsLiveChannel = null;
          }
          popularityChannelTeardownTimer = null;
        }, 1500);
      }
    };
  }, [queryClient]);
}

export function useSongPopularity() {
  usePopularityRealtime();
  
  return useQuery({
    queryKey: ['song-popularity'],
    queryFn: async () => {
      maybeResetRpcFlags();
      if (canUseGetSongPopularityRpc !== false) {
        const { data, error } = await supabase.rpc('get_song_popularity');
        if (!error) {
          canUseGetSongPopularityRpc = true;
          return mergeSongPopularityWithSeed((data as SongPopularity[]) || []);
        }
        canUseGetSongPopularityRpc = false;
      }

      return mergeSongPopularityWithSeed([] as SongPopularity[]);
    },
    staleTime: 1000 * 10,
    refetchInterval: 10000,
    placeholderData: () => mergeSongPopularityWithSeed([]),
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

function buildSeedHotSongs(limit: number): TodayHotSong[] {
  return SONGS
    .map(song => ({ song, playsToday: getSeedBaseline(song.id).plays }))
    .sort((a, b) => b.playsToday - a.playsToday)
    .slice(0, limit);
}

export function useTodayHotSongs(limit = 5) {
  const now = new Date();
  const todayUTC = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  return useQuery({
    queryKey: ['today-hot-songs', limit, todayUTC],
    queryFn: async () => {
      maybeResetRpcFlags();
      const d = new Date();
      const windowStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

      if (canUseGetTodayHotSongsRpc !== false) {
        const { data, error } = await (supabase as any).rpc('get_today_hot_songs', {
          p_since: windowStart.toISOString(),
          p_limit: limit,
        });
        if (!error && Array.isArray(data)) {
          canUseGetTodayHotSongsRpc = true;
          if (data.length > 0) {
            return data
              .map((row: any) => {
                const song = SONGS.find(s => s.id === String(row.song_id));
                return song ? { song, playsToday: Number(row.plays_today) } : null;
              })
              .filter(Boolean) as TodayHotSong[];
          }
          // RPC exists but no plays in window — fall through to seed
        } else {
          canUseGetTodayHotSongsRpc = false;
        }
      }

      // Fallback: direct query (limited by per-user RLS)
      const { data: fallbackData } = await supabase
        .from('song_analytics')
        .select('song_id')
        .eq('event_type', 'play')
        .gte('created_at', windowStart.toISOString());

      if (fallbackData && fallbackData.length > 0) {
        const counts = new Map<string, number>();
        (fallbackData as any[]).forEach((row) => {
          const songId = row.song_id as string | null;
          if (!songId) return;
          counts.set(songId, (counts.get(songId) || 0) + 1);
        });

        const result: TodayHotSong[] = [];
        counts.forEach((playsToday, songId) => {
          const song = SONGS.find(s => s.id === songId);
          if (song) result.push({ song, playsToday });
        });
        result.sort((a, b) => b.playsToday - a.playsToday);
        if (result.length > 0) return result.slice(0, limit);
      }

      // Final fallback: deterministic seed so Hot Today always has content
      return buildSeedHotSongs(limit);
    },
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60,
    placeholderData: () => buildSeedHotSongs(limit),
  });
}

export function usePulseCounts() {
  return useQuery({
    queryKey: ['pulse-counts'],
    queryFn: async () => {
      if (canUseGetPulseCountsRpc !== false) {
        const { data, error } = await (supabase as any).rpc('get_pulse_counts');
        if (!error && Array.isArray(data)) {
          canUseGetPulseCountsRpc = true;
          return data.map((row: any) => ({
            song_id: String(row.song_id),
            pulse_count: Number(row.pulse_count),
          })) as SongPulseCount[];
        }
        canUseGetPulseCountsRpc = false;
      }

      // Fallback: pulse events are visible to all authenticated users via RLS
      const { data, error } = await supabase
        .from('song_analytics')
        .select('song_id')
        .eq('event_type', 'pulse');

      if (error || !data) return [] as SongPulseCount[];

      const counts = new Map<string, number>();
      (data as any[]).forEach((row) => {
        const songId = row.song_id as string | null;
        if (!songId) return;
        counts.set(songId, (counts.get(songId) || 0) + 1);
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

export function useArtistFollowerCounts() {
  usePopularityRealtime();

  return useQuery({
    queryKey: ['artist-follower-counts'],
    queryFn: async () => {
      const artistIds = ARTISTS.map((artist) => artist.id);
      const countsByArtist = new Map<string, number>();
      artistIds.forEach((artistId) => {
        countsByArtist.set(artistId, ARTIST_FOLLOWER_BASELINE);
      });

      try {
        if (canUseGetArtistFollowCountsRpc !== false) {
          const { data, error } = await (supabase as any).rpc('get_artist_follow_counts', {
            artist_ids: artistIds,
          });

          if (!error && Array.isArray(data)) {
            canUseGetArtistFollowCountsRpc = true;
            data.forEach((row: any) => {
              const artistId = String(row?.artist_id || '').trim();
              if (!artistId) return;
              const count = Number(row?.follower_count || 0);
              const normalizedCount = Math.max(0, Number.isFinite(count) ? Math.floor(count) : 0);
              countsByArtist.set(artistId, ARTIST_FOLLOWER_BASELINE + normalizedCount);
            });

            return Array.from(countsByArtist.entries()).map(([artist_id, follower_count]) => ({
              artist_id,
              follower_count,
            }));
          }

          canUseGetArtistFollowCountsRpc = false;
        }
      } catch {
        // Ignore RPC failures and continue to table fallback.
      }

      const { data, error } = await supabase.from('liked_artists').select('artist_id, user_id');
      if (!error && data) {
        const perArtistFollowers = new Map<string, Set<string>>();
        (data as any[]).forEach((row, index) => {
          const artistId = String(row.artist_id || '').trim();
          if (!artistId) return;
          const userId = String(row.user_id || '').trim() || `anon-${index}`;
          const existing = perArtistFollowers.get(artistId);
          if (existing) {
            existing.add(userId);
          } else {
            perArtistFollowers.set(artistId, new Set([userId]));
          }
        });
        perArtistFollowers.forEach((userIds, artistId) => {
          countsByArtist.set(artistId, ARTIST_FOLLOWER_BASELINE + userIds.size);
        });
      }

      return Array.from(countsByArtist.entries()).map(([artist_id, follower_count]) => ({
        artist_id,
        follower_count,
      }));
    },
    staleTime: 1000 * 10,
    refetchInterval: 10000,
    placeholderData: () => ARTISTS.map(a => ({ artist_id: a.id, follower_count: ARTIST_FOLLOWER_BASELINE })),
  });
}

export function useArtistStreamTotals() {
  usePopularityRealtime();

  return useQuery({
    queryKey: ['artist-stream-totals'],
    queryFn: async () => {
      let popularityData: SongPopularity[] = mergeSongPopularityWithSeed([]);
      if (canUseGetSongPopularityRpc !== false) {
        const { data, error } = await supabase.rpc('get_song_popularity');
        if (!error && data) {
          canUseGetSongPopularityRpc = true;
          popularityData = mergeSongPopularityWithSeed(data as SongPopularity[]);
        } else {
          canUseGetSongPopularityRpc = false;
        }
      }

      const songToArtist = new Map<string, string>(SONGS.map((song) => [song.id, song.artistId]));
      const totals = new Map<string, number>();

      popularityData.forEach((row) => {
        const songId = String(row.song_id || '').trim();
        if (!songId) return;
        const artistId = songToArtist.get(songId);
        if (!artistId) return;
        const count = Number(row.play_count || 0);
        totals.set(artistId, (totals.get(artistId) || 0) + count);
      });

      return Array.from(totals.entries()).map(([artist_id, stream_count]) => ({
        artist_id,
        stream_count,
      }));
    },
    staleTime: 1000 * 10,
    refetchInterval: 10000,
    placeholderData: () => {
      const seed = mergeSongPopularityWithSeed([]);
      const songToArtist = new Map<string, string>(SONGS.map(s => [s.id, s.artistId]));
      const totals = new Map<string, number>();
      seed.forEach(row => {
        const artistId = songToArtist.get(String(row.song_id || ''));
        if (artistId) totals.set(artistId, (totals.get(artistId) || 0) + (row.play_count || 0));
      });
      return Array.from(totals.entries()).map(([artist_id, stream_count]) => ({ artist_id, stream_count }));
    },
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
  return { rankedSongs: rankedSongsBase, isLoading };
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
