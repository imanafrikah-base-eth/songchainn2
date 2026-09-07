import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Drops: the app's side of an NFT an artist made in their world.
 *
 * Reads and writes the world_nfts table. The chain is the truth about who
 * holds what and how many are left; this table is how the app knows a drop
 * exists, what it costs and where it points. See src/lib/nft.ts for the chain
 * side and supabase/functions/nft-verify for the check that makes a drop live.
 */

export type DropKind = 'song' | 'artwork' | 'content';
export type DropStatus = 'draft' | 'minting' | 'live' | 'paused' | 'failed';
export type DropKeyRing = 'fan' | 'insider' | null;

export interface WorldNft {
  id: string;
  world_slug: string;
  world_id: string | null;
  owner_id: string | null;
  artist_id: string | null;
  kind: DropKind;
  title: string;
  description: string;
  song_id: string | null;
  image_url: string;
  media_url: string | null;
  media_kind: 'audio' | 'video' | 'image' | 'other' | null;
  price_eth: number;
  copies: number | null;
  per_wallet: number | null;
  sale_end: string | null;
  in_marketplace: boolean;
  key_ring: DropKeyRing;
  status: DropStatus;
  chain: string;
  contract_address: string | null;
  token_id: number | null;
  minter_address: string | null;
  contract_version: string | null;
  payout_wallet: string | null;
  tx_hash: string | null;
  metadata_uri: string | null;
  status_note: string | null;
  minted_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT =
  'id, world_slug, world_id, owner_id, artist_id, kind, title, description, song_id, image_url, ' +
  'media_url, media_kind, price_eth, copies, per_wallet, sale_end, in_marketplace, key_ring, status, ' +
  'chain, contract_address, token_id, minter_address, contract_version, payout_wallet, tx_hash, ' +
  'metadata_uri, status_note, minted_at, verified_at, created_at, updated_at';

function rows(data: unknown): WorldNft[] {
  return ((data ?? []) as WorldNft[]).map((r) => ({ ...r, price_eth: Number(r.price_eth ?? 0) }));
}

/** Everything collectable in one world: live and paused drops, newest first. */
export function useWorldDrops(worldSlug: string | undefined) {
  return useQuery({
    queryKey: ['world-drops', worldSlug],
    enabled: isSupabaseConfigured && !!worldSlug,
    staleTime: 30_000,
    queryFn: async (): Promise<WorldNft[]> => {
      const { data, error } = await supabase
        .from('world_nfts')
        .select(SELECT)
        .eq('world_slug', worldSlug!)
        .in('status', ['live', 'paused'])
        .order('created_at', { ascending: false });
      if (error) return [];
      return rows(data);
    },
  });
}

/** The drops artists chose to show outside their world. */
export function useMarketplaceDrops() {
  return useQuery({
    queryKey: ['marketplace-drops'],
    enabled: isSupabaseConfigured,
    staleTime: 60_000,
    queryFn: async (): Promise<WorldNft[]> => {
      const { data, error } = await supabase
        .from('world_nfts')
        .select(SELECT)
        .eq('in_marketplace', true)
        .eq('status', 'live')
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) return [];
      return rows(data);
    },
  });
}

/** Every drop this artist has in a world, drafts included. */
export function useMyDrops(worldSlug: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-drops', worldSlug, user?.id],
    enabled: isSupabaseConfigured && !!worldSlug && !!user?.id,
    staleTime: 10_000,
    queryFn: async (): Promise<WorldNft[]> => {
      const { data, error } = await supabase
        .from('world_nfts')
        .select(SELECT)
        .eq('world_slug', worldSlug!)
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) return [];
      return rows(data);
    },
  });
}

export function useDrop(id: string | undefined) {
  return useQuery({
    queryKey: ['drop', id],
    enabled: isSupabaseConfigured && !!id,
    queryFn: async (): Promise<WorldNft | null> => {
      const { data, error } = await supabase.from('world_nfts').select(SELECT).eq('id', id!).maybeSingle();
      if (error || !data) return null;
      return rows([data])[0];
    },
  });
}

export type DropDraftInput = {
  world_slug: string;
  world_id: string | null;
  artist_id: string | null;
  kind: DropKind;
  title: string;
  description: string;
  song_id: string | null;
  image_url: string;
  media_url: string | null;
  media_kind: WorldNft['media_kind'];
  price_eth: number;
  copies: number | null;
  per_wallet: number | null;
  sale_end: string | null;
  in_marketplace: boolean;
  key_ring: DropKeyRing;
};

export function useDropActions() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const invalidate = (worldSlug?: string) => {
    void qc.invalidateQueries({ queryKey: ['world-drops', worldSlug] });
    void qc.invalidateQueries({ queryKey: ['my-drops', worldSlug] });
    void qc.invalidateQueries({ queryKey: ['marketplace-drops'] });
    void qc.invalidateQueries({ queryKey: ['drop'] });
  };

  const create = useMutation({
    mutationFn: async (input: DropDraftInput): Promise<WorldNft> => {
      if (!user?.id) throw new Error('Sign in first');
      const { data, error } = await supabase
        .from('world_nfts')
        .insert({ ...input, owner_id: user.id, status: 'draft' })
        .select(SELECT)
        .single();
      if (error) throw new Error(friendly(error.message));
      return rows([data])[0];
    },
    onSuccess: (d) => invalidate(d.world_slug),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<WorldNft>): Promise<WorldNft> => {
      const { data, error } = await supabase
        .from('world_nfts')
        .update(patch)
        .eq('id', id)
        .select(SELECT)
        .single();
      if (error) throw new Error(friendly(error.message));
      return rows([data])[0];
    },
    onSuccess: (d) => invalidate(d.world_slug),
  });

  const remove = useMutation({
    mutationFn: async ({ id }: { id: string; world_slug: string }) => {
      const { error } = await supabase.from('world_nfts').delete().eq('id', id);
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: (_d, v) => invalidate(v.world_slug),
  });

  /** Ask the server to read the chain and, if it all checks out, mark it live. */
  const verify = useMutation({
    mutationFn: async ({ id }: { id: string; world_slug: string }) => {
      const { data, error } = await supabase.functions.invoke('nft-verify', { body: { id } });
      if (error) throw new Error('The check could not run. Try again in a moment.');
      const res = data as { ok?: boolean; status?: string; message?: string } | null;
      if (!res?.ok) throw new Error(res?.message ?? 'The chain did not confirm this drop');
      return res;
    },
    onSuccess: (_d, v) => invalidate(v.world_slug),
  });

  return { create, update, remove, verify };
}

function friendly(message: string): string {
  if (/row-level security/i.test(message)) {
    return 'Only the artist who owns this world can make a drop in it.';
  }
  if (/chain has been checked/i.test(message)) return 'A drop goes live once the chain confirms it.';
  return message;
}
