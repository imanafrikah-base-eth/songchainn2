import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * People messaging people.
 *
 * The inbox that existed before this was one thread per person, and the only
 * one on the other end was Mo$ha. That inbox still works and is untouched. This
 * is the other half: real conversations between two listeners, with a song able
 * to ride along inside a message, because on a music app the most natural thing
 * one person sends another is a record.
 *
 * Every write goes through an RPC rather than a raw insert, so a block is
 * enforced on the way in. There is deliberately no client insert grant on any of
 * these tables.
 */

export interface Conversation {
  conversation_id: string;
  other_user_id: string;
  other_name: string;
  other_avatar: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  unread: number;
  is_archived: boolean;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string | null;
  song_id: string | null;
  playlist_id: string | null;
  is_deleted: boolean;
  created_at: string;
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setIsLoading(false);
      return;
    }
    const { data } = await supabase.rpc('list_my_conversations' as never);
    setConversations(((data ?? []) as unknown as Conversation[]).filter((c) => !c.is_archived));
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * One channel for the whole inbox, not one per conversation. A channel per row
   * is how a list page ends up holding twenty websockets open.
   */
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`dm-inbox:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `sender_user_id=neq.${user.id}` }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  const openWith = useCallback(async (otherUserId: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('open_conversation' as never, {
      _other_user_id: otherUserId,
    } as never);
    if (error) return null;
    await load();
    return data as unknown as string;
  }, [load]);

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread || 0), 0);

  return { conversations, isLoading, reload: load, openWith, totalUnread };
}

export function useConversation(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const markedRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setIsLoading(true);
    const { data } = await supabase
      .from('dm_messages' as never)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(300);
    setMessages((data ?? []) as unknown as DirectMessage[]);
    setIsLoading(false);
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Reading a conversation marks it read, once per open. */
  useEffect(() => {
    if (!conversationId || markedRef.current === conversationId) return;
    markedRef.current = conversationId;
    void supabase.rpc('mark_conversation_read' as never, { _conversation_id: conversationId } as never);
  }, [conversationId, messages.length]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`dm:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dm_messages', filter: `conversation_id=eq.${conversationId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, load]);

  const send = useCallback(
    async (body: string, songId?: string | null, playlistId?: string | null) => {
      if (!conversationId || !user) return { ok: false, error: 'Not signed in' };
      const { error } = await supabase.rpc('send_direct_message' as never, {
        _conversation_id: conversationId,
        _body: body || null,
        _song_id: songId ?? null,
        _playlist_id: playlistId ?? null,
      } as never);
      if (error) return { ok: false, error: error.message };
      await load();
      return { ok: true };
    },
    [conversationId, user, load],
  );

  const unsend = useCallback(async (messageId: string) => {
    await supabase.from('dm_messages' as never).update({ is_deleted: true } as never).eq('id', messageId);
    await load();
  }, [load]);

  return { messages, isLoading, send, unsend, reload: load };
}

export async function blockUser(otherUserId: string, blocked = true) {
  await supabase.rpc('block_user' as never, {
    _other_user_id: otherUserId,
    _blocked: blocked,
  } as never);
}

export async function reportMessage(messageId: string, reportedId: string, reason: string) {
  const { data: session } = await supabase.auth.getUser();
  const uid = session?.user?.id;
  if (!uid) return;
  await supabase.from('message_reports' as never).insert({
    reporter_id: uid,
    message_id: messageId,
    reported_id: reportedId,
    reason: reason.slice(0, 500),
  } as never);
}

/** Send a song straight into a conversation with somebody, from anywhere. */
export async function sendSongTo(otherUserId: string, songId: string, note?: string) {
  const { data: convId, error } = await supabase.rpc('open_conversation' as never, {
    _other_user_id: otherUserId,
  } as never);
  if (error || !convId) return { ok: false, error: error?.message ?? 'Could not open the conversation' };
  const { error: sendErr } = await supabase.rpc('send_direct_message' as never, {
    _conversation_id: convId,
    _body: note || null,
    _song_id: songId,
  } as never);
  return sendErr ? { ok: false, error: sendErr.message } : { ok: true };
}
