import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { askMosha } from '@/lib/mosha';

/**
 * The line to Mo$ha, lifted out of the Inbox page unchanged so it can sit in the
 * conversation list as a pinned row and render in the shared thread view.
 *
 * Same tables and RPCs as before: ensure_dm_thread, direct_messages,
 * send_mosha_message. The welcome message is persisted on the first ever visit.
 */

export type MoshaMessage = {
  id: string;
  sender: 'mosha' | 'user' | 'system';
  text: string;
  created_at: string;
};

export const MOSHA_SEED_TEXT =
  "Mo$ha here. This is your line to me. I know this place inside out: the records, the artists, the worlds, the battles, the coins, the keys. Ask me anything, however you want to ask it, and I will give it to you straight.";

export type MoshaCta = { label: string; route: string };

export function parseMessageWithCtas(text: string): { content: string; ctas: MoshaCta[] } {
  const ctas: MoshaCta[] = [];
  const contentLines: string[] = [];
  text.split('\n').forEach((line) => {
    const match = line.match(/^CTA::(.+?)::(.+)$/);
    if (match) {
      const label = match[1]?.trim();
      const route = match[2]?.trim();
      if (label && route) ctas.push({ label, route });
      return;
    }
    contentLines.push(line);
  });
  return { content: contentLines.join('\n').trim(), ctas };
}

const byTime = (a: MoshaMessage, b: MoshaMessage) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

export function useMoshaThread(userId: string | null) {
  const [messages, setMessages] = useState<MoshaMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const messagesRef = useRef<MoshaMessage[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    let active = true;
    const seed = (): MoshaMessage[] => [
      { id: 'seed-mosha', sender: 'mosha', text: MOSHA_SEED_TEXT, created_at: new Date().toISOString() },
    ];
    const load = async () => {
      if (!userId) {
        setMessages([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const { data: newThreadId, error: threadError } = await (supabase as any)
        .rpc('ensure_dm_thread', { _user_id: userId });
      if (!active) return;
      if (threadError || !newThreadId) {
        setMessages(seed());
        setIsLoading(false);
        return;
      }
      setThreadId(newThreadId);

      const { data, error } = await (supabase as any)
        .from('direct_messages')
        .select('id,sender_type,message_text,created_at')
        .eq('thread_id', newThreadId)
        .order('created_at', { ascending: true })
        .limit(120);
      if (!active) return;

      if (error) {
        setMessages(seed());
        setIsLoading(false);
        return;
      }

      if (!Array.isArray(data) || data.length === 0) {
        // First-ever visit to this thread -- persist the welcome message for real.
        const { data: seedId } = await (supabase as any)
          .rpc('send_mosha_message', { _user_id: userId, _message_text: MOSHA_SEED_TEXT });
        if (!active) return;
        setMessages([{ ...seed()[0], id: seedId || 'seed-mosha' }]);
        setIsLoading(false);
        return;
      }

      setMessages(
        data.map((row: any) => ({
          id: row.id,
          sender: row.sender_type,
          text: row.message_text,
          created_at: row.created_at,
        })),
      );
      setIsLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, [userId]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      // One question at a time, as before: nothing new goes out until Mo$ha has answered.
      if (!text || isSending || awaitingReply) return;
      setIsSending(true);
      const optimisticId = `${Date.now()}-user`;
      const userMessage: MoshaMessage = {
        id: optimisticId,
        sender: 'user',
        text,
        created_at: new Date().toISOString(),
      };
      const before = [...messagesRef.current].sort(byTime);
      setMessages((prev) => [...prev, userMessage]);

      if (threadId && userId) {
        const { data, error } = await (supabase as any)
          .from('direct_messages')
          .insert({ thread_id: threadId, sender_type: 'user', sender_user_id: userId, message_text: text })
          .select('id,created_at')
          .single();
        if (!error && data) {
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticId ? { ...m, id: data.id, created_at: data.created_at } : m)),
          );
        }
      }
      setIsSending(false);
      setAwaitingReply(true);

      // Mo$ha answers everything, from the real account of the app and what it
      // knows about this person. The thread's last turns go with the question.
      const turns = [...before, userMessage]
        .filter((m) => m.id !== 'seed-mosha')
        .slice(-12)
        .map((m) => ({ role: m.sender === 'user' ? ('user' as const) : ('assistant' as const), content: m.text }));
      try {
        const replyText = await askMosha(turns, 'inbox');
        let replyId: string | null = null;
        if (userId) {
          const { data, error } = await (supabase as any)
            .rpc('send_mosha_message', { _user_id: userId, _message_text: replyText });
          if (!error) replyId = data as string;
        }
        setMessages((prev) => [
          ...prev,
          { id: replyId || `${Date.now()}-mosha`, sender: 'mosha', text: replyText, created_at: new Date().toISOString() },
        ]);
      } finally {
        setAwaitingReply(false);
      }
    },
    [isSending, awaitingReply, threadId, userId],
  );

  const sorted = useMemo(() => [...messages].sort(byTime), [messages]);
  const last = sorted[sorted.length - 1] ?? null;

  return { messages: sorted, last, isLoading, isSending, awaitingReply, send };
}
