import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, SendHorizontal, Sparkles, X } from 'lucide-react';
import { askMoshaFull, type MoshaTurn } from '@/lib/mosha';
import { onDid } from '@/lib/moshaWatch';

/**
 * Mo$ha riding along on the World Builder.
 *
 * For somebody who asked Mo$ha to change their world and chose to do it on the
 * page rather than in the chat. The chat bubble does not come to this page (it
 * would sit on the builder's own controls), so this small card does instead.
 *
 * It watches what they do. A few seconds after they change something, it asks
 * Mo$ha for the one next question that follows from exactly that, so the
 * guidance moves with them instead of repeating itself. Those automatic asks
 * are not written into their chat history; anything they type here is.
 *
 * Never more than one automatic question every 25 seconds, and none at all
 * for simply moving between steps.
 */

const SETTLE_MS = 4_000;
const MIN_GAP_MS = 25_000;

export function MoshaOnPage({ stepLabel, onStop }: { stepLabel: string; onStop: () => void }) {
  const [turns, setTurns] = useState<MoshaTurn[]>([
    {
      role: 'assistant',
      content: `I am riding along. You are on ${stepLabel}. Change something and I will ask you the next thing from there, or ask me anything here.`,
    },
  ]);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const lastAsked = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  const ask = useCallback(async (userLine: string, silent: boolean) => {
    lastAsked.current = Date.now();
    setBusy(true);
    const history = [...turnsRef.current.slice(-4), { role: 'user' as const, content: userLine }];
    if (!silent) setTurns(history);
    const { reply, action } = await askMoshaFull(history, 'guide', { silent });
    setTurns((prev) => [...(silent ? prev : history), { role: 'assistant' as const, content: reply }].slice(-6));
    setLink(action?.type === 'go' ? action.path : null);
    setBusy(false);
  }, []);

  // A change settles, then one question about it. Moving between steps is
  // context for the next question, never a reason to ask one.
  useEffect(() => {
    return onDid((d) => {
      if (d.key === 'step') return;
      if (timer.current) window.clearTimeout(timer.current);
      const wait = Math.max(SETTLE_MS, MIN_GAP_MS - (Date.now() - lastAsked.current));
      timer.current = window.setTimeout(() => {
        void ask(`(On the page I just ${d.text}. What is the one next thing to ask me?)`, true);
      }, wait);
    });
  }, [ask]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const lastMosha = [...turns].reverse().find((t) => t.role === 'assistant');
  const lastMine = turns[turns.length - 2]?.role === 'user' ? turns[turns.length - 2] : null;

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3" role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Mo$ha, on this page with you</p>
          {lastMine && !lastMine.content.startsWith('(On the page') ? (
            <p className="mt-1 text-xs text-muted-foreground">You: {lastMine.content}</p>
          ) : null}
          <p className="mt-1 text-sm text-foreground">
            {busy ? <Loader2 className="inline h-3.5 w-3.5 animate-spin text-primary" /> : lastMosha?.content}
          </p>
          {link && !busy ? (
            <Link to={link} className="mt-2 inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground">
              Take me there
            </Link>
          ) : null}
          <form
            className="mt-2 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const q = draft.trim();
              if (!q || busy) return;
              setDraft('');
              void ask(q, false);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={600}
              placeholder="Answer or ask Mo$ha"
              aria-label="Answer or ask Mo$ha"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
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
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop Mo$ha riding along"
          title="Stop riding along"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default MoshaOnPage;
