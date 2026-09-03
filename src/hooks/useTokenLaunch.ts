import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * The official SONGCHAINN launcher, from the app's side.
 *
 * This hook writes what the artist decided. It does not deploy anything, and
 * that is deliberate: a launch signs a real transaction with the artist's own
 * wallet and puts real liquidity on Base. A web page that fires that on a click
 * would be the single most dangerous button in the app.
 *
 * `token_address`, `treasury_address`, `tx_hash` and `deployed_at` are refused
 * by a database trigger if anything but the launcher tries to set them, so a
 * token cannot be claimed live from a browser.
 */

export type LaunchKind = 'artist' | 'song' | 'community' | 'other';
export type LaunchStatus = 'draft' | 'submitted' | 'deployed' | 'failed' | 'cancelled';

export interface TokenLaunch {
  id: string;
  user_id: string;
  artist_id: string | null;
  kind: LaunchKind;
  name: string;
  symbol: string;
  description: string | null;
  image_url: string | null;
  owner_wallet: string | null;
  website_url: string | null;
  twitter_url: string | null;
  farcaster_url: string | null;
  telegram_url: string | null;
  vault_percentage: number;
  vault_days: number;
  initial_market_cap: number;
  status: LaunchStatus;
  token_address: string | null;
  treasury_address: string | null;
  tx_hash: string | null;
  chain: string;
  status_note: string | null;
  deployed_at: string | null;
  created_at: string;
}

const SELECT =
  'id, user_id, artist_id, kind, name, symbol, description, image_url, owner_wallet, ' +
  'website_url, twitter_url, farcaster_url, telegram_url, vault_percentage, vault_days, ' +
  'initial_market_cap, status, token_address, treasury_address, tx_hash, chain, status_note, ' +
  'deployed_at, created_at';

export function useMyLaunches() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['token_launches', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<TokenLaunch[]> => {
      const { data, error } = await supabase
        .from('token_launches' as never)
        .select(SELECT)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TokenLaunch[];
    },
    staleTime: 15_000,
  });
}

/** Everything already on chain. The public record of what this launcher built. */
export function useDeployedLaunches() {
  return useQuery({
    queryKey: ['token_launches_deployed'],
    queryFn: async (): Promise<TokenLaunch[]> => {
      const { data, error } = await supabase
        .from('token_launches' as never)
        .select(SELECT)
        .eq('status', 'deployed')
        .order('deployed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as TokenLaunch[];
    },
    staleTime: 60_000,
  });
}

export function useLaunchActions() {
  const { user, artistId } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['token_launches', user?.id] });

  const create = useMutation({
    mutationFn: async (draft: Partial<TokenLaunch> & { name: string; symbol: string }) => {
      if (!user) throw new Error('Sign in first.');
      const { data, error } = await supabase
        .from('token_launches' as never)
        .insert({
          ...draft,
          symbol: draft.symbol.toUpperCase(),
          user_id: user.id,
          artist_id: draft.artist_id ?? artistId ?? null,
        } as never)
        .select(SELECT)
        .single();
      if (error) throw error;
      return data as unknown as TokenLaunch;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<TokenLaunch> & { id: string }) => {
      const { id, ...fields } = patch;
      if (fields.symbol) fields.symbol = fields.symbol.toUpperCase();
      const { data, error } = await supabase
        .from('token_launches' as never)
        .update(fields as never)
        .eq('id', id)
        .select('id');
      if (error) throw error;
      // A refused row level security update returns no error, it matches
      // nothing. Check rather than show a success toast for a write that never
      // landed.
      if (!data || (data as unknown[]).length === 0) {
        throw new Error('That did not save. A launch can only be edited while it is a draft.');
      }
    },
    onSuccess: invalidate,
  });

  return { create, update };
}
