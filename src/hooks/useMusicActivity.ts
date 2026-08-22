import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SONGS, ARTISTS, type Song } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';

/**
 * What someone has actually been listening to.
 *
 * Built from song_analytics, which is the same server-side event stream the
 * points engine counts, so this cannot be inflated from the client. 'play' is
 * a listen; 'pulse' is the deliberate "this one hits" tap, which is rarer and
 * says more.
 *
 * song_analytics carries a public read policy, so this works on anyone's
 * profile, not just your own.
 */

const MAX_EVENTS = 2000;

export interface PlayEvent {
  song_id: string;
  event_type: string;
  created_at: string;
}

export interface RankedSong {
  song: Song;
  plays: number;
}

export interface RankedArtist {
  artistId: string;
  name: string;
  /** Present but possibly undefined, so the narrowing filter below type-checks. */
  image: string | undefined;
  plays: number;
}

export function useMusicActivity(userId: string | undefined) {
  const { songs: publishedSongs } = usePublishedCatalog();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['music-activity', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<PlayEvent[]> => {
      const { data, error } = await supabase
        .from('song_analytics')
        .select('song_id, event_type, created_at')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(MAX_EVENTS);
      if (error) throw error;
      return (data ?? []) as PlayEvent[];
    },
  });

  return useMemo(() => {
    const byId = new Map<string, Song>();
    for (const s of [...SONGS, ...publishedSongs]) byId.set(s.id, s);

    const plays = events.filter((e) => e.event_type === 'play');
    const pulses = events.filter((e) => e.event_type === 'pulse');

    const songCounts = new Map<string, number>();
    for (const e of plays) songCounts.set(e.song_id, (songCounts.get(e.song_id) ?? 0) + 1);

    const topSongs: RankedSong[] = [...songCounts.entries()]
      .map(([id, count]) => ({ song: byId.get(id), plays: count }))
      .filter((r): r is RankedSong => !!r.song)
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 8);

    const artistCounts = new Map<string, number>();
    for (const [id, count] of songCounts) {
      const song = byId.get(id);
      if (!song) continue;
      artistCounts.set(song.artistId, (artistCounts.get(song.artistId) ?? 0) + count);
    }

    const topArtists: RankedArtist[] = [...artistCounts.entries()]
      .map(([artistId, count]) => {
        const artist = ARTISTS.find((a) => a.id === artistId);
        const fromSong = [...byId.values()].find((s) => s.artistId === artistId);
        const name = artist?.name ?? fromSong?.artist;
        if (!name) return null;
        return { artistId, name, image: artist?.profileImage, plays: count };
      })
      .filter((a): a is RankedArtist => !!a)
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 5);

    // Collapse repeats: playing one song six times in a row is one thing that
    // happened, not six rows of noise.
    const recent: Array<{ song: Song; at: string }> = [];
    for (const e of plays) {
      const song = byId.get(e.song_id);
      if (!song) continue;
      if (recent.length && recent[recent.length - 1].song.id === song.id) continue;
      recent.push({ song, at: e.created_at });
      if (recent.length >= 8) break;
    }

    return {
      isLoading,
      hasActivity: plays.length > 0,
      totalPlays: plays.length,
      totalPulses: pulses.length,
      uniqueSongs: songCounts.size,
      uniqueArtists: artistCounts.size,
      // Events are newest first, so the last one is the oldest we hold.
      since: plays.length ? plays[plays.length - 1].created_at : null,
      capped: events.length >= MAX_EVENTS,
      topSongs,
      topArtists,
      recent,
    };
  }, [events, isLoading, publishedSongs]);
}
