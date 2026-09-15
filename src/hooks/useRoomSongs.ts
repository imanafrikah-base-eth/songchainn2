import { useMemo } from 'react';
import { SONGS, type Song } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';

/**
 * Founding records the Room leaves out because their audio is broken: 40 (the
 * file returns 404) and 213 (the file is under two seconds long). The server's
 * room_founding_songs leaves out the same two.
 */
const UNPLAYABLE_IN_ROOM = new Set(['40', '213']);

/**
 * Every record the Room can play, the founding catalogue and every published
 * upload, looked up by id. It stays empty until the uploads have loaded, so a
 * scheduled upload is never mistaken for a missing song.
 */
export function useRoomSongs() {
  const { songs: publishedSongs, isLoading } = usePublishedCatalog();
  const songs = useMemo(() => {
    if (isLoading) return [] as Song[];
    const byId = new Map<string, Song>();
    for (const song of [...SONGS, ...publishedSongs]) {
      if (song.audioUrl && !UNPLAYABLE_IN_ROOM.has(song.id) && !byId.has(song.id)) byId.set(song.id, song);
    }
    return [...byId.values()];
  }, [isLoading, publishedSongs]);
  const byId = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);
  return { songs, byId, isLoading };
}
