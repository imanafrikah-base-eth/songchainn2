import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Who counts as an artist in the directories, and who is still audience.
 *
 * An artist_accounts row is NOT the answer. Ticking "I make music" at sign up
 * writes one instantly, so the app was calling somebody an artist before they
 * had a single song, listing them among artists with an empty page behind the
 * name. The founder's rule is the honest one: you are audience until your
 * first record is live, and an artist from that moment on.
 *
 * So this is the intersection of two facts: the account holds an artist page,
 * and that page has at least one record actually out. Scheduled records do not
 * count, because a day that has not arrived is not a release.
 *
 * IMPORTANT. This decides DISPLAY and DIRECTORY PLACEMENT only. It must never
 * gate the Studio or uploading: somebody has to be able to upload the very
 * first song that makes them an artist. Permission stays on `isArtist` from
 * AuthContext; this decides what a page calls them and which tab they sit in.
 */

export interface ArtistDirectory {
  /** user_id of every account that holds an artist page with a live record. */
  releasedUserIds: Set<string>;
  /** user_id to artist_id, for every artist account, released or not. */
  artistIdByUser: Map<string, string>;
  /** Whether this person should be shown as an artist. */
  isReleasedArtist: (userId: string | null | undefined) => boolean;
  /**
   * The answer is actually known. Callers that send somebody somewhere have to
   * wait for this: before it is true everyone looks like audience, and acting
   * on that would bounce a real artist to the wrong page and back.
   */
  ready: boolean;
}

const EMPTY: ArtistDirectory = {
  releasedUserIds: new Set(),
  artistIdByUser: new Map(),
  isReleasedArtist: () => false,
  ready: false,
};

export function useArtistDirectory() {
  const { data, isSuccess } = useQuery({
    queryKey: ['artist-directory'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ArtistDirectory> => {
      const today = new Date().toISOString().slice(0, 10);
      const [accounts, released] = await Promise.all([
        supabase.from('artist_accounts' as never).select('user_id, artist_id'),
        supabase
          .from('songs')
          .select('artist_id')
          .eq('is_published', true)
          .not('artist_id', 'is', null)
          // Same rule the catalogue uses: a record scheduled for a later day
          // is not out yet, so it does not make anybody an artist yet.
          .or(`release_date.is.null,release_date.lte.${today}`),
      ]);

      const artistIdByUser = new Map<string, string>();
      for (const row of (accounts.data ?? []) as Array<{ user_id: string; artist_id: string }>) {
        if (row?.user_id && row?.artist_id) artistIdByUser.set(row.user_id, String(row.artist_id));
      }

      const liveArtistIds = new Set<string>(
        ((released.data ?? []) as Array<{ artist_id: string | null }>)
          .map((r) => (r.artist_id == null ? '' : String(r.artist_id)))
          .filter(Boolean),
      );

      const releasedUserIds = new Set<string>();
      for (const [userId, artistId] of artistIdByUser) {
        if (liveArtistIds.has(artistId)) releasedUserIds.add(userId);
      }

      return {
        releasedUserIds,
        artistIdByUser,
        isReleasedArtist: (userId) => (userId ? releasedUserIds.has(userId) : false),
        ready: true,
      };
    },
  });

  return isSuccess && data ? data : EMPTY;
}

export default useArtistDirectory;
