import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * EPs and albums. A release is a row of its own; songs point at it and carry
 * a track number, so a record can finally be more than a pile of singles.
 */

export type ReleaseKind = 'single' | 'ep' | 'album' | 'mixtape' | 'compilation';

export const RELEASE_KIND_LABEL: Record<ReleaseKind, string> = {
  single: 'Single',
  ep: 'EP',
  album: 'Album',
  mixtape: 'Mixtape',
  compilation: 'Compilation',
};

/**
 * What a kind is stored as when the database does not know it yet. Mixtape and
 * compilation arrive with migration 20260913000500; until it is applied the
 * CHECK on releases.kind refuses them, and the release is kept as an album
 * rather than lost.
 */
const KIND_FALLBACK: Partial<Record<ReleaseKind, ReleaseKind>> = {
  mixtape: 'album',
  compilation: 'album',
};

export interface NewRelease {
  artistId: string;
  ownerId: string;
  title: string;
  kind: ReleaseKind;
  release_date?: string | null;
  description?: string | null;
  upc?: string | null;
  cover_art_url?: string | null;
}

/** Insert one releases row, retrying an unknown kind as its fallback. */
export async function insertRelease(input: NewRelease): Promise<ReleaseGroup> {
  const title = input.title.trim();
  if (!title) throw new Error('A release needs a title.');
  const row = (kind: ReleaseKind) => ({
    artist_id: input.artistId,
    owner_id: input.ownerId,
    title,
    kind,
    release_date: input.release_date || null,
    description: input.description?.trim() || null,
    upc: input.upc?.trim() || null,
    cover_art_url: input.cover_art_url || null,
  });
  let { data, error } = await supabase.from('releases' as never).insert(row(input.kind) as never).select(COLUMNS).single();
  const fallback = KIND_FALLBACK[input.kind];
  if (error && fallback && (error.code === '23514' || /releases_kind_check/.test(error.message ?? ''))) {
    ({ data, error } = await supabase.from('releases' as never).insert(row(fallback) as never).select(COLUMNS).single());
  }
  if (error) throw new Error(error.message || 'The release could not be made. Try again.');
  return data as unknown as ReleaseGroup;
}

export interface ReleaseGroup {
  id: string;
  artist_id: string;
  owner_id: string | null;
  title: string;
  kind: ReleaseKind;
  cover_art_url: string | null;
  release_date: string | null;
  upc: string | null;
  description: string | null;
  created_at: string;
}

const COLUMNS = 'id, artist_id, owner_id, title, kind, cover_art_url, release_date, upc, description, created_at';

/** Every release on one artist page, newest first. Public: anyone can read. */
export function useArtistReleaseGroups(artistId: string | null | undefined) {
  return useQuery({
    queryKey: ['release-groups', artistId],
    enabled: Boolean(artistId) && isSupabaseConfigured,
    staleTime: 30_000,
    queryFn: async (): Promise<ReleaseGroup[]> => {
      const { data, error } = await supabase
        .from('releases' as never)
        .select(COLUMNS)
        .eq('artist_id', artistId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as ReleaseGroup[]);
    },
  });
}

/** Every release in the catalog, for grouping the public store. */
export function useAllReleaseGroups() {
  return useQuery({
    queryKey: ['release-groups', 'all'],
    enabled: isSupabaseConfigured,
    staleTime: 60_000,
    queryFn: async (): Promise<ReleaseGroup[]> => {
      const { data, error } = await supabase
        .from('releases' as never)
        .select(COLUMNS)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as ReleaseGroup[]);
    },
  });
}

export function useReleaseGroupActions(artistId: string | null | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['release-groups'] });
    await queryClient.invalidateQueries({ queryKey: ['published-catalog'] });
  }, [queryClient]);

  const createRelease = useCallback(
    async (input: { title: string; kind: ReleaseKind; release_date?: string | null; description?: string | null; upc?: string | null }) => {
      if (!user || !artistId) throw new Error('Sign in as an artist first.');
      const made = await insertRelease({ ...input, artistId, ownerId: user.id });
      await refresh();
      return made;
    },
    [user, artistId, refresh],
  );

  const updateRelease = useCallback(
    async (id: string, patch: Partial<Pick<ReleaseGroup, 'title' | 'kind' | 'release_date' | 'description' | 'upc' | 'cover_art_url'>>) => {
      const { error } = await supabase.from('releases' as never).update(patch as never).eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [refresh],
  );

  /** Songs on it go back to being singles; nothing is deleted but the grouping. */
  const deleteRelease = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('releases' as never).delete().eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [refresh],
  );

  return { createRelease, updateRelease, deleteRelease };
}
