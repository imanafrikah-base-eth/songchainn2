import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ARTISTS, GENRES, type Song, type Artist, type Genre } from '@/data/musicData';

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
}

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
      const { data, error } = await supabase
        .from('songs')
        .select('id, title, artist_name, audio_url, cover_art_url, artist_image_url, genre, town_square, artist_id, created_at')
        .eq('is_published', true)
        .not('artist_id', 'is', null);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  const rows = query.data ?? [];

  const songs: Song[] = rows
    .filter((row) => row.title && row.artist_name && row.audio_url && row.artist_id)
    .map((row) => ({
      id: row.id,
      title: row.title!,
      artist: row.artist_name!,
      artistId: row.artist_id!,
      audioUrl: row.audio_url!,
      coverImage: row.cover_art_url ?? undefined,
      plays: 0,
      likes: 0,
      townSquare: row.town_square ?? 'Livingstone Town Square',
      genre: toGenre(row.genre),
      addedAt: row.created_at ?? undefined,
      volume: 'Single',
    }));

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

  return {
    songs,
    artists: Array.from(artistsById.values()),
    isLoading: query.isLoading,
  };
}
