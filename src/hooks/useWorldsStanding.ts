import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { WORLDS } from '@/worlds/registry';

/**
 * How many worlds are actually standing, and how many founding places are left.
 *
 * The founding fifty is an offer, and an offer with a number on it has to be
 * counted rather than asserted. "Only 12 places left!" invented in a component
 * is the oldest lie on the internet and a person can smell it, so this reads
 * the real table.
 *
 * WHAT COUNTS AS A PLACE TAKEN: a PUBLISHED world. Not a draft. Somebody who
 * opened the builder and named a thing has not taken a founding place from
 * anyone, and counting drafts would let the number run away from the truth in
 * the direction that flatters us. Published is also the only status a signed
 * out visitor is allowed to read, so the number on the landing page and the
 * number in the app are the same number.
 *
 * The registry worlds (World #001) are added on top: they are standing, they
 * are just not builder-made, so the table has never heard of them.
 */

export const FOUNDING_PLACES = 50;

export interface WorldsStanding {
  /** Worlds a visitor could walk into right now. */
  standing: number;
  /** Founding places still open. Never negative, never above the cap. */
  placesLeft: number;
}

export function useWorldsStanding() {
  return useQuery<WorldsStanding>({
    queryKey: ['worlds-standing'],
    // The number moves when somebody publishes, which is rare. No reason to
    // ask again while a person is reading the page.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('worlds')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published');

      // A failed count must not print a made-up one. Falling back to the
      // registry alone understates it, which is the safe direction to be wrong.
      const built = error ? 0 : (count ?? 0);
      const standing = WORLDS.length + built;

      return {
        standing,
        placesLeft: Math.max(0, Math.min(FOUNDING_PLACES, FOUNDING_PLACES - standing)),
      };
    },
  });
}
