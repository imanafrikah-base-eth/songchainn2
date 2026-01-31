import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Link2, ListMusic, Settings, Share2, HardDrive } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { usePlayerActions, usePlayerState } from '@/context/PlayerContext';
import { ARTISTS, SONGS } from '@/data/musicData';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';
import { useOfflineAudio } from '@/hooks/useOfflineAudio';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

const QUICK_REACTIONS = ['🔥', '👀', '💯'] as const;
const TEXT_EMOJIS = ['🔥', '👀', '💯', '😂', '😍', '😤', '🤝', '🎧', '🚀', '🫡', '🙏', '⚡'] as const;
const CUSTOM_EMOJI_TOKENS = [':BASED:', ':LFB!:', ':MALAKAS:', ':TWEAKING:'] as const;
const STICKER_EMOJI_TOKENS = new Set([':MALAKAS:', ':TWEAKING:']);

const BASED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><defs><linearGradient id="b" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4cc9ff"/><stop offset="1" stop-color="#1b54ff"/></linearGradient></defs><path d="M36 6c7 10 18 18 18 30 0 11-8 21-18 21S18 47 18 36C18 24 29 16 36 6z" fill="url(#b)"/><path d="M36 18c4 7 10 11 10 19 0 6-4 11-10 11s-10-5-10-11c0-8 6-12 10-19z" fill="#bff2ff" opacity=".35"/><text x="36" y="58" text-anchor="middle" font-size="14" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto" font-weight="900" fill="#ffffff" stroke="#00206e" stroke-width="1.6" paint-order="stroke">BASED</text></svg>`;
const LFB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#ff8a00"/></linearGradient></defs><path d="M36 7c7 10 18 18 18 30 0 11-8 21-18 21S18 48 18 37C18 25 29 17 36 7z" fill="url(#g)"/><path d="M36 19c4 7 10 11 10 19 0 6-4 11-10 11s-10-5-10-11c0-8 6-12 10-19z" fill="#fff3c6" opacity=".4"/><text x="36" y="58" text-anchor="middle" font-size="16" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto" font-weight="900" fill="#1b1400" stroke="#fff2c2" stroke-width="1.4" paint-order="stroke">LFB!</text></svg>`;
const MALAKAS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="72" viewBox="0 0 96 72"><defs><linearGradient id="m1" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#00a3ff"/><stop offset="1" stop-color="#ffffff"/></linearGradient><linearGradient id="m2" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0a2a6a"/><stop offset="1" stop-color="#00a3ff"/></linearGradient></defs><circle cx="48" cy="30" r="22" fill="url(#m2)" opacity=".25"/><circle cx="48" cy="30" r="22" fill="none" stroke="url(#m1)" stroke-width="6"/><circle cx="40" cy="27" r="2.6" fill="#ffffff"/><circle cx="56" cy="27" r="2.6" fill="#ffffff"/><path d="M38 34c3.5 6 16.5 6 20 0" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round"/><text x="48" y="64" text-anchor="middle" font-size="14" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto" font-weight="900" fill="#ffffff" stroke="#0a2a6a" stroke-width="1.6" paint-order="stroke">MALAKAS</text></svg>`;
const TWEAKING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="72" viewBox="0 0 96 72"><defs><linearGradient id="t1" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#00a3ff"/><stop offset="1" stop-color="#ffffff"/></linearGradient><linearGradient id="t2" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#00a3ff"/><stop offset="1" stop-color="#0a2a6a"/></linearGradient></defs><circle cx="48" cy="30" r="22" fill="url(#t2)" opacity=".22"/><circle cx="48" cy="30" r="22" fill="none" stroke="url(#t1)" stroke-width="6"/><path d="M36 16l8-6 8 6" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="48" cy="9" r="3" fill="#ffffff"/><circle cx="40" cy="27" r="2.6" fill="#ffffff"/><circle cx="56" cy="27" r="2.6" fill="#ffffff"/><path d="M38 36c3-3 17-3 20 0" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/><text x="48" y="64" text-anchor="middle" font-size="14" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto" font-weight="900" fill="#ffffff" stroke="#0a2a6a" stroke-width="1.6" paint-order="stroke">TWEAKING</text></svg>`;

const CUSTOM_EMOJI_URI_BY_TOKEN: Record<(typeof CUSTOM_EMOJI_TOKENS)[number], string> = {
  ':BASED:': `data:image/svg+xml;utf8,${encodeURIComponent(BASED_SVG)}`,
  ':LFB!:': `data:image/svg+xml;utf8,${encodeURIComponent(LFB_SVG)}`,
  ':MALAKAS:': `data:image/svg+xml;utf8,${encodeURIComponent(MALAKAS_SVG)}`,
  ':TWEAKING:': `data:image/svg+xml;utf8,${encodeURIComponent(TWEAKING_SVG)}`,
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

function formatCountdownSeconds(totalSeconds: number) {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function renderMessageWithCustomEmojis(text: string, options?: { allowStickers?: boolean }) {
  const allowStickers = options?.allowStickers ?? true;
  const trimmed = text.trim();
  if (allowStickers && STICKER_EMOJI_TOKENS.has(trimmed)) {
    const uri = CUSTOM_EMOJI_URI_BY_TOKEN[trimmed as (typeof CUSTOM_EMOJI_TOKENS)[number]];
    return (
      <img
        src={uri}
        alt={trimmed}
        className="inline-block h-28 w-28 sm:h-32 sm:w-32"
        loading="lazy"
      />
    );
  }
  const tokens = Object.keys(CUSTOM_EMOJI_URI_BY_TOKEN) as Array<keyof typeof CUSTOM_EMOJI_URI_BY_TOKEN>;
  const firstIndex = tokens
    .map(token => ({ token, index: text.indexOf(token) }))
    .filter(x => x.index >= 0)
    .sort((a, b) => a.index - b.index)[0];

  if (!firstIndex) return text;

  const nodes: Array<string | JSX.Element> = [];
  let cursor = 0;
  let key = 0;
  while (cursor < text.length) {
    const next = tokens
      .map(token => ({ token, index: text.indexOf(token, cursor) }))
      .filter(x => x.index >= 0)
      .sort((a, b) => a.index - b.index)[0];

    if (!next) {
      nodes.push(text.slice(cursor));
      break;
    }

    if (next.index > cursor) nodes.push(text.slice(cursor, next.index));
    const uri = CUSTOM_EMOJI_URI_BY_TOKEN[next.token as (typeof CUSTOM_EMOJI_TOKENS)[number]];
    const isSticker = allowStickers && STICKER_EMOJI_TOKENS.has(next.token as (typeof CUSTOM_EMOJI_TOKENS)[number]);
    if (isSticker && nodes.length > 0) {
      nodes.push(<br key={`ce-br-${key++}`} />);
    }
    nodes.push(
      <img
        key={`ce-${key++}`}
        src={uri}
        alt={next.token}
        className={
          isSticker
            ? 'inline-block align-[-4px] h-24 w-24 sm:h-28 sm:w-28'
            : 'inline-block align-[-2px] h-6 w-6 sm:h-7 sm:w-7'
        }
        loading="lazy"
      />
    );
    if (isSticker && next.index + next.token.length < text.length) {
      nodes.push(<br key={`ce-br-${key++}`} />);
    }
    cursor = next.index + next.token.length;
  }

  return nodes;
}

function getMentionTrigger(text: string, cursorIndex: number) {
  const safeCursor = Math.max(0, Math.min(cursorIndex, text.length));
  const beforeCursor = text.slice(0, safeCursor);
  const atIndex = beforeCursor.lastIndexOf('@');
  if (atIndex < 0) return null;
  if (atIndex > 0 && /[a-z0-9_-]/i.test(beforeCursor[atIndex - 1] ?? '')) return null;
  const query = beforeCursor.slice(atIndex + 1);
  if (query.includes(' ') || query.includes('\n') || query.includes('\t')) return null;
  return { atIndex, query };
}

export default function Room() {
  const navigate = useNavigate();
  const { user, isArtist, artistId } = useAuth();
  const { isPlaying, isRoomMode, currentSong, isRoomHidden } = usePlayerState();
  const { enterRoomMode, exitRoomMode, setVolume, volume, play, hideRoom } = usePlayerActions();
  const { isArtistLiked, toggleLikeArtist, isLoading: isAudienceInteractionsLoading } = useAudienceInteractions();

  const playlist = useMemo(() => {
    return SONGS;
  }, []);

  const [roomName, setRoomName] = useState<string>('');
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);
  const [chatBackend, setChatBackend] = useState<'supabase' | 'local'>('supabase');
  const [activeRoomNames, setActiveRoomNames] = useState<string[]>([]);
  const [mentionState, setMentionState] = useState<{ atIndex: number; query: string; activeIndex: number } | null>(null);

  const [isNamePromptOpen, setIsNamePromptOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isIdentityPromptOpen, setIsIdentityPromptOpen] = useState(false);
  const [identityDraft, setIdentityDraft] = useState<'artist' | 'incognito'>('incognito');

  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [viewingCount, setViewingCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [segmentNowMs, setSegmentNowMs] = useState(() => Date.now());
  const [reactionsByMessageId, setReactionsByMessageId] = useState<Record<string, Record<string, number>>>({});
  const [myReactionsByMessageId, setMyReactionsByMessageId] = useState<Record<string, Record<string, boolean>>>({});
  const [roomPulseSummary, setRoomPulseSummary] = useState<{ count: number } | null>(null);
  const { isSongCached } = useOfflineAudio();

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const draftRef = useRef('');
  const lastCursorRef = useRef(0);
  const shouldAutoScrollRef = useRef(true);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const isPlayingRef = useRef(false);
  const roomEnterAtRef = useRef<number>(0);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);
  const beepCtxRef = useRef<AudioContext | null>(null);
  const beepUnlockedRef = useRef(false);
  const lastBeepAtRef = useRef(0);
  const pulseBannerTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const unlockBeep = useCallback(async () => {
    if (beepUnlockedRef.current) return;
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = beepCtxRef.current ?? new Ctx();
      beepCtxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
      beepUnlockedRef.current = true;
    } catch {
      void 0;
    }
  }, []);

  const playBeep = useCallback(async () => {
    const now = Date.now();
    if (now - lastBeepAtRef.current < 350) return;
    lastBeepAtRef.current = now;
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = beepCtxRef.current ?? new Ctx();
      beepCtxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      const start = ctx.currentTime;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      gain.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(980, start);
      osc.frequency.linearRampToValueAtTime(780, start + 0.12);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + 0.13);
    } catch {
      void 0;
    }
  }, []);

  const broadcastRoomMessage = useCallback((message: RoomMessage) => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    channel
      .send({
        type: 'broadcast',
        event: 'message',
        payload: message,
      })
      .catch(() => {
        void 0;
      });
  }, []);

  const broadcastRoomReaction = useCallback((reaction: { message_id: string; emoji: string; delta: number; user_id: string }) => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    channel
      .send({
        type: 'broadcast',
        event: 'reaction',
        payload: reaction,
      })
      .catch(() => {
        void 0;
      });
  }, []);

  const applyReactionDelta = useCallback((messageId: string, emoji: string, delta: number) => {
    setReactionsByMessageId(prev => {
      const existing = prev[messageId] ?? {};
      const nextCount = Math.max(0, (existing[emoji] ?? 0) + delta);
      return {
        ...prev,
        [messageId]: {
          ...existing,
          [emoji]: nextCount,
        },
      };
    });
  }, []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!roomName) return;
    const channel = supabase
      .channel(`room-pulses-${roomName}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'song_analytics' },
        payload => {
          const row = (payload as any)?.new as { event_type?: string; song_id?: string } | undefined;
          if (!row || row.event_type !== 'pulse') return;
          if (!currentSong || row.song_id !== currentSong.id) return;
          setRoomPulseSummary(prev => {
            if (!prev) {
              return { count: 1 };
            }
            return { count: prev.count + 1 };
          });
          if (pulseBannerTimeoutRef.current) {
            window.clearTimeout(pulseBannerTimeoutRef.current);
          }
          pulseBannerTimeoutRef.current = window.setTimeout(() => {
            setRoomPulseSummary(null);
          }, 4000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (pulseBannerTimeoutRef.current) {
        window.clearTimeout(pulseBannerTimeoutRef.current);
        pulseBannerTimeoutRef.current = null;
      }
    };
  }, [currentSong, roomName]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSegmentNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (playlist.length === 0) return;
    if (isRoomMode) return;

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
    };
  }, [enterRoomMode, isRoomMode, playlist, user]);

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
      const payload = event.data as
        | { type: 'message'; message: RoomMessage }
        | { type: 'reaction'; reaction: { message_id: string; emoji: string; delta: number; user_id: string } }
        | undefined;
      if (!payload) return;
      if (payload.type === 'message') {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.message.id)) return prev;
          const updated = [...prev, payload.message];
          if (updated.length > 50) updated.shift();
          persistLocalMessages(updated);
          return updated;
        });
        return;
      }
      if (payload.type === 'reaction') {
        applyReactionDelta(payload.reaction.message_id, payload.reaction.emoji, payload.reaction.delta);
      }
    };
    return () => {
      channel.close();
      broadcastRef.current = null;
    };
  }, [applyReactionDelta, chatBackend, persistLocalMessages]);

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
      const state = channel.presenceState() as Record<string, Array<{ room_name?: string; in_room?: boolean; viewing?: boolean }>>;
      let listeningCount = 0;
      let activeViewingCount = 0;
      const names = new Set<string>();
      for (const metas of Object.values(state)) {
        if (!Array.isArray(metas)) continue;
        const isListening = metas.some(m => Boolean(m?.in_room));
        const isViewing = metas.some(m => Boolean((m as any)?.viewing));
        if (isListening) listeningCount += 1;
        if (isViewing) activeViewingCount += 1;
        for (const meta of metas) {
          const name = normalizeRoomName(meta?.room_name || '');
          if (name && name.toLowerCase() !== 'guest') names.add(name);
        }
      }
      setOnlineCount(listeningCount);
      setViewingCount(activeViewingCount);
      setActiveRoomNames([...names].sort((a, b) => a.localeCompare(b)).slice(0, 40));
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

    channel.on('broadcast', { event: 'message' }, payload => {
      const next = (payload as any)?.payload as RoomMessage | undefined;
      if (!next?.id) return;
      setMessages(prev => {
        if (prev.some(m => m.id === next.id)) return prev;
        const updated = [...prev, next];
        if (updated.length > 50) updated.shift();
        if (chatBackend === 'local') persistLocalMessages(updated);
        return updated;
      });
      if (next.user_id !== user.id && document.visibilityState === 'visible') {
        void playBeep();
      }
    });

    channel.on('broadcast', { event: 'reaction' }, payload => {
      const data = (payload as any)?.payload as { message_id?: string; emoji?: string; delta?: number; user_id?: string } | undefined;
      const messageId = data?.message_id;
      const emoji = typeof data?.emoji === 'string' ? data.emoji : '';
      const delta = typeof data?.delta === 'number' && Number.isFinite(data.delta) ? data.delta : 0;
      if (!messageId || !emoji || !delta) return;
      applyReactionDelta(messageId, emoji, delta);
    });

    channel.subscribe(async status => {
      if (status !== 'SUBSCRIBED') return;
      const storedNameRaw = localStorage.getItem(`room_username:${user.id}`) || '';
      const storedName = storedNameRaw ? normalizeRoomName(storedNameRaw) : '';
      const toTrack = normalizeRoomName(roomName || storedName || '');
      await channel.track({ room_name: toTrack || 'Guest', in_room: true, viewing: true });
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
  }, [applyReactionDelta, chatBackend, persistLocalMessages, playBeep, roomName, user]);

  const mergeRecentMessages = useCallback((incoming: RoomMessage[]) => {
    setMessages(prev => {
      const byId = new Map<string, RoomMessage>();
      for (const m of prev) byId.set(m.id, m);
      for (const m of incoming) byId.set(m.id, m);
      const merged = [...byId.values()]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(-50);
      return merged;
    });
  }, []);

  const fetchRecentMessages = useCallback(async () => {
    const cutoffIso = new Date(Date.now() - ROOM_TTL_MS).toISOString();
    const messagesRes = await (supabase as any)
      .from('room_messages')
      .select('id, user_id, room_name, message, created_at, reply_to_message_id')
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false })
      .limit(50);
    if (messagesRes?.error) return;
    const loaded = (messagesRes?.data as RoomMessage[] | undefined) ?? [];
    mergeRecentMessages(loaded);
  }, [mergeRecentMessages]);

  useEffect(() => {
    if (!user) return;
    if (chatBackend !== 'supabase') return;

    let isActive = true;

    const tick = () => {
      if (!isActive) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void fetchRecentMessages();
    };

    const interval = window.setInterval(tick, 2000);
    const onFocus = () => tick();
    const onVisibility = () => tick();

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    tick();

    return () => {
      isActive = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [chatBackend, fetchRecentMessages, user]);

  useEffect(() => {
    const channel = presenceChannelRef.current;
    if (!channel || !user) return;
    const toTrack = normalizeRoomName(roomName || '');
    void channel.track({ room_name: toTrack || 'Guest', in_room: true, viewing: true });
  }, [roomName, user]);

  useEffect(() => {
    if (!user) return;
    if (chatBackend !== 'supabase') return;

    const channel = supabase.channel('room-messages-realtime');

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'room_messages' }, payload => {
      const eventType = (payload as any)?.eventType as string | undefined;
      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        const next = (payload as any)?.new as RoomMessage | undefined;
        if (!next?.id) return;
        mergeRecentMessages([next]);
        if (next.user_id !== user.id && document.visibilityState === 'visible') {
          void playBeep();
        }
        return;
      }
      if (eventType === 'DELETE') {
        const deletedId = (payload as any)?.old?.id as string | undefined;
        if (!deletedId) return;
        setMessages(prev => prev.filter(m => m.id !== deletedId));
      }
    });

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        void fetchRecentMessages();
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        void fetchRecentMessages();
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatBackend, fetchRecentMessages, mergeRecentMessages, playBeep, user]);

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
      broadcastRoomMessage(newMessage);
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
        broadcastRoomMessage(newMessage);
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
      broadcastRoomMessage(inserted);
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
  }, [broadcastRoomMessage, chatBackend, createMentionNotifications, draft, persistLocalMessages, replyTo, roomName, user]);

  const toggleQuickReaction = useCallback((messageId: string, emoji: string) => {
    if (!user) return;
    const already = Boolean(myReactionsByMessageId[messageId]?.[emoji]);
    const delta = already ? -1 : 1;

    setMyReactionsByMessageId(prev => {
      const existing = prev[messageId] ?? {};
      return {
        ...prev,
        [messageId]: {
          ...existing,
          [emoji]: !already,
        },
      };
    });

    applyReactionDelta(messageId, emoji, delta);

    const payload = { message_id: messageId, emoji, delta, user_id: user.id };
    broadcastRoomReaction(payload);
    if (chatBackend === 'local') {
      broadcastRef.current?.postMessage({ type: 'reaction', reaction: payload });
    }
  }, [applyReactionDelta, broadcastRoomReaction, chatBackend, myReactionsByMessageId, user]);

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

  const insertTextAtCursor = useCallback((textToInsert: string) => {
    const input = inputRef.current;
    const draftValue = draftRef.current;
    const cursor = input?.selectionStart ?? lastCursorRef.current ?? draftValue.length;
    const safeCursor = Math.max(0, Math.min(cursor, draftValue.length));
    const nextValue = `${draftValue.slice(0, safeCursor)}${textToInsert}${draftValue.slice(safeCursor)}`;
    const nextCursor = safeCursor + textToInsert.length;

    setDraft(nextValue);
    setMentionState(null);

    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      try {
        el.setSelectionRange(nextCursor, nextCursor);
      } catch {
        void 0;
      }
      lastCursorRef.current = nextCursor;
    });
  }, []);

  const applyMentionSuggestion = useCallback((name: string) => {
    const input = inputRef.current;
    const draftValue = draftRef.current;
    const cursor = input?.selectionStart ?? lastCursorRef.current ?? draftValue.length;
    const trigger = getMentionTrigger(draftValue, cursor);
    if (!trigger) return;

    const before = draftValue.slice(0, trigger.atIndex + 1);
    const after = draftValue.slice(cursor);
    const nextValue = `${before}${name} ${after}`;
    const nextCursor = before.length + name.length + 1;

    setDraft(nextValue);
    setMentionState(null);

    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      try {
        el.setSelectionRange(nextCursor, nextCursor);
      } catch {
        void 0;
      }
      lastCursorRef.current = nextCursor;
    });
  }, []);

  const handleDraftChange = useCallback((value: string, cursorIndex: number) => {
    lastCursorRef.current = cursorIndex;
    setDraft(value);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);

    const shouldType = value.trim().length > 0;
    if (shouldType && autoplayBlocked) handleRetryAutoplay();
    if (shouldType) setTyping(true);
    else setTyping(false);

    const trigger = getMentionTrigger(value, cursorIndex);
    if (!trigger) {
      setMentionState(null);
    } else {
      setMentionState(prev => {
        const nextQuery = trigger.query;
        const keepIndex = prev?.query === nextQuery ? prev.activeIndex : 0;
        return { atIndex: trigger.atIndex, query: nextQuery, activeIndex: keepIndex };
      });
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      setTyping(false);
    }, TYPING_IDLE_MS);
  }, [autoplayBlocked, handleRetryAutoplay, setTyping]);

  const mentionSuggestions = useMemo(() => {
    if (!mentionState) return [];
    const q = mentionState.query.trim().toLowerCase();
    const normalized = activeRoomNames
      .map(n => normalizeRoomName(n))
      .filter(Boolean);
    const uniq = Array.from(new Set(normalized));
    const matches = q.length === 0
      ? uniq
      : uniq.filter(n => n.toLowerCase().startsWith(q));
    return matches.slice(0, 7);
  }, [activeRoomNames, mentionState]);

  const messageById = useMemo(() => {
    const map = new Map<string, RoomMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const currentPlaylistIndex = useMemo(() => {
    if (!currentSong) return -1;
    return playlist.findIndex(s => s.id === currentSong.id);
  }, [currentSong, playlist]);

  const upNextSongs = useMemo(() => {
    if (playlist.length === 0) return [];
    if (currentPlaylistIndex < 0) return playlist.slice(0, 6);
    const after = playlist.slice(currentPlaylistIndex + 1);
    const before = playlist.slice(0, currentPlaylistIndex + 1);
    return [...after, ...before].slice(0, 6);
  }, [currentPlaylistIndex, playlist]);

  const currentArtist = useMemo(() => {
    if (!currentSong?.artistId) return null;
    return ARTISTS.find(a => a.id === currentSong.artistId) ?? null;
  }, [currentSong?.artistId]);

  const isCurrentArtistFollowed = useMemo(() => {
    if (!currentArtist?.id) return false;
    return isArtistLiked(currentArtist.id);
  }, [currentArtist?.id, isArtistLiked]);

  const segmentProgress = useMemo(() => {
    const nowSeconds = segmentNowMs / 1000;
    const elapsed = nowSeconds % ROOM_SEGMENT_SECONDS;
    const remaining = ROOM_SEGMENT_SECONDS - elapsed;
    return {
      elapsed,
      remaining,
      progress: ROOM_SEGMENT_SECONDS > 0 ? elapsed / ROOM_SEGMENT_SECONDS : 0,
    };
  }, [segmentNowMs]);

  useEffect(() => {
    return () => {
      if (!isRoomHidden) {
        void exitRoomMode();
      }
    };
  }, [exitRoomMode, isRoomHidden]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <div className="sticky top-0 z-20 bg-black/60 backdrop-blur border-b border-white/10">
        <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  hideRoom();
                  navigate('/');
                }}
                className="inline-flex items-center gap-2 text-sm text-zinc-200 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Hide Room</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await exitRoomMode();
                  navigate('/');
                }}
                className="inline-flex sm:hidden items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors"
              >
                <span>Leave Room</span>
              </button>
            </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                await exitRoomMode();
                navigate('/');
              }}
              className="hidden sm:inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors"
            >
              <span>Leave Room</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                const url = `${window.location.origin}/room`;
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success('Invite link copied');
                } catch {
                  toast.error('Could not copy invite link');
                }
              }}
              className="inline-flex items-center gap-2 text-sm text-zinc-200 hover:text-white transition-colors"
            >
              <Link2 className="w-4 h-4" />
              <span>Invite</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!currentSong) return;
                const songUrl = `${window.location.origin}/song/${currentSong.id}`;
                const roomUrl = `${window.location.origin}/room`;
                try {
                  await navigator.clipboard.writeText(`${songUrl}\n${roomUrl}`);
                  toast.success('Song link copied');
                } catch {
                  toast.error('Could not copy song link');
                }
              }}
              className="inline-flex items-center gap-2 text-sm text-zinc-200 hover:text-white transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Share song</span>
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
        </div>
        <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 pb-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Live room</span>
              </span>
              <span className="hidden sm:inline text-zinc-500">
                One shared playlist for everyone in here.
              </span>
            </div>
            <div className="text-zinc-400">
              <span>{onlineCount} listening</span>
              {viewingCount > 0 && (
                <span className="ml-2 text-zinc-500">• {viewingCount} viewing</span>
              )}
            </div>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (!currentSong) return;
              navigate(`/song/${currentSong.id}`);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              if (!currentSong) return;
              e.preventDefault();
              navigate(`/song/${currentSong.id}`);
            }}
            className="relative w-full flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10 transition-colors overflow-hidden"
          >
            <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-white/10">
              <div
                className="h-full bg-primary/80"
                style={{ width: `${Math.min(100, Math.max(0, segmentProgress.progress * 100))}%` }}
              />
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/10 overflow-hidden flex-shrink-0">
              {currentSong?.coverImage ? (
                <img
                  src={currentSong.coverImage}
                  alt={currentSong.title}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span>Now playing in The Room</span>
                </span>
                <span className="text-zinc-500 truncate">
                  {onlineCount > 0 ? `${onlineCount} listening together` : 'Be the first to listen'}
                </span>
              </div>
              <div className="text-sm text-zinc-100 truncate">
                {currentSong ? currentSong.title : 'Syncing playlist…'}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400 min-w-0">
                {currentArtist ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/15 transition-colors px-2 py-0.5 max-w-full"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/artist/${currentArtist.id}`);
                    }}
                  >
                    <span className="truncate">{currentSong?.artist}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  </button>
                ) : (
                  <div className="truncate">
                    {currentSong ? currentSong.artist : 'The playlist starts when you enter'}
                  </div>
                )}
                <div className="text-zinc-500">•</div>
                <div className="flex-shrink-0 tabular-nums text-zinc-400">
                  Next in {formatCountdownSeconds(segmentProgress.remaining)}
                </div>
                {roomPulseSummary && (
                  <>
                    <div className="text-zinc-500">•</div>
                    <div className="flex-shrink-0 tabular-nums text-rose-400">
                      ❤️‍🔥 {roomPulseSummary.count}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-9 px-3 text-zinc-300 hover:text-zinc-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate('/');
                }}
              >
                <span className="text-xs sm:text-sm">Invite friends from Home</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4 pb-24">
        <div className="max-w-3xl lg:max-w-5xl mx-auto px-4">
          <div className="lg:flex lg:gap-6">
            <div
              ref={listRef}
              onScroll={handleListScroll}
              className="h-[calc(100vh-14rem)] overflow-y-auto lg:flex-1"
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
                      reactions={reactionsByMessageId[m.id]}
                      myReactions={myReactionsByMessageId[m.id]}
                      onReact={(emoji) => toggleQuickReaction(m.id, emoji)}
                    />
                  );
                })}
              </div>
            </div>

            <aside className="hidden lg:flex lg:flex-col lg:w-80 lg:h-[calc(100vh-14rem)] lg:py-4 lg:gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <span>Now playing</span>
                  {currentSong && isSongCached(currentSong.id) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5">
                      <HardDrive className="w-3 h-3" />
                      <span>Saved offline</span>
                    </span>
                  )}
                </div>
                {currentSong ? (
                  <div className="mt-3 flex gap-3">
                    <div className="w-12 h-12 rounded-lg bg-white/10 overflow-hidden flex-shrink-0">
                      {currentSong.coverImage ? (
                        <img
                          src={currentSong.coverImage}
                          alt={currentSong.title}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-zinc-100 truncate">{currentSong.title}</div>
                      <div className="text-xs text-zinc-400 truncate">{currentSong.artist}</div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-zinc-400">Loading…</div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 min-h-0 flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-zinc-400">Up next</div>
                  <div className="text-xs text-zinc-500">{onlineCount} online</div>
                </div>
                <div className="mt-3 space-y-2 overflow-y-auto pr-1">
                  {upNextSongs.map(song => (
                    <div key={song.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div className="w-9 h-9 rounded-lg bg-white/10 overflow-hidden flex-shrink-0">
                        {song.coverImage ? (
                          <img
                            src={song.coverImage}
                            alt={song.title}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-zinc-100 truncate">{song.title}</div>
                        <div className="text-xs text-zinc-400 truncate">{song.artist}</div>
                      </div>
                    </div>
                  ))}
                  {upNextSongs.length === 0 ? (
                    <div className="text-sm text-zinc-400">Queue unavailable.</div>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 bg-black/70 backdrop-blur border-t border-white/10">
        <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-3 space-y-2">
          {typingUsers.length > 0 && (
            <div className="text-[11px] text-zinc-500 truncate">
              {typingUsers.join(' • ')}
            </div>
          )}
          {!replyTo && (
            <div className="text-[11px] text-zinc-600 truncate">
              Slide a message to reply
            </div>
          )}
          {replyTo && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs text-zinc-400">Replying to {replyTo.room_name}</div>
                <div className="text-xs text-zinc-300 truncate">{renderMessageWithCustomEmojis(replyTo.message)}</div>
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
              <div className="relative flex-1">
                {mentionState && mentionSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 bottom-12 z-30 rounded-xl border border-white/10 bg-zinc-950/95 backdrop-blur p-1 shadow-lg">
                    {mentionSuggestions.map((name, idx) => (
                      <button
                        key={name}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                        }}
                        onClick={() => applyMentionSuggestion(name)}
                        className={[
                          'w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                          idx === mentionState.activeIndex ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-zinc-200',
                        ].join(' ')}
                      >
                        <span className="truncate">@{name}</span>
                        <span className="text-xs text-zinc-500">Mention</span>
                      </button>
                    ))}
                  </div>
                )}
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={e => handleDraftChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                  onClick={(e) => {
                    lastCursorRef.current = e.currentTarget.selectionStart ?? e.currentTarget.value.length;
                  }}
                  onKeyUp={(e) => {
                    lastCursorRef.current = e.currentTarget.selectionStart ?? e.currentTarget.value.length;
                  }}
                  onKeyDown={(e) => {
                    if (!mentionState || mentionSuggestions.length === 0) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setMentionState(prev => {
                        if (!prev) return prev;
                        return { ...prev, activeIndex: (prev.activeIndex + 1) % mentionSuggestions.length };
                      });
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setMentionState(prev => {
                        if (!prev) return prev;
                        return { ...prev, activeIndex: (prev.activeIndex - 1 + mentionSuggestions.length) % mentionSuggestions.length };
                      });
                      return;
                    }
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      const name = mentionSuggestions[mentionState.activeIndex];
                      if (!name) return;
                      e.preventDefault();
                      applyMentionSuggestion(name);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setMentionState(null);
                    }
                  }}
                  onFocus={() => void unlockBeep()}
                  onPointerDown={() => void unlockBeep()}
                  placeholder="Say something..."
                  className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-white/20"
                  disabled={isSending}
                  autoComplete="off"
                />
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 w-10 p-0 bg-white/5 hover:bg-white/10 text-zinc-200"
                    onClick={() => {
                      lastCursorRef.current = inputRef.current?.selectionStart ?? draftRef.current.length;
                    }}
                  >
                    🙂
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3 bg-zinc-950 border-white/10 text-zinc-100">
                  <div className="grid grid-cols-6 gap-2">
                    {TEXT_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="h-10 w-10 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-xl"
                        onClick={() => insertTextAtCursor(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                    {(CUSTOM_EMOJI_TOKENS as readonly string[]).map((token) => (
                      <button
                        key={token}
                        type="button"
                        className="h-10 w-10 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
                        onClick={() => insertTextAtCursor(` ${token} `)}
                      >
                        <img
                          src={CUSTOM_EMOJI_URI_BY_TOKEN[token as (typeof CUSTOM_EMOJI_TOKENS)[number]]}
                          alt={token}
                          className="h-7 w-7"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

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
  reactions,
  myReactions,
  onReact,
}: {
  message: RoomMessage;
  parent?: RoomMessage;
  onReply: () => void;
  reactions?: Record<string, number>;
  myReactions?: Record<string, boolean>;
  onReact: (emoji: string) => void;
}) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const modeRef = useRef<'undecided' | 'swipe' | 'scroll'>('undecided');
  const pointerTypeRef = useRef<string | null>(null);
  const didCaptureRef = useRef(false);
  const [offsetX, setOffsetX] = useState(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement | null)?.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    modeRef.current = 'undecided';
    pointerTypeRef.current = e.pointerType;
    didCaptureRef.current = false;
    setOffsetX(0);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (pointerTypeRef.current === 'mouse' && e.buttons === 0) return;
    const start = startRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (modeRef.current === 'undecided') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      modeRef.current = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'scroll';
    }

    if (modeRef.current !== 'swipe') return;
    if (!didCaptureRef.current) {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      didCaptureRef.current = true;
    }
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
    pointerTypeRef.current = null;
    didCaptureRef.current = false;
    setOffsetX(0);
  }, [offsetX, onReply]);

  return (
    <div className="relative">
      <div
        className={[
          'pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded-full border px-2 py-0.5 text-[11px] transition-opacity',
          offsetX > 12 ? 'opacity-100 border-primary/30 bg-primary/15 text-primary' : 'opacity-0 border-white/10 bg-white/5 text-zinc-400',
        ].join(' ')}
      >
        Reply
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={(e) => {
          if ((e.target as HTMLElement | null)?.closest('button')) return;
          if (typeof window === 'undefined') return;
          if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
          onReply();
        }}
        className="group flex items-start gap-2 text-sm leading-relaxed text-zinc-200"
        style={{ transform: offsetX ? `translateX(${offsetX}px)` : undefined, transition: offsetX ? undefined : 'transform 120ms ease-out' }}
      >
      <div className="min-w-0 flex-1">
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
        <span className="text-zinc-300">{renderMessageWithCustomEmojis(message.message)}</span>
        <div className="mt-1 flex items-center gap-1.5">
          {QUICK_REACTIONS.map((emoji) => {
            const count = reactions?.[emoji] ?? 0;
            const active = Boolean(myReactions?.[emoji]);
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(emoji)}
                className={[
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  active ? 'border-primary/30 bg-primary/15 text-primary' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10',
                ].join(' ')}
              >
                <span>{emoji}</span>
                {count > 0 ? <span className="tabular-nums">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onReply}
        className="hidden md:inline-flex px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        Reply
      </button>
      </div>
    </div>
  );
}
