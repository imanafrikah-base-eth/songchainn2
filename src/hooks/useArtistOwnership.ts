import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Does the signed-in person run an artist page, and are they verified?
 *
 * This is the first time the app can actually answer that. AuthContext has an
 * `isArtist` flag but it is hardcoded to false in every code path, because the
 * table it would have read never existed. Now it does.
 *
 * Someone counts as an artist here if they own a catalog page OR they have
 * released a track through the Studio, so a brand new artist is treated as one
 * from their very first upload rather than only after claiming a page.
 */
export function useArtistOwnership() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['artist-ownership', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const [account, ownSongs] = await Promise.all([
        supabase
          .from('artist_accounts')
          .select('artist_id, is_verified')
          .eq('user_id', user!.id)
          .maybeSingle(),
        supabase
          .from('songs')
          .select('id')
          .eq('owner_id', user!.id)
          .limit(1),
      ]);

      return {
        artistId: (account.data as { artist_id?: string } | null)?.artist_id ?? null,
        isVerified: !!(account.data as { is_verified?: boolean } | null)?.is_verified,
        hasReleases: ((ownSongs.data as unknown[] | null) ?? []).length > 0,
      };
    },
  });

  return {
    artistId: data?.artistId ?? null,
    isVerified: data?.isVerified ?? false,
    hasReleases: data?.hasReleases ?? false,
    isArtist: !!data?.artistId || !!data?.hasReleases,
    isLoading,
  };
}
