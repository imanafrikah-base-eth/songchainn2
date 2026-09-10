import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Check, Loader2, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { askMosha, moshaNudge, type MoshaFacts, type MoshaReply } from '@/worlds/builder/moshaBrain';

/**
 * Mo$ha, folded into the corner of the world builder.
 *
 * Premium tiers only. On lite he does the intro on each screen and then says
 * nothing, because the whole builder and all the stock is already there and an
 * assistant nagging someone toward an upgrade is worse than no assistant.
 *
 * Two ways to have him:
 *   guided  he speaks up unprompted as the build moves, and comments on what
 *           they just did.
 *   quiet   one greeting, then he folds away until pulled up, and opens with
 *           "Hey. Whatsup?"
 *
 * Everything he says comes from the app's own state. When he does not know, he
 * says so and offers to send it on as a feature request, which is a real row in
 * a real table that someone reads, not a polite dead end.
 */

interface Line {
  id: string;
  who: 'mosha' | 'you';
  text: string;
  chips?: string[];
  offersFeatureRequest?: boolean;
}

const uid = () => Math.random().toString(36).slice(2);

interface Props {
  facts: MoshaFacts;
  worldId: string | null;
  worldSlug: string | null;
  /** 'guided' or 'quiet'. Ignored on lite, which never renders this. */
  mode: 'guided' | 'quiet';
  onModeChange: (mode: 'guided' | 'quiet') => void;
}

export function MoshaChat({ facts, worldId, worldSlug, mode, onModeChange }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastNudge = useRef<string | null>(null);

  const say = (reply: MoshaReply) =>
    setLines((l) => [...l, { id: uid(), who: 'mosha', text: reply.text, chips: reply.chips, offersFeatureRequest: reply.offersFeatureRequest }]);

  // "Hey. Whatsup?" on the first pull-up, not before. Opening with a greeting
  // nobody asked for is the thing that makes people close these.
  useEffect(() => {
    if (open && !greeted) {
      setGreeted(true);
      setUnread(0);
      say({
        text: 'Hey. Whatsup?',
        chips: ['What should I do next?', 'What blocks exist?', 'How do the keys work?'],
      });
    }
    if (open) setUnread(0);
  }, [open, greeted]);

  // In guided mode he notices what changed and comments once per observation.
  useEffect(() => {
    if (mode !== 'guided') return;
    const nudge = moshaNudge(facts);
    if (!nudge || nudge === lastNudge.current) return;
    lastNudge.current = nudge;
    say({ text: nudge });
    if (!open) setUnread((n) => n + 1);
  }, [mode, facts, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines, open]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    setLines((l) => [...l, { id: uid(), who: 'you', text: q }]);
    setDraft('');
    // A beat before answering. Instant replies read as canned, which these are,
    // but the pause is the difference between a conversation and a lookup.
    window.setTimeout(() => say(askMosha(q, facts)), 260);
  };

  const sendFeatureRequest = async (askedAs: string) => {
    if (!user) return;
    setSendingRequest(true);
    // Saved with the world and the step attached, and mailed to the
    // founders' inbox, in one call.
    const { data, error } = await supabase.functions.invoke('founder-inbox', {
      body: { kind: 'feature', text: askedAs, world_id: worldId, world_slug: worldSlug, build_step: facts.step, page: window.location.pathname },
    });
    setSendingRequest(false);
    if (error || !data?.success) {
      toast.error('Could not send that on', { description: error?.message ?? 'Try again in a moment.' });
      return;
    }
    say({
      text: 'Sent. It goes to the people who build this with your world and the step you were on attached, so it makes sense without you explaining it again. If it gets built you will see it here.',
    });
    toast.success('Passed on to the team');
  };

  const lastAsked = [...lines].reverse().find((l) => l.who === 'you')?.text ?? '';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Mo$ha"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 shadow-lg transition-transform hover:scale-[1.03]"
      >
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-primary/15">
          <MessageCircle className="h-3.5 w-3.5 text-primary" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread}
            </span>
          )}
        </span>
        <span className="text-sm font-semibold text-foreground">Mo$ha</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex max-h-[70vh] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15">
          <MessageCircle className="h-4 w-4 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Mo$ha</span>
          <span className="block text-[11px] text-muted-foreground">
            {mode === 'guided' ? 'Guiding this build' : 'Here when you need me'}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onModeChange(mode === 'guided' ? 'quiet' : 'guided')}
          className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {mode === 'guided' ? 'Go quiet' : 'Guide me'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {lines.map((line) => (
          <div key={line.id}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                line.who === 'you'
                  ? 'ml-auto bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {line.text}
            </div>

            {line.who === 'mosha' && line.offersFeatureRequest && lastAsked && (
              <button
                type="button"
                disabled={sendingRequest}
                onClick={() => void sendFeatureRequest(lastAsked)}
                className="mt-2 flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
              >
                {sendingRequest ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Lightbulb className="h-3 w-3" />
                )}
                Pass it on to the team
              </button>
            )}

            {line.who === 'mosha' && line.chips && line.chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {line.chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => ask(chip)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className="flex items-center gap-2 border-t border-border px-3 py-2.5"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about your world"
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

/**
 * The one-time opt-in, shown on the first screen of a premium build.
 *
 * Asked once, answerable either way, and never asked again. Somebody who says
 * no still has him in the corner; they just do not get spoken to.
 */
export function MoshaOptIn({
  mode,
  onModeChange,
  onDismiss,
}: {
  mode: 'guided' | 'quiet';
  onModeChange: (m: 'guided' | 'quiet') => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-semibold text-foreground">Want me along for this build?</p>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        I will say something when it is worth saying, and nothing when it is not. Either way I am in
        the corner if you want me.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            onModeChange('guided');
            onDismiss();
          }}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
            mode === 'guided'
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-foreground'
          }`}
        >
          <Check className="h-3.5 w-3.5" /> Guide me
        </button>
        <button
          type="button"
          onClick={() => {
            onModeChange('quiet');
            onDismiss();
          }}
          className="rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground"
        >
          I am good, stay quiet
        </button>
      </div>
    </div>
  );
}
