import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * The worlds this artist has already started.
 *
 * Create World opened straight onto "name your world" whether or not you had
 * one, and the only way back into a draft was a ?id= URL nobody was ever given.
 * So an artist who got half way through, closed the tab and came back was
 * offered a brand new world and no sign the first one existed. Their work was
 * still in the database, just unreachable, which is worse than losing it
 * because nothing tells them it is there.
 *
 * Read straight off the table by owner. RLS already restricts this to rows the
 * signed-in person owns or has a role on, so there is no filter here that a
 * client could tamper with.
 */

export interface MyWorld {
  id: string;
  slug: string;
  artist_name: string | null;
  status: string;
  world_number: number | null;
  updated_at: string;
}

export function useMyWorlds() {
  const { user } = useAuth();

  return useQuery<MyWorld[]>({
    queryKey: ['my-worlds', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worlds')
        .select('id, slug, artist_name, status, world_number, updated_at')
        .eq('owner_id', user!.id)
        .order('updated_at', { ascending: false });
      if (error) return [];
      return (data ?? []) as unknown as MyWorld[];
    },
  });
}
