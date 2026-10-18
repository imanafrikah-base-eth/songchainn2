import { useCallback } from 'react';
import type { Catalog, Song } from '@/data/musicData';
import { useVerifiedArtists } from '@/hooks/useVerifiedArtists';
import { catalogOnFrontStore, onFrontStore } from '@/lib/placement';

/**
 * The front store rule from @/lib/placement, bound to who is verified right
 * now. Until the verified list loads, uploaded tracks wait off the front
 * rather than flash onto it and vanish.
 */
export function useFrontStore() {
  const { isVerifiedArtist } = useVerifiedArtists();
  const songOnFront = useCallback(
    (song: Pick<Song, 'qualityTier' | 'artistId'>) => onFrontStore(song, isVerifiedArtist),
    [isVerifiedArtist],
  );
  const catalogOnFront = useCallback(
    (catalog: Pick<Catalog, 'songIds' | 'artistId'>, songById: Map<string, Pick<Song, 'qualityTier' | 'artistId'>>) =>
      catalogOnFrontStore(catalog, songById, isVerifiedArtist),
    [isVerifiedArtist],
  );
  // Founding artists carry plain catalog ids; uploaders are 'u-' + their
  // account id and need the mark, same as their songs.
  const artistOnFront = useCallback(
    (artistId: string) => !artistId.startsWith('u-') || isVerifiedArtist(artistId),
    [isVerifiedArtist],
  );
  return { songOnFront, catalogOnFront, artistOnFront, isVerifiedArtist };
}
