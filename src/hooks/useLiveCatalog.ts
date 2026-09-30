import { useSyncExternalStore } from 'react';
import { getLiveCatalog, subscribeLiveCatalog, type LiveCatalog } from '@/lib/liveCatalog';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';

/**
 * The whole catalogue, founding and published, for a component that renders
 * from it. Re-renders when a new song or artist arrives.
 */
export function useLiveCatalog(): LiveCatalog {
  return useSyncExternalStore(subscribeLiveCatalog, getLiveCatalog, getLiveCatalog);
}

/**
 * Keeps the live catalogue fed for the whole app, so the player and anything
 * else that reads it outside a component always has the published songs.
 * Mounted once, at the root.
 */
export function LiveCatalogFeed(): null {
  usePublishedCatalog();
  return null;
}
