import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SONGS, ARTISTS, Song, Artist } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Merges admin-published songs/artists (stored in the `songs` table) into the
// static musicData catalog, so every popularity/ranking hook below sees them.
function useMergedCatalog() {
  const { songs: publishedSongs, artists: publishedArtists } = usePublishedCatalog();
  const songs = useMemo(() => [...SONGS, ...publishedSongs], [publishedSongs]);
  const artists = useMemo(() => [...ARTISTS, ...publishedArtists], [publishedArtists]);
  return { songs, artists };
}

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

// Plays = historical baseline + real plays. The baseline (song.plays, distributed
// from ARTIST_STREAM_TARGETS) is the catalogue's carried-over stream history; every
// row in song_analytics is a real listen recorded by the app and stacks on top.
// Likes/comments/shares/views are NEVER seeded — only real user actions count.
function mergeSongPopularity(rows: SongPopularity[] | null | undefined, songs: Song[] = SONGS): SongPopularity[] {
  const merged = new Map<string, SongPopularity>();
  const baselineById = new Map<string, number>();

  songs.forEach((song) => {
    const baseline = Math.max(0, numberOrZero(song.plays));
    baselineById.set(song.id, baseline);
    merged.set(song.id, {
      song_id: song.id,
      play_count: baseline,
      like_count: 0,
      comment_count: 0,
      share_count: 0,
      view_count: 0,
      popularity_score: null,
    });
  });

  (rows || []).forEach((row) => {
    const songId = String(row.song_id || '').trim();
    if (!songId) return;

    // Songs uploaded after the static catalogue have no baseline — they start at 0
    // and count only real plays, which is what we want for every new release.
    const baseline = baselineById.get(songId) ?? 0;

    merged.set(songId, {
      song_id: songId,
      play_count: baseline + numberOrZero(row.play_count),
      like_count: numberOrZero(row.like_count),
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
  const { songs } = useMergedCatalog();

  return useQuery({
    queryKey: ['song-popularity', songs.length],
    queryFn: async () => {
      maybeResetRpcFlags();
      if (canUseGetSongPopularityRpc !== false) {
        const { data, error } = await supabase.rpc('get_song_popularity');
        if (!error) {
          canUseGetSongPopularityRpc = true;
          return mergeSongPopularity((data as SongPopularity[]) || [], songs);
        }
        canUseGetSongPopularityRpc = false;
      }

      return mergeSongPopularity([] as SongPopularity[], songs);
    },
    staleTime: 1000 * 10,
    refetchInterval: 10000,
    placeholderData: () => mergeSongPopularity([], songs),
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

export function useTodayHotSongs(limit = 10) {
  // Key by today's date in CAT (UTC+2) so the cache automatically invalidates at midnight CAT
  // and the list resets cleanly with no rolling-window bleed from the previous day.
  const CAT_OFFSET_MS = 2 * 60 * 60 * 1000;
  const nowAsCat = new Date(Date.now() + CAT_OFFSET_MS);
  const todayCat = nowAsCat.toISOString().slice(0, 10); // "YYYY-MM-DD" in CAT
  const { songs } = useMergedCatalog();

  return useQuery({
    queryKey: ['today-hot-songs', limit, todayCat, songs.length],
    queryFn: async () => {
      maybeResetRpcFlags();

      // Primary path: omit p_since so the DB function computes midnight CAT itself.
      // The SECURITY DEFINER RPC bypasses RLS so anon users see global counts.
      if (canUseGetTodayHotSongsRpc !== false) {
        const { data, error } = await (supabase as any).rpc('get_today_hot_songs', {
          p_limit: limit,
        });
        if (!error) {
          canUseGetTodayHotSongsRpc = true;
          return ((data as any[]) || [])
            .map((row: any) => {
              const song = songs.find(s => s.id === String(row.song_id));
              return song ? { song, playsToday: Number(row.plays_today) } : null;
            })
            .filter(Boolean) as TodayHotSong[];
        }
        canUseGetTodayHotSongsRpc = false;
      }

      // Fallback: direct query — compute midnight CAT on the client.
      const midnightCat = new Date(`${todayCat}T00:00:00+02:00`).toISOString();
      const { data: rows } = await supabase
        .from('song_analytics')
        .select('song_id')
        .eq('event_type', 'play')
        .gte('created_at', midnightCat);

      if (!rows || rows.length === 0) return [] as TodayHotSong[];

      const counts = new Map<string, number>();
      (rows as any[]).forEach(r => {
        if (r.song_id) counts.set(r.song_id, (counts.get(r.song_id) || 0) + 1);
      });
      return Array.from(counts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .flatMap(([songId, playsToday]) => {
          const song = songs.find(s => s.id === songId);
          return song ? [{ song, playsToday }] : [];
        });
    },
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60,
    placeholderData: () => [] as TodayHotSong[],
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
  const { artists } = useMergedCatalog();

  return useQuery({
    queryKey: ['artist-follower-counts', artists.length],
    queryFn: async () => {
      const artistIds = artists.map((artist) => artist.id);
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
    placeholderData: () => artists.map(a => ({ artist_id: a.id, follower_count: ARTIST_FOLLOWER_BASELINE })),
  });
}

export function useArtistStreamTotals() {
  usePopularityRealtime();
  const { songs } = useMergedCatalog();

  return useQuery({
    queryKey: ['artist-stream-totals', songs.length],
    queryFn: async () => {
      let popularityData: SongPopularity[] = mergeSongPopularity([], songs);
      if (canUseGetSongPopularityRpc !== false) {
        const { data, error } = await supabase.rpc('get_song_popularity');
        if (!error && data) {
          canUseGetSongPopularityRpc = true;
          popularityData = mergeSongPopularity(data as SongPopularity[], songs);
        } else {
          canUseGetSongPopularityRpc = false;
        }
      }

      const songToArtist = new Map<string, string>(songs.map((song) => [song.id, song.artistId]));
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
      const seed = mergeSongPopularity([], songs);
      const songToArtist = new Map<string, string>(songs.map(s => [s.id, s.artistId]));
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
  const { songs } = useMergedCatalog();
  const { data: popularityData, isLoading } = useSongPopularity();
  const { data: pulseCounts } = usePulseCounts();

  const rankedSongsBase: RankedSong[] = songs.map(song => {
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
  const { artists } = useMergedCatalog();
  const { rankedSongs, isLoading } = useRankedSongs();

  // Calculate artist popularity based on their songs' performance
  const artistScores = new Map<string, number>();

  rankedSongs.forEach(song => {
    const current = artistScores.get(song.artistId) || 0;
    artistScores.set(song.artistId, current + song.popularity_score);
  });

  const rankedArtists = [...artists].sort((a, b) => {
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
