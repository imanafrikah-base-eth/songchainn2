import { useAuth } from '@/context/AuthContext';
import { getWorldByArtistId } from '@/worlds/registry';
import { useMyWorlds } from '@/worlds/builder/useMyWorlds';

/**
 * Does this artist already have a world, and where is it?
 *
 * One world per artist. A world is theirs when the builder table has one they
 * own OR the app has one built in for their artist id (IMan Afrikah's World
 * #001 lives in src/worlds/registry.ts, not the worlds table). Every "build a
 * world" offer in the app reads this, so nobody who already has a world is
 * ever told to build one: "I am seeing build a world when I have one already".
 */
export function useHasWorld(): { hasWorld: boolean; worldPath: string | null; isLoading: boolean } {
  const { artistId } = useAuth();
  const { data: myWorlds = [], isLoading } = useMyWorlds();
  const builtIn = getWorldByArtistId(artistId ?? undefined);
  if (builtIn) return { hasWorld: true, worldPath: `/world/${builtIn.slug}`, isLoading: false };
  const mine = myWorlds[0];
  if (mine) return { hasWorld: true, worldPath: `/world/${mine.slug}`, isLoading: false };
  return { hasWorld: false, worldPath: null, isLoading };
}
