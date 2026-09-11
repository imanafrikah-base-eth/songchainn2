import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ARTISTS, GENRES, type Song, type Artist, type Genre } from '@/data/musicData';
import { registerArtistNames } from '@/lib/slugRoutes';

interface PublishedSongRow {
  id: string;
  title: string | null;
  artist_name: string | null;
  audio_url: string | null;
  cover_art_url: string | null;
  artist_image_url: string | null;
  genre: string | null;
  town_square: string | null;
  artist_id: string | null;
  created_at: string | null;
  // jsonb from the audition. The DB does not guarantee its shape, so it is
  // read defensively rather than trusted.
  audition: unknown;
  duration_seconds: number | null;
  release_id: string | null;
  track_number: number | null;
  explicit: boolean | null;
  release_date: string | null;
}

interface ReleaseRow {
  id: string;
  title: string;
  kind: 'single' | 'ep' | 'album';
  cover_art_url: string | null;
}

// One shared empty array so a not-yet-loaded catalog has a stable identity.
const EMPTY_ROWS: PublishedSongRow[] = [];

const TIERS = ['master', 'release', 'raw'] as const;
type QualityTier = (typeof TIERS)[number];

/**
 * The rung an uploaded track landed on. Undefined for anything that predates
 * the audition, which is the entire founding catalog.
 */
function toTier(audition: unknown): QualityTier | undefined {
  const t = (audition as { tier?: unknown } | null)?.tier;
  return typeof t === 'string' && (TIERS as readonly string[]).includes(t) ? (t as QualityTier) : undefined;
}

// Whether a rung has earned a push lives in @/lib/placement, so the front
// store and the song card both read that rule from one place.

function toGenre(value: string | null): Genre {
  return (GENRES as string[]).includes(value ?? '') ? (value as Genre) : 'Afro';
}

/**
 * Songs published by an admin (via the artist application review flow) live
 * in the `songs` table, separate from the static src/data/musicData.ts
 * catalog. This hook fetches them and shapes them to the same Song/Artist
 * interfaces so pages can merge them into the existing static arrays.
 */
export function usePublishedCatalog() {
  const query = useQuery({
    queryKey: ['published-catalog'],
    queryFn: async (): Promise<PublishedSongRow[]> => {
      // The public read policy already hides a scheduled record until its
      // day; the filter here is only so a stale client never shows one early.
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('songs')
        .select('id, title, artist_name, audio_url, cover_art_url, artist_image_url, genre, town_square, artist_id, created_at, audition, duration_seconds, release_id, track_number, explicit, release_date')
        .eq('is_published', true)
        .not('artist_id', 'is', null)
        .or(`release_date.is.null,release_date.lte.${today}`);
      if (error) throw error;
      return (data || []) as unknown as PublishedSongRow[];
    },
    staleTime: 30_000,
  });

  // EPs and albums the uploaded tracks sit on. Small table, read once.
  const releasesQuery = useQuery({
    queryKey: ['release-groups', 'all'],
    queryFn: async (): Promise<ReleaseRow[]> => {
      const { data, error } = await supabase
        .from('releases' as never)
        .select('id, title, kind, cover_art_url')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as ReleaseRow[]);
    },
    staleTime: 60_000,
  });

  // Derived arrays are memoized on the query data so their identity only
  // changes when the rows do. Consumers put `songs`/`artists` in effect deps
  // (PlaylistDetail, for one), and a fresh array every render made those
  // effects re-fire forever.
  const rows = query.data ?? EMPTY_ROWS;
  const releaseRows = releasesQuery.data;

  const songs = useMemo<Song[]>(() => {
    const byId = new Map((releaseRows ?? []).map((r) => [r.id, r]));
    return rows
      .filter((row) => row.title && row.artist_name && row.audio_url && row.artist_id)
      .map((row) => {
        const release = row.release_id ? byId.get(row.release_id) : undefined;
        return {
          id: row.id,
          title: row.title!,
          artist: row.artist_name!,
          artistId: row.artist_id!,
          audioUrl: row.audio_url!,
          coverImage: row.cover_art_url ?? release?.cover_art_url ?? undefined,
          duration: row.duration_seconds ?? undefined,
          plays: 0,
          likes: 0,
          townSquare: row.town_square ?? 'Livingstone Town Square',
          genre: toGenre(row.genre),
          addedAt: row.created_at ?? undefined,
          qualityTier: toTier(row.audition),
          explicit: row.explicit ?? undefined,
          volume: release?.title ?? 'Single',
          releaseId: release?.id,
          releaseKind: release?.kind,
          trackNumber: row.track_number ?? undefined,
        };
      });
  }, [rows, releaseRows]);

  const artists = useMemo<Artist[]>(() => {
    const existingArtistIds = new Set(ARTISTS.map((a) => a.id));
    const artistsById = new Map<string, Artist>();
    rows.forEach((row) => {
      if (!row.artist_id || existingArtistIds.has(row.artist_id) || artistsById.has(row.artist_id)) return;
      artistsById.set(row.artist_id, {
        id: row.artist_id,
        name: row.artist_name || 'Unknown Artist',
        bio: `${row.artist_name} joined $ongChainn through the artist submission program.`,
        location: row.town_square ?? 'Unknown',
        townSquare: row.town_square ?? 'Livingstone Town Square',
        profileImage: row.artist_image_url ?? undefined,
        songs: rows.filter((r) => r.artist_id === row.artist_id).map((r) => r.id),
        addedAt: row.created_at ?? undefined,
      });
    });
    const list = Array.from(artistsById.values());
    // Artists who joined through the app get their name as their address.
    registerArtistNames(list);
    return list;
  }, [rows]);

  return {
    songs,
    artists,
    isLoading: query.isLoading,
  };
}
