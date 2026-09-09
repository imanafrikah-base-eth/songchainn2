import { useQuery } from '@tanstack/react-query';
import { fetchPublishedWorlds } from '@/worlds/loader';
import { WORLDS } from '@/worlds/registry';
import type { WorldConfig } from '@/worlds/types';

const CODE_SLUGS = new Set(WORLDS.map((w) => w.slug));

/** Where a world opens: the hand-written ones under /world, the built ones under /w. */
export function worldPath(world: Pick<WorldConfig, 'slug'>): string {
  return CODE_SLUGS.has(world.slug) ? `/world/${world.slug}` : `/w/${world.slug}`;
}

/**
 * Every world that is open: World #001 from code, then every world an artist
 * has published from the builder, in number order. The code worlds are the
 * placeholder data, so the list is never empty while the fetch runs.
 */
export function usePublishedWorlds() {
  return useQuery<WorldConfig[]>({
    queryKey: ['published-worlds'],
    queryFn: fetchPublishedWorlds,
    placeholderData: [...WORLDS],
    staleTime: 5 * 60 * 1000,
  });
}
