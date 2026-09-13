import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import type { Conversation } from '@/hooks/useDirectMessages';

/**
 * Unread messages across the inbox, for the header badge.
 *
 * A polled count rather than useConversations(), which opens a realtime
 * channel: the header renders on every page, and the inbox page opens its own
 * channel under the same topic. useConversations refreshes this key whenever
 * it reloads, so the badge follows what the inbox shows.
 */
export const INBOX_UNREAD_KEY = 'inbox-unread';

export function useInboxUnread(): number {
  const { user } = useAuth();
  const { data = 0 } = useQuery({
    queryKey: [INBOX_UNREAD_KEY, user?.id ?? null],
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const uid = user?.id ?? '';
      // People, plus notices from Mo$ha nobody has opened yet.
      const [{ data: rows, error }, { data: thread }] = await Promise.all([
        supabase.rpc('list_my_conversations' as never),
        supabase.from('dm_threads').select('unread_count').eq('user_id', uid).maybeSingle(),
      ]);
      const people = error
        ? 0
        : ((rows ?? []) as unknown as Conversation[])
            .filter((c) => !c.is_archived)
            .reduce((sum, c) => sum + (c.unread || 0), 0);
      return people + Number(thread?.unread_count ?? 0);
    },
  });
  return data;
}
