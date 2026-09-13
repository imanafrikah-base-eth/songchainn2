import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Does the signed-in person have a song out on SONGCHAINN?
 *
 * Worlds are for musicians with a song out (founder, 14 Sep 2026): nobody
 * begins a world before their first record is live. The database holds the
 * same line (public.has_live_song, on the worlds insert policy); this is the
 * app reading it, so no build button is ever shown to somebody the server
 * would refuse. A record counts when it is published, released (no release
 * time still ahead) and theirs, by owner or by their artist page.
 */
export function useHasLiveSong(): { hasLiveSong: boolean; isLoading: boolean } {
  const { user, artistId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['has_live_song', user?.id, artistId],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const now = new Date().toISOString();
      const mine = artistId
        ? `owner_id.eq.${user!.id},artist_id.eq.${artistId.replace(/[,()]/g, '')}`
        : `owner_id.eq.${user!.id}`;
      const { count, error } = await supabase
        .from('songs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .eq('is_published', true)
        .or(mine)
        .or(`release_at.is.null,release_at.lte.${now}`);
      if (error) return false;
      return (count ?? 0) > 0;
    },
  });
  return { hasLiveSong: Boolean(data), isLoading: !!user?.id && isLoading };
}
