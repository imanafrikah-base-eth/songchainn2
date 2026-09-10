import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * One person, several logins.
 *
 * A few people are here twice: an email account, a Farcaster auto-login, a
 * page we set up for them. Nothing joined those, so their work sat in
 * whichever login made it. These read what the server knows and let the
 * person decide, from their own side, which login is theirs to keep.
 *
 * Nothing here can be done to a stranger. Saying two logins are the same
 * person takes both sides saying it, unless the founder said it for someone
 * whose second login was made on their behalf.
 */

export interface DuplicateAccount {
  user_id: string;
  display_name: string | null;
  how_they_signed_in: string;
  created_at: string;
  is_verified_artist: boolean;
  worlds: number;
  songs: number;
  media: number;
  /** none, waiting (one side has said so), ready (both have), joined. */
  link_state: 'none' | 'waiting' | 'ready' | 'joined';
  /** True when the OTHER account is the one being kept. */
  is_primary: boolean;
}

export interface OtherWorld {
  id: string;
  slug: string;
  artist_name: string | null;
  status: string;
  created_at: string;
  streets: number;
  richness: number;
  owner_id: string;
}

export function useDuplicateAccounts() {
  const { user } = useAuth();
  return useQuery<DuplicateAccount[]>({
    queryKey: ['duplicate-accounts', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_duplicate_accounts' as never);
      if (error) return [];
      return (data ?? []) as unknown as DuplicateAccount[];
    },
  });
}

/** Worlds standing under this person's other logins. */
export function useOtherWorlds() {
  const { user } = useAuth();
  return useQuery<OtherWorld[]>({
    queryKey: ['other-worlds', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_other_worlds' as never);
      if (error) return [];
      return (data ?? []) as unknown as OtherWorld[];
    },
  });
}

export function useAccountLinkActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['duplicate-accounts', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['other-worlds', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['my-worlds', user?.id] }),
    ]);
  };

  /** "Both of these are me, and this is the one to keep." */
  const claim = useMutation({
    mutationFn: async ({ other, keep }: { other: string; keep: string }) => {
      const { data, error } = await supabase.rpc('claim_account_link' as never, { p_other: other, p_keep: keep } as never);
      if (error) throw error;
      return String(data) as 'waiting' | 'ready' | 'joined';
    },
    onSuccess: refresh,
  });

  /** Bring everything across and retire the spare. Only from the kept side. */
  const apply = useMutation({
    mutationFn: async (other: string) => {
      const { error } = await supabase.rpc('apply_account_link' as never, { p_other: other } as never);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  /** Bring one world across on its own, without folding the whole account. */
  const takeWorld = useMutation({
    mutationFn: async (worldId: string) => {
      if (!user?.id) throw new Error('Sign in first.');
      const { data, error } = await supabase.rpc('transfer_world' as never, { p_world: worldId, p_to: user.id } as never);
      if (error) throw error;
      return String(data);
    },
    onSuccess: refresh,
  });

  return { claim, apply, takeWorld };
}
