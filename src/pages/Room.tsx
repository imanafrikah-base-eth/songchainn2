import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { usePlayerActions, usePlayerState } from '@/context/PlayerContext';
import { SONGS } from '@/data/musicData';
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

const ROOM_PLAYLIST_SONG_IDS = ['2', '3', '6', '7', '1', '5', '4'];
const LOCAL_MESSAGES_KEY = 'room:local_messages:v1';
const LOCAL_CHAT_CHANNEL = 'room:local_chat:v1';

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
  const { user } = useAuth();
  const { isPlaying, isRoomMode, currentSong } = usePlayerState();
  const { enterRoomMode, exitRoomMode, setVolume, volume, play } = usePlayerActions();

  const playlist = useMemo(() => {
    const byId = new Map(SONGS.map(s => [s.id, s]));
    return ROOM_PLAYLIST_SONG_IDS
      .map(id => byId.get(id))
      .filter((s): s is (typeof SONGS)[number] => Boolean(s));
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

  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!user) return;
    if (playlist.length === 0) return;

    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      if (!isActive) return;
      if (!isPlayingRef.current) setAutoplayBlocked(true);
    }, 1200);

    void enterRoomMode(playlist).then(ok => {
      if (!isActive) return;
      setAutoplayBlocked(!ok);
    });

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
      void exitRoomMode();
    };
  }, [enterRoomMode, exitRoomMode, playlist, user]);

  const loadLocalMessages = useCallback(() => {
    const raw = localStorage.getItem(LOCAL_MESSAGES_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as RoomMessage[];
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(-50);
    } catch {
      return [];
    }
  }, []);

  const persistLocalMessages = useCallback((next: RoomMessage[]) => {
    localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(next.slice(-50)));
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
      } else {
        if (!storedName) setIsNamePromptOpen(true);
      }

      const messagesRes = await (supabase as any)
        .from('room_messages')
        .select('id, user_id, room_name, message, created_at, reply_to_message_id')
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
  }, [loadLocalMessages, user]);

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

  const saveRoomName = useCallback(async () => {
    if (!user) return;
    const normalized = normalizeRoomName(nameDraft);
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
      toast.error('Could not save Room name', { description: error.message });
      return;
    }
  }, [nameDraft, user]);

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
    void enterRoomMode(playlist).then(ok => setAutoplayBlocked(!ok));
  }, [enterRoomMode, playlist]);

  useEffect(() => {
    if (!isRoomMode) return;
    if (autoplayBlocked) return;

    const resume = () => {
      if (!isPlaying) {
        if (currentSong) {
          play();
        } else if (playlist.length > 0) {
          void enterRoomMode(playlist).then(ok => setAutoplayBlocked(!ok));
        }
      }
    };

    window.addEventListener('pointerdown', resume, { passive: true });
    window.addEventListener('keydown', resume);
    window.addEventListener('focus', resume);
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      window.removeEventListener('focus', resume);
    };
  }, [autoplayBlocked, currentSong, enterRoomMode, isPlaying, isRoomMode, play, playlist]);

  const handleVolumeChange = useCallback(([v]: number[]) => {
    setVolume(v / 100);
  }, [setVolume]);

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
              setNameDraft(roomName || '');
              setIsNamePromptOpen(true);
            }}
            className="inline-flex items-center gap-2 text-sm text-zinc-200 hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>{roomName ? roomName : 'Set name'}</span>
          </button>
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
                onChange={e => setDraft(e.target.value)}
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
      <span className="text-zinc-100">{message.room_name}:</span>{' '}
      <span className="text-zinc-300">{message.message}</span>
    </div>
  );
}
