import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mic2, SendHorizontal, Sparkles, X } from 'lucide-react';
import { askMosha, MOSHA_INTRO, type MoshaTurn } from '@/lib/mosha';
import { useAuth } from '@/context/AuthContext';

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
const ARTIST_ACCOUNT_ASK = /(artist account|artist profile|claim|switch (to|my) artist|become an artist|upload|put (my|our) (music|song|record)s? out|release (my|a) (song|record|track)|studio)/i;

interface ChatTurn extends MoshaTurn {
  action?: { label: string; to: string };
}

/**
 * The chat with Mo$ha, wherever it opens: the tab, the landing page, a room.
 *
 * It is a conversation, not a menu. The first line is Mo$ha's, the starters
 * are there for someone who does not know what to ask, and everything after
 * that is typed. History lives in memory for the session; the inbox keeps
 * its own copy in the database.
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
  const { isArtist } = useAuth();
  const [turns, setTurns] = useState<ChatTurn[]>(initial ?? []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || busy) return;
      const next: ChatTurn[] = [...turns, { role: 'user', content: clean }];
      setTurns(next);
      setDraft('');
      setBusy(true);
      const reply = await askMosha(next.map(({ role, content }) => ({ role, content })), 'bubble');
      const action = ARTIST_ACCOUNT_ASK.test(clean)
        ? isArtist
          ? { label: 'Open the Studio', to: '/studio' }
          : { label: 'Switch to artist account', to: '/claim' }
        : undefined;
      setTurns((prev) => [...prev, { role: 'assistant', content: reply, action }]);
      setBusy(false);
      input.current?.focus();
    },
    [busy, turns, isArtist],
  );

  return (
    <div className={`flex flex-col ${compact ? 'h-[60vh] max-h-[28rem]' : 'h-[68vh] max-h-[34rem]'}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Mo$ha
          <span className="rounded border border-current/40 px-1 text-[9px] font-semibold uppercase tracking-wide opacity-80" title="An AI guide. Replies are generated.">AI</span>
        </span>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close Mo$ha" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        <Bubble role="assistant">{MOSHA_INTRO}</Bubble>
        {turns.map((t, i) => (
          <Bubble key={i} role={t.role}>
            {t.content}
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
              <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted">
                {s}
              </button>
            ))}
            {extraChips?.map((c) => (
              <button key={c.label} type="button" onClick={c.onClick} className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20">
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

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

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const mine = role === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
