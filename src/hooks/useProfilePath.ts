import { artistPath } from '@/lib/slugRoutes';
import { useAuth } from '@/context/AuthContext';
import { useArtistDirectory } from '@/hooks/useArtistDirectory';

/**
 * Where "You" goes.
 *
 * Three places worked this out for themselves and all three said the same
 * thing: an artist_accounts row means send them to their artist page. Ticking
 * "I make music" at sign up writes that row instantly, so somebody who had
 * never uploaded anything tapped You and landed on an empty artist page that
 * was not really theirs yet, with their actual profile nowhere in reach.
 *
 * The rule now matches the rest of the app: you are audience until your first
 * record is live, and the artist page becomes home from that moment.
 *
 * While the directory is still loading this returns the audience profile, and
 * Profile sends a released artist onward once the answer arrives. That cannot
 * loop, because the artist page never sends anybody back.
 */
export function useProfilePath(): string {
  const { isArtist, artistId, user } = useAuth();
  const directory = useArtistDirectory();
  if (isArtist && artistId && directory.ready && directory.isReleasedArtist(user?.id)) {
    return artistPath(artistId);
  }
  return '/profile';
}

export default useProfilePath;
