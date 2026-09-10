import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mic2, SendHorizontal, Sparkles, X } from 'lucide-react';
import { askMoshaFull, MOSHA_INTRO, type MoshaAction, type MoshaTurn } from '@/lib/mosha';
import { getCache, loadEarlier, loadGuest, loadRecent, saveGuest, setCache, type StoredTurn } from '@/lib/moshaHistory';
import { useAuth } from '@/context/AuthContext';
import { MoshaFlow, FLOW_LABEL, type MoshaFlowName } from '@/components/mosha/MoshaFlows';

const STARTERS = [
  'What is this place?',
  'How do I get closer to an artist?',
  'What can I do without a wallet?',
  'How do I put my music out?',
  'How do I switch to my artist account?',
];

/**
 * Some questions deserve a door, not just an answer. When the person asks how
 * to become an artist, claim their page, switch accounts or why they cannot
 * upload, Mo's reply carries the button that does it. Decided here, on the
 * words, so the button is never left to a model's mood.
 */
const ARTIST_ACCOUNT_ASK = /\b(artist account|artist profile|claim|switch\s+(?:to\s+)?(?:my\s+)?artist|become an artist|upload|put\s+(?:my|our)\s+(?:music|songs?|records?)\s+out|release\s+(?:my|a)\s+(?:song|record|track)|studio)\b/i;

interface ChatTurn extends MoshaTurn {
  id?: string;
  at?: string;
  action?: { label: string; to: string };
  /** A flow Mo$ha opened under this reply. */
  flow?: MoshaFlowName;
  /** Opened from a chip, not said: shown now, never written down. */
  local?: boolean;
}

function toChat(t: StoredTurn): ChatTurn {
  return {
    id: t.id,
    at: t.at,
    role: t.role,
    content: t.content,
    action: t.action?.type === 'go' ? { label: 'Take me there', to: t.action.path } : undefined,
  };
}

function toStored(t: ChatTurn): StoredTurn {
  return {
    id: t.id,
    at: t.at ?? new Date().toISOString(),
    role: t.role,
    content: t.content,
    action: t.action ? { type: 'go', path: t.action.to } : undefined,
  };
}

/** One-tap flows for someone who would rather do than ask. */
const DO_CHIPS: Array<{ flow: MoshaFlowName; artistOnly: boolean }> = [
  { flow: 'upload_song', artistOnly: true },
  { flow: 'build_world', artistOnly: true },
  { flow: 'edit_world', artistOnly: true },
  { flow: 'edit_gallery', artistOnly: true },
  { flow: 'become_artist', artistOnly: false },
  { flow: 'connect_wallet', artistOnly: false },
];

/**
 * The chat with Mo$ha, wherever it opens: the tab, the landing page, a room.
 *
 * It is a conversation, not a menu. The first line is Mo$ha's, the starters
 * are there for someone who does not know what to ask, and everything after
 * that is typed. Hide it and bring it back and the thread is still there:
 * the last 48 hours come back from the server (or the phone, for a guest),
 * and everything older is one tap away under "Earlier chats".
 */
export function MoshaChat({
  onClose,
  extraChips,
  initial,
  compact = false,
}: {
  onClose?: () => void;
  /** Extra one-tap actions shown beside the starters, e.g. "Set my vibe". */
  extraChips?: Array<{ label: string; onClick: () => void }>;
  initial?: MoshaTurn[];
  compact?: boolean;
}) {
  const { isArtist, user } = useAuth();
  const [turns, setTurns] = useState<ChatTurn[]>(initial ?? []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasArchive, setHasArchive] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [restored, setRestored] = useState(Boolean(initial));
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const holdScroll = useRef(false);
  const seeded = Boolean(initial);
  const userId = user?.id ?? null;
  const historyKey = userId ?? 'guest';

  // The thread comes back when Mo$ha is shown again: from the page cache
  // first, then the server (or the phone, for a guest).
  useEffect(() => {
    if (seeded) return;
    const cached = getCache(historyKey);
    if (cached) {
      setTurns(cached.turns.map(toChat));
      setHasArchive(cached.hasArchive);
      setRestored(true);
      return;
    }
    if (!userId) {
      const g = loadGuest();
      setTurns(g.map(toChat));
      setCache(historyKey, g, false);
      setRestored(true);
      return;
    }
    let alive = true;
    void loadRecent(userId).then(({ turns: t, hasArchive: more }) => {
      if (!alive) return;
      setTurns(t.map(toChat));
      setHasArchive(more);
      setCache(historyKey, t, more);
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, [seeded, historyKey, userId]);

  // Whatever is on screen is what comes back next time.
  useEffect(() => {
    if (!restored || seeded) return;
    const stored = turns.filter((t) => !t.local).map(toStored);
    setCache(historyKey, stored, hasArchive);
    if (!userId) saveGuest(stored);
  }, [turns, hasArchive, restored, seeded, historyKey, userId]);

  useEffect(() => {
    if (holdScroll.current) {
      holdScroll.current = false;
      return;
    }
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  /** One more page of the archive, above what is already showing. */
  const pullEarlier = useCallback(async () => {
    if (!userId || pulling) return;
    setPulling(true);
    try {
      const before = turns.find((t) => t.at)?.at ?? new Date().toISOString();
      const { turns: older, more } = await loadEarlier(userId, before);
      holdScroll.current = true;
      setTurns((prev) => [...older.map(toChat), ...prev]);
      setHasArchive(more);
    } finally {
      setPulling(false);
    }
  }, [userId, pulling, turns]);

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || busy) return;
      const next: ChatTurn[] = [...turns, { role: 'user', content: clean, at: new Date().toISOString() }];
      setTurns(next);
      setDraft('');
      setBusy(true);
      const { reply, action: moshaAction } = await askMoshaFull(next.map(({ role, content }) => ({ role, content })), 'bubble');
      const flow = moshaAction?.type === 'flow' ? moshaAction.flow : undefined;
      const go = moshaAction?.type === 'go' ? moshaAction : undefined;
      // A page Mo$ha points at gets a button; the old keyword door stays as a
      // fallback for the account questions when the model gave no action.
      const action = go
        ? { label: 'Take me there', to: go.path }
        : !flow && ARTIST_ACCOUNT_ASK.test(clean)
          ? isArtist
            ? { label: 'Open the Studio', to: '/studio' }
            : { label: 'Switch to artist account', to: '/claim' }
          : undefined;
      setTurns((prev) => [...prev, { role: 'assistant', content: reply, action, flow, at: new Date().toISOString() }]);
      setBusy(false);
      input.current?.focus();
    },
    [busy, turns, isArtist],
  );

  const openFlow = useCallback((flow: MoshaFlowName) => {
    setTurns((prev) => [...prev, { role: 'assistant', content: FLOW_LABEL[flow] + '. Right here.', flow, local: true, at: new Date().toISOString() }]);
  }, []);

  return (
    <div className={`flex flex-col ${compact ? 'h-[60vh] max-h-[28rem]' : 'h-[68vh] max-h-[34rem]'}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Mo$ha
          <span className="rounded border border-current/40 px-1 text-[9px] font-semibold uppercase tracking-wide opacity-80" title="An AI guide. Replies are generated.">AI</span>
        </span>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Hide Mo$ha" title="Hide. Your chat stays." className="rounded-full p-1 text-muted-foreground hover:text-foreground min-h-11 min-w-11 inline-flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {hasArchive && userId && (
          <button
            type="button"
            disabled={pulling}
            onClick={() => void pullEarlier()}
            className="mx-auto block rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 min-h-10"
          >
            {pulling ? 'Pulling up' : 'Earlier chats'}
          </button>
        )}
        {turns.length === 0 && <Bubble role="assistant">{MOSHA_INTRO}</Bubble>}
        {isArtist && turns.length === 0 && (
          <Bubble role="assistant">Want me to build your world for you? Say the word and it is done in a few taps. I can replace or change anything on it after, whenever you like.</Bubble>
        )}
        {turns.map((t, i) => (
          <Bubble key={i} role={t.role} wide={Boolean(t.flow)}>
            {t.content}
            {t.flow && (
              <MoshaFlow
                flow={t.flow}
                onClose={() => setTurns((prev) => prev.map((x, j) => (j === i ? { ...x, flow: undefined } : x)))}
              />
            )}
            {t.action && (
              <Link
                to={t.action.to}
                onClick={onClose}
                className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
              >
                <Mic2 className="h-3.5 w-3.5" /> {t.action.label}
              </Link>
            )}
          </Bubble>
        ))}
        {busy && (
          <Bubble role="assistant">
            <span className="inline-flex gap-1" aria-label="Mo$ha is typing">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </span>
          </Bubble>
        )}
        {turns.length === 0 && !busy && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {STARTERS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted min-h-10">
                {s}
              </button>
            ))}
            {extraChips?.map((c) => (
              <button key={c.label} type="button" onClick={c.onClick} className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 min-h-10">
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The things Mo$ha can do, always one tap away, not only before the first word. */}
      {user && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-border px-3 py-1.5 scrollbar-hide">
          {DO_CHIPS.filter((c) => (isArtist ? c.flow !== 'become_artist' : !c.artistOnly)).map((c) => (
            <button key={c.flow} type="button" disabled={busy} onClick={() => openFlow(c.flow)} className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50 min-h-10">
              {FLOW_LABEL[c.flow]}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-end gap-2 border-t border-border px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={1}
          maxLength={1500}
          placeholder="Ask me anything about $ongChainn"
          aria-label="Message Mo$ha"
          className="max-h-24 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Send"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function Bubble({ role, children, wide = false }: { role: 'user' | 'assistant'; children: React.ReactNode; wide?: boolean }) {
  const mine = role === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`${wide ? 'w-full' : 'max-w-[85%]'} whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
