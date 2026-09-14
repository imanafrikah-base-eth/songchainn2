import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { askMoshaFull } from '@/lib/mosha';
import {
  appendCache,
  byTime,
  getCache,
  loadLatest,
  loadMoshaUnread,
  markMoshaRead,
  mergeTurns,
  toModelTurns,
  type StoredTurn,
} from '@/lib/moshaHistory';
import { INBOX_UNREAD_KEY } from '@/hooks/useInboxUnread';
import { filesOnlyLine, type MoshaAttachment } from '@/lib/moshaAttachments';
import type { MoshaDoOp } from '@/lib/moshaDo';
import type { MoshaFlowName } from '@/components/mosha/MoshaFlows';

/**
 * The line to Mo$ha in the Inbox. It is the SAME conversation as the Mo$ha
 * chat window: one history per person in mosha_messages, written by the
 * mosha-chat function (so a reply here comes from the same brain, with the
 * same memory), plus notices sent through send_mosha_message. A line said in
 * either place shows in both.
 *
 * The welcome is shown when there is nothing yet, and never written down, so
 * it cannot crowd the chat window's own first line.
 */

export type MoshaMessage = {
  id: string;
  sender: 'mosha' | 'user' | 'system';
  text: string;
  created_at: string;
  attachments?: MoshaAttachment[];
  /** A one-tap job Mo$ha offered under this reply. */
  doOp?: MoshaDoOp;
  /** What that job is about: a song, an artist, a playlist name. */
  doArg?: string;
  /** A flow Mo$ha opened under this reply, with the chat's files for release_files. */
  flow?: MoshaFlowName;
  files?: MoshaAttachment[];
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

/** A page Mo$ha pointed at becomes a button under the reply. */
function toMessage(t: StoredTurn, i: number): MoshaMessage {
  const path = t.action?.type === 'go' || t.action?.type === 'choose' ? t.action.path : null;
  const cta = path ? `\nCTA::${t.action?.type === 'choose' ? 'Open the World Builder' : 'Take me there'}::${path}` : '';
  return {
    id: t.id ?? `local-${t.at}-${i}`,
    sender: t.role === 'user' ? 'user' : 'mosha',
    text: `${t.content}${cta}`,
    created_at: t.at,
    attachments: t.attachments,
    doOp: t.action?.type === 'do' ? t.action.op : undefined,
    doArg: t.action?.type === 'do' ? t.action.arg : undefined,
    flow: t.action?.type === 'flow' ? t.action.flow : undefined,
    files: t.action?.type === 'flow' && 'attachments' in t.action ? t.action.attachments : undefined,
  };
}

export function useMoshaThread(userId: string | null) {
  const queryClient = useQueryClient();
  const [turns, setTurns] = useState<StoredTurn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [unread, setUnread] = useState(0);
  const turnsRef = useRef<StoredTurn[]>([]);
  turnsRef.current = turns;
  const busyRef = useRef(false);
  const userRef = useRef(userId);
  userRef.current = userId;
  const seedAt = useRef(new Date().toISOString());

  const reload = useCallback(async () => {
    const who = userId;
    if (!who) {
      setTurns([]);
      setUnread(0);
      setIsLoading(false);
      return;
    }
    const [{ turns: server }, count] = await Promise.all([loadLatest(who), loadMoshaUnread(who)]);
    if (userRef.current !== who) return;
    setUnread(count);
    // Never replace the thread under a question still waiting for its answer.
    if (busyRef.current) return;
    const local = turnsRef.current.length ? turnsRef.current : getCache(who)?.turns ?? [];
    setTurns(mergeTurns(server, local));
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    turnsRef.current = [];
    setTurns([]);
    setIsLoading(true);
    void reload();
  }, [reload]);

  const markRead = useCallback(async () => {
    if (!userId) return;
    setUnread(0);
    await markMoshaRead();
    void queryClient.invalidateQueries({ queryKey: [INBOX_UNREAD_KEY] });
  }, [userId, queryClient]);

  const send = useCallback(
    async (raw: string, attachments: MoshaAttachment[] = []) => {
      // A message that is only files still reads as something said.
      const text = raw.trim() || (attachments.length ? filesOnlyLine(attachments.length) : '');
      // One question at a time: nothing new goes out until Mo$ha has answered.
      if (!text || busyRef.current) return;
      busyRef.current = true;
      setIsSending(true);
      const mine: StoredTurn = {
        role: 'user',
        content: text,
        at: new Date().toISOString(),
        source: 'inbox',
        attachments: attachments.length ? attachments : undefined,
      };
      const next = [...turnsRef.current, mine];
      setTurns(next);
      if (userId) appendCache(userId, [mine]);
      setIsSending(false);
      setAwaitingReply(true);
      try {
        // mosha-chat writes the question and the answer into the one history.
        const { reply, action } = await askMoshaFull(toModelTurns(next), 'inbox', { attachments });
        const answer: StoredTurn = { role: 'assistant', content: reply, at: new Date().toISOString(), action, source: 'inbox' };
        setTurns((prev) => [...prev, answer]);
        if (userId) appendCache(userId, [answer]);
      } finally {
        busyRef.current = false;
        setAwaitingReply(false);
      }
    },
    [userId],
  );

  const messages = useMemo<MoshaMessage[]>(() => {
    if (isLoading) return [];
    if (turns.length === 0) {
      return [{ id: 'seed-mosha', sender: 'mosha', text: MOSHA_SEED_TEXT, created_at: seedAt.current }];
    }
    return [...turns].sort(byTime).map(toMessage);
  }, [turns, isLoading]);

  const last = turns.length ? toMessage([...turns].sort(byTime)[turns.length - 1], turns.length - 1) : null;

  return { messages, last, isLoading, isSending, awaitingReply, send, unread, markRead, reload };
}
