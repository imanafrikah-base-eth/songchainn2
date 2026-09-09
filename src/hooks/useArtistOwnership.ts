import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Does the signed-in person run an artist page, and are they verified?
 *
 * One definition, the same one the server uses: a row in artist_accounts.
 * This hook used to also count "has uploaded a song", which the upload
 * policy and the is_artist() predicate never did, so it could call someone
 * an artist whom the server then refused. Since 7 Sep 2026 an account is
 * granted through Admin > Claims and nothing else.
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
    isArtist: !!data?.artistId,
    isLoading,
  };
}
