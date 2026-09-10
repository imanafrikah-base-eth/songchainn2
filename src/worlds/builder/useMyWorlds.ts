import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
 *
 * An account holds one world from 10 Sep 2026 on. The ones made before that
 * rule are still here, so this also carries the merge: fold the spare into
 * the one being kept, streets and art and all, rather than delete the work.
 */

export interface MyWorld {
  id: string;
  slug: string;
  artist_name: string | null;
  status: string;
  world_number: number | null;
  created_at: string;
  updated_at: string;
  owner_last_entered_at: string | null;
  /** How many streets stand in it. What is built decides what is kept. */
  streets: number;
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
        .select('id, slug, artist_name, status, world_number, created_at, updated_at, owner_last_entered_at, world_streets(count)')
        .eq('owner_id', user!.id)
        .order('updated_at', { ascending: false });
      if (error) return [];
      type Row = Omit<MyWorld, 'streets'> & { world_streets?: Array<{ count: number }> };
      // The fullest world first: when two of them have to become one, what
      // the artist has actually built is what survives.
      return ((data ?? []) as unknown as Row[])
        .map((w) => ({ ...w, streets: w.world_streets?.[0]?.count ?? 0 }))
        .sort((a, b) =>
          (b.status === 'published' ? 1 : 0) - (a.status === 'published' ? 1 : 0)
          || b.streets - a.streets
          || Date.parse(b.updated_at) - Date.parse(a.updated_at),
        ) as MyWorld[];
    },
  });
}

/** Fold one world into another. Both have to be theirs; the server checks. */
export function useMergeWorlds() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keep, merge }: { keep: string; merge: string }) => {
      const { error } = await supabase.rpc('merge_worlds' as never, { p_keep: keep, p_merge: merge } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-worlds', user?.id] });
      await queryClient.invalidateQueries({ queryKey: ['published-worlds'] });
    },
  });
}

/** When the artist last walked into their own world, and when it was made. */
export async function touchWorldEntry(slug: string): Promise<void> {
  try {
    await supabase.rpc('touch_world_entry' as never, { p_slug: slug } as never);
  } catch {
    /* a stamp that does not land changes nothing on screen */
  }
}

/** "8 Sep 2026", and "2 hours ago" for something recent. */
export function whenLabel(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'never';
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
