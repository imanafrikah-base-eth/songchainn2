import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Music that lives inside an artist's world.
 *
 * Everything here is safe to show anybody: the name, the cover, the preview
 * video. Where the audio actually sits is never sent to a browser; the only
 * way to it is the world-track-url function, which reads the caller's own
 * wallet first. See src/hooks/useWorldTrackPlay.ts.
 */

export interface WorldTrack {
  id: string;
  worldSlug: string;
  streetSlug: string | null;
  artistId: string | null;
  title: string;
  partLabel: string | null;
  artistCredit: string | null;
  artworkUrl: string | null;
  previewVideoUrl: string | null;
  unlockUsd: number;
  genre: string | null;
  publishedAt: string | null;
}

const rowToTrack = (row: Record<string, unknown>): WorldTrack => ({
  id: String(row.id),
  worldSlug: String(row.world_slug ?? ''),
  streetSlug: row.street_slug ? String(row.street_slug) : null,
  artistId: row.artist_id ? String(row.artist_id) : null,
  title: String(row.title ?? ''),
  partLabel: row.part_label ? String(row.part_label) : null,
  artistCredit: row.artist_credit ? String(row.artist_credit) : null,
  artworkUrl: row.artwork_url ? String(row.artwork_url) : null,
  previewVideoUrl: row.preview_video_url ? String(row.preview_video_url) : null,
  unlockUsd: Number(row.unlock_usd ?? 1),
  genre: row.genre ? String(row.genre) : null,
  publishedAt: row.published_at ? String(row.published_at) : null,
});

const SELECT = 'id, world_slug, street_slug, artist_id, title, part_label, artist_credit, artwork_url, preview_video_url, unlock_usd, genre, published_at';

/** The newest music from every world, for the row on Home. */
export function useWorldMusicDrops(limit = 8) {
  return useQuery({
    queryKey: ['world-music-drops', limit],
    queryFn: async (): Promise<WorldTrack[]> => {
      const { data, error } = await (supabase as any)
        .from('world_tracks')
        .select(SELECT)
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .order('sort_order', { ascending: true })
        .limit(limit);
      if (error) return [];
      return ((data as Record<string, unknown>[]) ?? []).map(rowToTrack);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** One world's music, in the artist's own order. */
export function useWorldTracks(worldSlug: string | undefined, streetSlug?: string) {
  return useQuery({
    queryKey: ['world-tracks', worldSlug, streetSlug ?? null],
    enabled: Boolean(worldSlug),
    queryFn: async (): Promise<WorldTrack[]> => {
      let q = (supabase as any)
        .from('world_tracks')
        .select(SELECT)
        .eq('world_slug', worldSlug)
        .not('published_at', 'is', null)
        .order('sort_order', { ascending: true });
      if (streetSlug) q = q.eq('street_slug', streetSlug);
      const { data, error } = await q;
      if (error) return [];
      return ((data as Record<string, unknown>[]) ?? []).map(rowToTrack);
    },
    staleTime: 5 * 60 * 1000,
  });
}
