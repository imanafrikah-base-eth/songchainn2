import { useEffect, useRef, useState } from 'react';
import { ArtistName } from '@/components/ArtistName';
import { Link } from 'react-router-dom';
import { Send, ArrowLeft, MoreVertical, Ban, Flag, Play, Music, MessageSquare } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AdultOnly } from '@/components/AdultOnly';
import {
  useConversations, useConversation, blockUser, reportMessage,
  type Conversation,
} from '@/hooks/useDirectMessages';
import { SONGS } from '@/data/musicData';
import { usePlayerActions, usePlayerState } from '@/context/PlayerContext';
import { toast } from 'sonner';

/**
 * The people half of the inbox.
 *
 * Two screens on a phone, one list and one thread, because a split view at
 * 390px is two cramped columns instead of one usable one.
 *
 * A message can carry a song, and when it does it arrives playable. That is the
 * whole point of messaging inside a music app rather than sending a link to one.
 */

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function SongInMessage({ songId }: { songId: string }) {
  const song = SONGS.find((s) => s.id === songId);
  const { currentSong, isPlaying } = usePlayerState();
  const { playSong, togglePlay } = usePlayerActions();

  if (!song) {
    return (
      <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-border bg-background/40 px-2.5 py-2">
        <Music size={14} className="text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">That song is no longer here.</span>
      </div>
    );
  }

  const isThis = currentSong?.id === song.id;

  return (
    <button
      onClick={() => (isThis ? togglePlay() : playSong(song))}
      className="mt-1.5 flex w-full items-center gap-2.5 rounded-lg border border-border bg-background/60 p-2 text-left transition-colors hover:bg-background"
    >
      {song.coverImage && (
        <img src={song.coverImage} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-foreground">{song.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{song.artist}</span>
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Play size={13} className={isThis && isPlaying ? 'opacity-60' : ''} />
      </span>
    </button>
  );
}

function Thread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const { user } = useAuth();
  const { messages, send, unsend } = useConversation(conversation.conversation_id);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    const res = await send(text);
    setSending(false);
    if (!res.ok) {
      setDraft(text);
      toast.error(res.error === 'You cannot message this person'
        ? 'You cannot message this person'
        : 'Message not sent', { description: res.error });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <button onClick={onBack} className="rounded-lg p-1.5 hover:bg-muted min-h-11 min-w-11 inline-flex items-center justify-center" aria-label="Back to messages">
          <ArrowLeft size={18} />
        </button>
        <Link to={`/audience/${conversation.other_user_id}`} className="flex min-w-0 flex-1 items-center gap-2">
          {conversation.other_avatar ? (
            <img src={conversation.other_avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">
              {conversation.other_name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="truncate text-sm font-semibold text-foreground"><ArtistName name={conversation.other_name} userId={conversation.other_user_id} size={14} /></span>
        </Link>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg p-1.5 hover:bg-muted"
            aria-label="Conversation options"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <button
                onClick={async () => {
                  setMenuOpen(false);
                  try {
                    await blockUser(conversation.other_user_id, true);
                  } catch {
                    toast.error('Could not block this person. Try again.');
                    return;
                  }
                  toast.success('Blocked', { description: 'They cannot message you now.' });
                  onBack();
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted"
              >
                <Ban size={14} /> Block this person
              </button>
              <button
                onClick={async () => {
                  setMenuOpen(false);
                  const last = [...messages].reverse().find((m) => m.sender_user_id !== user?.id);
                  if (!last) {
                    toast('Nothing from them to report yet');
                    return;
                  }
                  await reportMessage(last.id, conversation.other_user_id, 'Reported from the inbox');
                  toast.success('Reported', { description: 'Blocking them stops their messages right now.' });
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted"
              >
                <Flag size={14} /> Report
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Say something. Or send them a song.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_user_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                  mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                }`}
              >
                {m.is_deleted ? (
                  <p className="text-sm italic opacity-60">Message removed</p>
                ) : (
                  <>
                    {m.body && <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>}
                    {m.song_id && <SongInMessage songId={m.song_id} />}
                  </>
                )}
                <div className="mt-1 flex items-center justify-end gap-2">
                  <span className="text-[10px] opacity-60">{timeAgo(m.created_at)}</span>
                  {mine && !m.is_deleted && (
                    <button
                      onClick={() => void unsend(m.id)}
                      className="text-[10px] underline opacity-60 hover:opacity-100"
                    >
                      unsend
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Private messaging is the first of the four doors the Terms close to
          under-18s, and the one that matters most: it is the only surface on
          this app where an adult can reach a child unobserved. The thread stays
          readable so nothing already sent vanishes, but nothing new goes out. */}
      <div className="border-t border-border">
        <AdultOnly reason="messaging">
          <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${conversation.other_name}`}
              className="h-10 flex-1 rounded-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-primary"
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </form>
        </AdultOnly>
      </div>
    </div>
  );
}

export function Conversations() {
  const { conversations, isLoading } = useConversations();
  const [openId, setOpenId] = useState<string | null>(null);

  /* Deep link from a notification: /inbox?c=<conversation id> */
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c');
    if (c) setOpenId(c);
  }, []);

  const open = conversations.find((c) => c.conversation_id === openId) ?? null;

  if (open) {
    return (
      <div className="h-[calc(100vh-13rem)] rounded-2xl border border-border bg-card/60">
        <Thread conversation={open} onBack={() => setOpenId(null)} />
      </div>
    );
  }

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading your messages...</p>;
  }

  if (conversations.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 px-5 py-10 text-center">
        <MessageSquare size={22} className="mx-auto mb-3 text-muted-foreground" />
        <p className="mb-1 text-sm font-semibold text-foreground">No conversations yet</p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">
          Open somebody's profile and tap Message. You can send them a song, and it arrives ready to
          play.
        </p>
        <Link
          to="/community"
          className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
        >
          Find people
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {conversations.map((c) => (
        <li key={c.conversation_id}>
          <button
            onClick={() => setOpenId(c.conversation_id)}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card/60 px-3 py-2.5 text-left transition-colors hover:bg-card"
          >
            {c.other_avatar ? (
              <img src={c.other_avatar} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                {c.other_name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-foreground"><ArtistName name={c.other_name} userId={c.other_user_id} size={14} /></span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {timeAgo(c.last_message_at)}
                </span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {c.last_message_preview || 'Say something'}
              </span>
            </span>
            {c.unread > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                {c.unread > 9 ? '9+' : c.unread}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
