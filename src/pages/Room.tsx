import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { usePlayerActions, usePlayerState } from '@/context/PlayerContext';
import { ARTISTS, SONGS } from '@/data/musicData';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

type RoomMessage = {
  id: string;
  user_id: string;
  room_name: string;
  message: string;
  created_at: string;
  reply_to_message_id: string | null;
};

const LOCAL_MESSAGES_KEY = 'room:local_messages:v1';
const LOCAL_CHAT_CHANNEL = 'room:local_chat:v1';
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const ROOM_SEGMENT_SECONDS = 180;
const TYPING_IDLE_MS = 1400;
const LOCAL_IDENTITY_KEY = 'room:identity_mode:v1';

const KNOWN_ARTIST_NAMES = new Set(
  ARTISTS.map(a => a.name.trim().toLowerCase()).filter(Boolean)
);

function stripUrls(text: string) {
  const withoutUrls = text.replace(
    /\b(?:https?:\/\/|www\.)\S+\b/gi,
    ''
  );
  return withoutUrls.replace(/\s+/g, ' ').trim();
}

function normalizeRoomName(name: string) {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  return cleaned.slice(0, 20);
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function isMissingTableError(error: unknown) {
  const message = typeof (error as any)?.message === 'string' ? (error as any).message : '';
  return (
    message.includes("Could not find the table 'public.") ||
    message.includes('in the schema cache') ||
    message.includes('does not exist')
  );
}

function makeMessageId() {
  const maybeCrypto = globalThis.crypto as Crypto | undefined;
  if (maybeCrypto && 'randomUUID' in maybeCrypto && typeof maybeCrypto.randomUUID === 'function') {
    return maybeCrypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractMentions(text: string) {
  const matches = text.matchAll(/@([a-z0-9_][a-z0-9_-]{1,19})/gi);
  const names = new Set<string>();
  for (const match of matches) {
    const name = match[1]?.trim();
    if (name) names.add(name);
  }
  return [...names];
}

export default function Room() {
  const navigate = useNavigate();
  const { user, isArtist, artistId } = useAuth();
  const { isPlaying, isRoomMode, currentSong } = usePlayerState();
  const { enterRoomMode, exitRoomMode, setVolume, volume, play } = usePlayerActions();

  const playlist = useMemo(() => {
    return SONGS;
  }, []);

  const [roomName, setRoomName] = useState<string>('');
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);
  const [chatBackend, setChatBackend] = useState<'supabase' | 'local'>('supabase');

  const [isNamePromptOpen, setIsNamePromptOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isIdentityPromptOpen, setIsIdentityPromptOpen] = useState(false);
  const [identityDraft, setIdentityDraft] = useState<'artist' | 'incognito'>('incognito');

  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const isPlayingRef = useRef(false);
  const roomEnterAtRef = useRef<number>(0);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!user) return;
    if (playlist.length === 0) return;

    let isActive = true;
    const nowSeconds = Date.now() / 1000;
    const startIndex = Math.floor(nowSeconds / ROOM_SEGMENT_SECONDS) % playlist.length;
    const startTime = nowSeconds % ROOM_SEGMENT_SECONDS;
    roomEnterAtRef.current = Date.now();

    void enterRoomMode(playlist, { startIndex, startTime }).then(ok => {
      if (!isActive) return;
      setAutoplayBlocked(!ok);
    });

    return () => {
      isActive = false;
      void exitRoomMode();
    };
  }, [enterRoomMode, exitRoomMode, playlist, user]);

  useEffect(() => {
    if (!isRoomMode) return;
    if (autoplayBlocked) return;
    if (!currentSong) return;
    if (isPlaying) return;
    if (roomEnterAtRef.current && Date.now() - roomEnterAtRef.current < 2000) return;
    void play();
  }, [autoplayBlocked, currentSong, isPlaying, isRoomMode, play]);

  const loadLocalMessages = useCallback(() => {
    const raw = localStorage.getItem(LOCAL_MESSAGES_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as RoomMessage[];
      if (!Array.isArray(parsed)) return [];
      const cutoff = Date.now() - ROOM_TTL_MS;
      return parsed
        .filter(m => new Date(m.created_at).getTime() >= cutoff)
        .slice(-50);
    } catch {
      return [];
    }
  }, []);

  const persistLocalMessages = useCallback((next: RoomMessage[]) => {
    const cutoff = Date.now() - ROOM_TTL_MS;
    const trimmed = next
      .filter(m => new Date(m.created_at).getTime() >= cutoff)
      .slice(-50);
    localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(trimmed));
  }, []);

  useEffect(() => {
    if (chatBackend !== 'local') return;
    setMessages(loadLocalMessages());
  }, [chatBackend, loadLocalMessages]);

  useEffect(() => {
    if (chatBackend !== 'local') return;
    const channel = new BroadcastChannel(LOCAL_CHAT_CHANNEL);
    broadcastRef.current = channel;
    channel.onmessage = event => {
      const payload = event.data as { type: 'message'; message: RoomMessage } | undefined;
      if (!payload || payload.type !== 'message') return;
      setMessages(prev => {
        if (prev.some(m => m.id === payload.message.id)) return prev;
        const updated = [...prev, payload.message];
        if (updated.length > 50) updated.shift();
        persistLocalMessages(updated);
        return updated;
      });
    };
    return () => {
      channel.close();
      broadcastRef.current = null;
    };
  }, [chatBackend, persistLocalMessages]);

  useEffect(() => {
    if (!user) return;

    const run = async () => {
      const storedIdentity =
        (localStorage.getItem(`${LOCAL_IDENTITY_KEY}:${user.id}`) as 'artist' | 'incognito' | null) ?? null;
      if (storedIdentity) setIdentityDraft(storedIdentity);
      const storedNameRaw = localStorage.getItem(`room_username:${user.id}`) || '';
      const storedName = storedNameRaw ? normalizeRoomName(storedNameRaw) : '';
      if (storedName) {
        setRoomName(storedName);
        setNameDraft(storedName);
        if (storedName !== storedNameRaw) {
          localStorage.setItem(`room_username:${user.id}`, storedName);
        }
      }

      const profileRes = await (supabase as any)
        .from('room_profiles')
        .select('room_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileRes?.error && isMissingTableError(profileRes.error)) {
        setChatBackend('local');
      }

      const loadedName = profileRes?.data?.room_name as string | undefined;
      if (loadedName) {
        const normalized = normalizeRoomName(loadedName);
        setRoomName(normalized);
        setNameDraft(normalized);
        localStorage.setItem(`room_username:${user.id}`, normalized);
      }

      const resolvedArtistName = isArtist
        ? ARTISTS.find(a => a.id === artistId)?.name ?? null
        : null;

      if (isArtist && resolvedArtistName) {
        if (!storedIdentity) {
          setIdentityDraft('incognito');
          setIsIdentityPromptOpen(true);
          if (!loadedName && !storedName) setIsNamePromptOpen(false);
        } else if (storedIdentity === 'artist') {
          const normalized = normalizeRoomName(resolvedArtistName);
          setRoomName(normalized);
          setNameDraft(normalized);
          localStorage.setItem(`room_username:${user.id}`, normalized);
        } else {
          if (!loadedName && !storedName) setIsNamePromptOpen(true);
        }
      } else {
        if (!loadedName && !storedName) setIsNamePromptOpen(true);
      }

      const cutoffIso = new Date(Date.now() - ROOM_TTL_MS).toISOString();
      const messagesRes = await (supabase as any)
        .from('room_messages')
        .select('id, user_id, room_name, message, created_at, reply_to_message_id')
        .gte('created_at', cutoffIso)
        .order('created_at', { ascending: false })
        .limit(50);

      if (messagesRes?.error) {
        if (isMissingTableError(messagesRes.error)) {
          setChatBackend('local');
          const localMessages = loadLocalMessages();
          setMessages(localMessages);
        } else {
          toast.error('Room chat unavailable', { description: messagesRes.error.message });
          setMessages([]);
        }
      } else {
        const loaded = (messagesRes?.data as RoomMessage[] | undefined) ?? [];
        setMessages(loaded.slice().reverse());
      }
      setTimeout(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      }, 0);
    };

    void run();
  }, [artistId, isArtist, loadLocalMessages, user]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('room-presence', {
      config: {
        presence: { key: user.id },
      },
    });
    presenceChannelRef.current = channel;

    const syncPresence = () => {
      const state = channel.presenceState() as Record<string, Array<{ room_name?: string }>>;
      setOnlineCount(Object.keys(state).length);
    };

    channel.on('presence', { event: 'sync' }, syncPresence);
    channel.on('presence', { event: 'join' }, syncPresence);
    channel.on('presence', { event: 'leave' }, syncPresence);

    channel.on('broadcast', { event: 'typing' }, payload => {
      const data = (payload as any)?.payload as { user_id?: string; room_name?: string; is_typing?: boolean } | undefined;
      const fromUserId = data?.user_id;
      if (!fromUserId || fromUserId === user.id) return;
      const name = normalizeRoomName(data?.room_name || '');
      const label = name ? `@${name}; typing` : 'typing';

      setTypingUsers(prev => {
        const next = prev.filter(x => x !== label);
        if (data?.is_typing) next.push(label);
        return next;
      });
    });

    channel.subscribe(async status => {
      if (status !== 'SUBSCRIBED') return;
      const storedNameRaw = localStorage.getItem(`room_username:${user.id}`) || '';
      const storedName = storedNameRaw ? normalizeRoomName(storedNameRaw) : '';
      const toTrack = normalizeRoomName(roomName || storedName || '');
      await channel.track({ room_name: toTrack || 'Guest' });
      syncPresence();
    });

    const sweepInterval = window.setInterval(() => {
      setTypingUsers(prev => prev.filter(Boolean).slice(-3));
    }, 1000);

    return () => {
      window.clearInterval(sweepInterval);
      typingTimeoutRef.current = null;
      typingSentRef.current = false;
      presenceChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomName, user]);

  useEffect(() => {
    const channel = presenceChannelRef.current;
    if (!channel || !user) return;
    const toTrack = normalizeRoomName(roomName || '');
    void channel.track({ room_name: toTrack || 'Guest' });
  }, [roomName, user]);

  useEffect(() => {
    if (!user) return;
    if (chatBackend !== 'supabase') return;

    const channel = supabase
      .channel('room-messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_messages' },
        payload => {
          const next = payload.new as RoomMessage;
          setMessages(prev => {
            if (prev.some(m => m.id === next.id)) return prev;
            const updated = [...prev, next];
            if (updated.length > 50) updated.shift();
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatBackend, user]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
  }, []);

  const applyRoomName = useCallback(async (nextName: string) => {
    if (!user) return;
    const normalized = normalizeRoomName(nextName);
    if (normalized.length < 2) return;

    localStorage.setItem(`room_username:${user.id}`, normalized);
    setRoomName(normalized);
    setNameDraft(normalized);
    setIsNamePromptOpen(false);

    setIsSavingName(true);
    const { error } = await (supabase as any)
      .from('room_profiles')
      .upsert(
        { user_id: user.id, room_name: normalized, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    setIsSavingName(false);
    if (error) {
      if (isMissingTableError(error)) {
        setChatBackend('local');
        return;
      }
      toast.error('Could not save Room name', { description: error.message });
      return;
    }
  }, [user]);

  const saveRoomName = useCallback(async () => {
    if (!user) return;
    const normalized = normalizeRoomName(nameDraft);
    if (normalized.length < 2) return;

    if ((!isArtist || identityDraft === 'incognito') && KNOWN_ARTIST_NAMES.has(normalized.toLowerCase())) {
      toast.error('That name is reserved for verified artists.');
      return;
    }

    await applyRoomName(normalized);
  }, [applyRoomName, identityDraft, isArtist, nameDraft, user]);

  const applyArtistIdentity = useCallback(async (mode: 'artist' | 'incognito') => {
    if (!user) return;
    if (!isArtist) return;
    const resolvedArtistName = ARTISTS.find(a => a.id === artistId)?.name ?? null;
    if (!resolvedArtistName) return;

    localStorage.setItem(`${LOCAL_IDENTITY_KEY}:${user.id}`, mode);
    setIdentityDraft(mode);
    setIsIdentityPromptOpen(false);

    if (mode === 'artist') {
      await applyRoomName(resolvedArtistName);
      setIsNamePromptOpen(false);
    } else {
      const normalizedArtistName = normalizeRoomName(resolvedArtistName);
      const normalizedCurrent = normalizeRoomName(roomName || '');
      if (!normalizedCurrent || normalizedCurrent === normalizedArtistName) {
        setNameDraft('');
        setIsNamePromptOpen(true);
      }
    }
  }, [applyRoomName, artistId, isArtist, roomName, user]);

  const createMentionNotifications = useCallback(async (cleanedMessage: string) => {
    if (!user) return;
    if (chatBackend !== 'supabase') return;
    const mentions = extractMentions(cleanedMessage);
    if (mentions.length === 0) return;

    const mentionedUserIds = new Set<string>();
    for (const mention of mentions) {
      const res = await (supabase as any)
        .from('room_profiles')
        .select('user_id')
        .ilike('room_name', escapeLikePattern(mention))
        .maybeSingle();

      if (res?.error && isMissingTableError(res.error)) return;
      const mentionedUserId = res?.data?.user_id as string | undefined;
      if (mentionedUserId && mentionedUserId !== user.id) {
        mentionedUserIds.add(mentionedUserId);
      }
    }

    const ids = [...mentionedUserIds];
    if (ids.length === 0) return;

    const insertRes = await (supabase as any).from('notifications').insert(
      ids.map(toUserId => ({
        user_id: toUserId,
        type: 'mention',
        from_user_id: user.id,
        post_id: null,
        message: `${roomName || 'Someone'} mentioned you in The Room: ${cleanedMessage.slice(0, 140)}`,
      }))
    );

    if (insertRes?.error) {
      toast.error('Failed to send mentions', { description: insertRes.error.message });
    }
  }, [chatBackend, roomName, user]);

  const sendMessage = useCallback(async () => {
    if (!user) return;
    if (!roomName) {
      setIsNamePromptOpen(true);
      return;
    }

    const cleaned = stripUrls(draft);
    if (!cleaned) return;

    if (chatBackend === 'local') {
      const newMessage: RoomMessage = {
        id: makeMessageId(),
        user_id: user.id,
        room_name: roomName,
        message: cleaned.slice(0, 280),
        created_at: new Date().toISOString(),
        reply_to_message_id: replyTo?.id ?? null,
      };

      setMessages(prev => {
        const updated = [...prev, newMessage];
        if (updated.length > 50) updated.shift();
        persistLocalMessages(updated);
        return updated;
      });
      broadcastRef.current?.postMessage({ type: 'message', message: newMessage });
      setDraft('');
      setReplyTo(null);
      shouldAutoScrollRef.current = true;
      return;
    }

    setIsSending(true);
    const res = await (supabase as any)
      .from('room_messages')
      .insert({
        user_id: user.id,
        room_name: roomName,
        message: cleaned.slice(0, 280),
        reply_to_message_id: replyTo?.id ?? null,
      })
      .select('id, user_id, room_name, message, created_at, reply_to_message_id')
      .single();

    setIsSending(false);
    if (res?.error) {
      if (isMissingTableError(res.error)) {
        setChatBackend('local');
        const newMessage: RoomMessage = {
          id: makeMessageId(),
          user_id: user.id,
          room_name: roomName,
          message: cleaned.slice(0, 280),
          created_at: new Date().toISOString(),
          reply_to_message_id: replyTo?.id ?? null,
        };
        setMessages(prev => {
          const updated = [...prev, newMessage];
          if (updated.length > 50) updated.shift();
          persistLocalMessages(updated);
          return updated;
        });
        broadcastRef.current?.postMessage({ type: 'message', message: newMessage });
        setDraft('');
        setReplyTo(null);
        shouldAutoScrollRef.current = true;
        return;
      }
      toast.error('Message not sent', { description: res.error.message });
      return;
    }
    const inserted = res?.data as RoomMessage | undefined;
    if (inserted) {
      setMessages(prev => {
        if (prev.some(m => m.id === inserted.id)) return prev;
        const updated = [...prev, inserted];
        if (updated.length > 50) updated.shift();
        return updated;
      });
    }

    setDraft('');
    setReplyTo(null);
    shouldAutoScrollRef.current = true;
    void createMentionNotifications(cleaned);
  }, [chatBackend, createMentionNotifications, draft, persistLocalMessages, replyTo, roomName, user]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage();
  }, [sendMessage]);

  const handleRetryAutoplay = useCallback(() => {
    if (playlist.length === 0) return;
    const nowSeconds = Date.now() / 1000;
    const startIndex = Math.floor(nowSeconds / ROOM_SEGMENT_SECONDS) % playlist.length;
    const startTime = nowSeconds % ROOM_SEGMENT_SECONDS;
    void enterRoomMode(playlist, { startIndex, startTime }).then(ok => setAutoplayBlocked(!ok));
  }, [enterRoomMode, playlist]);

  const handleVolumeChange = useCallback(([v]: number[]) => {
    setVolume(v / 100);
  }, [setVolume]);

  const setTyping = useCallback((nextTyping: boolean) => {
    const channel = presenceChannelRef.current;
    if (!channel || !user) return;
    if (nextTyping && typingSentRef.current) return;

    typingSentRef.current = nextTyping;
    channel
      .send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: user.id, room_name: roomName, is_typing: nextTyping },
      })
      .catch(() => {
        void 0;
      });
  }, [roomName, user]);

  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);

    const shouldType = value.trim().length > 0;
    if (shouldType && autoplayBlocked) handleRetryAutoplay();
    if (shouldType) setTyping(true);
    else setTyping(false);

    typingTimeoutRef.current = window.setTimeout(() => {
      setTyping(false);
    }, TYPING_IDLE_MS);
  }, [autoplayBlocked, handleRetryAutoplay, setTyping]);

  const messageById = useMemo(() => {
    const map = new Map<string, RoomMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <div className="fixed top-0 left-0 right-0 z-20 bg-black/60 backdrop-blur border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-sm text-zinc-200 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Leave Room</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (isArtist) {
                setIsIdentityPromptOpen(true);
                return;
              }
              setNameDraft(roomName || '');
              setIsNamePromptOpen(true);
            }}
            className="inline-flex items-center gap-2 text-sm text-zinc-200 hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>{roomName ? roomName : 'Set name'}</span>
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-2 text-xs text-zinc-400">
          {onlineCount} online
        </div>
      </div>

      <div className="pt-14 pb-24">
        <div
          ref={listRef}
          onScroll={handleListScroll}
          className="max-w-3xl mx-auto px-4 h-[calc(100vh-14rem)] overflow-y-auto"
        >
          <div className="space-y-2 py-4">
            {messages.map(m => {
              const parent = m.reply_to_message_id ? messageById.get(m.reply_to_message_id) : undefined;
              return (
                <SwipeToReplyMessage
                  key={m.id}
                  message={m}
                  parent={parent}
                  onReply={() => setReplyTo(m)}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 bg-black/70 backdrop-blur border-t border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 space-y-2">
          {typingUsers.length > 0 && (
            <div className="text-[11px] text-zinc-500 truncate">
              {typingUsers.join(' • ')}
            </div>
          )}
          {replyTo && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs text-zinc-400">Replying to {replyTo.room_name}</div>
                <div className="text-xs text-zinc-300 truncate">{replyTo.message}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="text-zinc-300 hover:text-zinc-100"
                onClick={() => setReplyTo(null)}
              >
                Cancel
              </Button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="w-28 flex items-center gap-2">
              <span className="text-xs text-zinc-400 w-10">{Math.round(volume * 100)}%</span>
              <Slider value={[volume * 100]} onValueChange={handleVolumeChange} max={100} step={1} />
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
              <input
                value={draft}
                onChange={e => handleDraftChange(e.target.value)}
                placeholder="Say something..."
                className="flex-1 h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-white/20"
                disabled={isSending}
                autoComplete="off"
              />
              <Button
                type="submit"
                className="h-10 px-4 bg-white/10 hover:bg-white/15 text-zinc-100"
                disabled={isSending || !draft.trim()}
              >
                Send
              </Button>
            </form>
          </div>
        </div>
      </div>

      {isNamePromptOpen && (
        <div className="fixed inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-4">
            <div className="space-y-2">
              <div className="text-base font-semibold text-zinc-100">Choose your Room name</div>
              <div className="text-sm text-zinc-400">
                This name only exists inside The Room.
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <input
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                placeholder="2–20 characters"
                className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-white/20"
                autoComplete="off"
              />
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-zinc-300 hover:text-zinc-100"
                  onClick={() => setIsNamePromptOpen(false)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-zinc-300 hover:text-zinc-100"
                  onClick={() => navigate('/')}
                >
                  Leave Room
                </Button>
                <Button
                  type="button"
                  className="bg-white text-black hover:bg-white/90"
                  onClick={() => void saveRoomName()}
                  disabled={isSavingName || normalizeRoomName(nameDraft).length < 2}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isIdentityPromptOpen && isArtist && (
        <div className="fixed inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-4">
            <div className="space-y-2">
              <div className="text-base font-semibold text-zinc-100">Choose your Room identity</div>
              <div className="text-sm text-zinc-400">
                Switch between your verified artist name and incognito.
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer">
                <input
                  type="radio"
                  name="room-identity"
                  value="artist"
                  checked={identityDraft === 'artist'}
                  onChange={() => setIdentityDraft('artist')}
                />
                <span className="flex items-center gap-2">
                  <span className="text-zinc-100">Join as Verified Artist</span>
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                </span>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer">
                <input
                  type="radio"
                  name="room-identity"
                  value="incognito"
                  checked={identityDraft === 'incognito'}
                  onChange={() => setIdentityDraft('incognito')}
                />
                <span className="text-zinc-100">Join as Incognito</span>
              </label>

              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-zinc-300 hover:text-zinc-100"
                  onClick={() => setIsIdentityPromptOpen(false)}
                >
                  Close
                </Button>
                {identityDraft === 'incognito' && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-zinc-300 hover:text-zinc-100"
                    onClick={() => {
                      const resolvedArtistName = ARTISTS.find(a => a.id === artistId)?.name ?? '';
                      const normalizedArtistName = normalizeRoomName(resolvedArtistName);
                      const normalizedCurrent = normalizeRoomName(roomName || '');
                      setNameDraft(
                        normalizedCurrent && normalizedCurrent !== normalizedArtistName ? normalizedCurrent : ''
                      );
                      setIsIdentityPromptOpen(false);
                      setIsNamePromptOpen(true);
                    }}
                  >
                    Edit name
                  </Button>
                )}
                <Button
                  type="button"
                  className="bg-white text-black hover:bg-white/90"
                  onClick={() => void applyArtistIdentity(identityDraft)}
                >
                  Continue
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {autoplayBlocked && (
        <div className="fixed inset-0 z-40 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-4">
            <div className="space-y-2">
              <div className="text-base font-semibold text-zinc-100">Enter The Room</div>
              <div className="text-sm text-zinc-400">
                Tap once to start the Room playlist.
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                className="text-zinc-300 hover:text-zinc-100"
                onClick={() => navigate('/')}
              >
                Leave
              </Button>
              <Button
                type="button"
                className="bg-white text-black hover:bg-white/90"
                onClick={handleRetryAutoplay}
              >
                Start
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SwipeToReplyMessage({
  message,
  parent,
  onReply,
}: {
  message: RoomMessage;
  parent?: RoomMessage;
  onReply: () => void;
}) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const modeRef = useRef<'undecided' | 'swipe' | 'scroll'>('undecided');
  const [offsetX, setOffsetX] = useState(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    modeRef.current = 'undecided';
    setOffsetX(0);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (modeRef.current === 'undecided') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      modeRef.current = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'scroll';
    }

    if (modeRef.current !== 'swipe') return;
    if (dx <= 0) {
      setOffsetX(0);
      return;
    }
    e.preventDefault();
    setOffsetX(Math.min(80, dx));
  }, []);

  const handlePointerUp = useCallback(() => {
    if (modeRef.current === 'swipe' && offsetX >= 60) {
      onReply();
    }
    startRef.current = null;
    modeRef.current = 'undecided';
    setOffsetX(0);
  }, [offsetX, onReply]);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="text-sm leading-relaxed text-zinc-200"
      style={{ transform: offsetX ? `translateX(${offsetX}px)` : undefined, transition: offsetX ? undefined : 'transform 120ms ease-out' }}
    >
      {parent && (
        <div className="mb-1 pl-2 border-l border-white/15 text-xs text-zinc-500 truncate">
          Reply to {parent.room_name}: {parent.message}
        </div>
      )}
      <span className="text-zinc-100 inline-flex items-center gap-1">
        <span>{message.room_name}:</span>
        {KNOWN_ARTIST_NAMES.has(message.room_name.trim().toLowerCase()) && (
          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
        )}
      </span>{' '}
      <span className="text-zinc-300">{message.message}</span>
    </div>
  );
}
