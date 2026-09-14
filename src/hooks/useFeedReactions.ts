import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Emoji reactions on posts and comments (feed_reactions). The heart stays the
 * like it always was; these sit beside it as chips with counts. Taps land on
 * screen straight away and are taken back if the write does not go through.
 */

export type ReactionTarget = 'post' | 'comment';

export interface ReactionSummary {
  counts: Record<string, number>;
  mine: Record<string, boolean>;
}

type ReactionMap = Record<string, ReactionSummary>;

export function useFeedReactions(targetType: ReactionTarget, ids: string[]) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Keyed by the ids themselves, so a new array holding the same posts does not
  // hand out a new toggle and re-render every card.
  const idsKey = [...new Set(ids.filter((id) => id && !id.startsWith('pending-')))].sort().join(',');
  const real = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);
  const queryKey = useMemo(
    () => ['feed_reactions', targetType, real.join(','), user?.id ?? 'guest'],
    [targetType, real, user?.id],
  );

  const { data } = useQuery({
    queryKey,
    enabled: real.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<ReactionMap> => {
      const out: ReactionMap = {};
      for (let i = 0; i < real.length; i += 150) {
        const { data: rows, error } = await supabase
          .from('feed_reactions' as never)
          .select('target_id, emoji, user_id')
          .eq('target_type', targetType)
          .in('target_id', real.slice(i, i + 150));
        if (error) throw error;
        for (const r of (rows ?? []) as unknown as Array<{ target_id: string; emoji: string; user_id: string }>) {
          const s = (out[r.target_id] ??= { counts: {}, mine: {} });
          s.counts[r.emoji] = (s.counts[r.emoji] ?? 0) + 1;
          if (user?.id && r.user_id === user.id) s.mine[r.emoji] = true;
        }
      }
      return out;
    },
  });

  const toggle = useCallback(
    async (targetId: string, emoji: string) => {
      if (!user?.id) {
        toast('Sign in to react');
        return;
      }
      if (!targetId || targetId.startsWith('pending-')) return;
      const before = queryClient.getQueryData<ReactionMap>(queryKey) ?? {};
      const current = before[targetId] ?? { counts: {}, mine: {} };
      const had = Boolean(current.mine[emoji]);
      const mine = { ...current.mine };
      if (had) delete mine[emoji];
      else mine[emoji] = true;
      const next: ReactionSummary = {
        counts: { ...current.counts, [emoji]: Math.max(0, (current.counts[emoji] ?? 0) + (had ? -1 : 1)) },
        mine,
      };
      queryClient.setQueryData<ReactionMap>(queryKey, { ...before, [targetId]: next });

      const { error } = had
        ? await supabase
            .from('feed_reactions' as never)
            .delete()
            .eq('target_type', targetType)
            .eq('target_id', targetId)
            .eq('user_id', user.id)
            .eq('emoji', emoji)
        : await supabase
            .from('feed_reactions' as never)
            .insert({ target_type: targetType, target_id: targetId, user_id: user.id, emoji } as never);
      // A duplicate means it was already there: the screen is right.
      if (error && error.code !== '23505') {
        queryClient.setQueryData<ReactionMap>(queryKey, before);
        toast.error('That reaction did not save');
      }
    },
    [user?.id, queryClient, queryKey, targetType],
  );

  return { reactions: data ?? {}, toggle };
}
