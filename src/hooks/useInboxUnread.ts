import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * The number on the message icon.
 *
 * A polled count rather than useConversations(), which opens a realtime
 * channel: the header renders on every page, and the inbox page opens its own
 * channel under the same topic. useConversations refreshes this key whenever
 * it reloads, so the badge follows what the inbox shows.
 *
 * It works like the bell: tapping the icon clears the number (mark_inbox_seen),
 * while each conversation keeps its own unread mark until it is opened. Only
 * messages that arrive after that tap bring the number back.
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
      const { data: count, error } = await supabase.rpc('inbox_badge_count' as never);
      return error ? 0 : Number(count ?? 0);
    },
  });
  return data;
}

/** Clears the message icon's number at once, then tells the server. */
export function useMarkInboxSeen(): () => void {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(() => {
    if (!user) return;
    queryClient.setQueryData([INBOX_UNREAD_KEY, user.id], 0);
    void supabase.rpc('mark_inbox_seen' as never).then(() => {
      void queryClient.invalidateQueries({ queryKey: [INBOX_UNREAD_KEY] });
    });
  }, [user, queryClient]);
}
