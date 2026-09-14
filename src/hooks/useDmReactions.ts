import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Reactions on direct messages, the way the Room does them: one per person per
 * emoji per message, shown as small count chips under the bubble. Only the
 * people in the conversation can see or add them (dm_message_reactions RLS),
 * and a change on either side arrives in real time.
 */

type Row = { message_id: string; user_id: string; emoji: string };

export type DmReactionChip = { emoji: string; count: number; mine: boolean };

export function useDmReactions(conversationId: string | null) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const rowsRef = useRef<Row[]>(rows);
  rowsRef.current = rows;

  const load = useCallback(async () => {
    if (!conversationId) {
      setRows([]);
      return;
    }
    const { data, error } = await supabase
      .from('dm_message_reactions' as never)
      .select('message_id, user_id, emoji')
      .eq('conversation_id', conversationId)
      .limit(3000);
    if (!error) setRows((data ?? []) as unknown as Row[]);
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!conversationId) return;
    let timer: number | undefined;
    const channel = supabase
      .channel(`dm-reactions:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dm_message_reactions', filter: `conversation_id=eq.${conversationId}` },
        () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => void load(), 150);
        },
      )
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, load]);

  const byMessage = useMemo(() => {
    const counts = new Map<string, Map<string, DmReactionChip>>();
    for (const r of rows) {
      let perMessage = counts.get(r.message_id);
      if (!perMessage) {
        perMessage = new Map();
        counts.set(r.message_id, perMessage);
      }
      const chip = perMessage.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
      chip.count += 1;
      if (r.user_id === user?.id) chip.mine = true;
      perMessage.set(r.emoji, chip);
    }
    const out = new Map<string, DmReactionChip[]>();
    for (const [id, perMessage] of counts) out.set(id, [...perMessage.values()].sort((a, b) => b.count - a.count));
    return out;
  }, [rows, user?.id]);

  /** Add the reaction, or take yours back when it is already there. */
  const toggle = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user) return;
      const same = (r: Row) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji;
      const mine = rowsRef.current.some(same);
      setRows((list) => (mine ? list.filter((r) => !same(r)) : [...list, { message_id: messageId, user_id: user.id, emoji }]));
      const { error } = mine
        ? await supabase
            .from('dm_message_reactions' as never)
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', user.id)
            .eq('emoji', emoji)
        : await supabase.from('dm_message_reactions' as never).insert({ message_id: messageId, user_id: user.id, emoji } as never);
      if (error) void load();
    },
    [user, load],
  );

  return { byMessage, toggle };
}
