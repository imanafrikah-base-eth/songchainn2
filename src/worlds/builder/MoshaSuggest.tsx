// Mo$ha's quiet suggestion while an artist builds: one card, one direction,
// and an "I can do it for you" that does it and shows each step as it goes.
//
// Nothing here talks to the model. The suggestion is decided from the
// world's own state, so it is always about the thing in front of the artist
// and never invents a feature. It can be put away; it comes back only when
// there is something new to say.

import { useMemo, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { useWorldBuilder } from '@/worlds/builder/useWorldBuilder';

type Builder = ReturnType<typeof useWorldBuilder>;
type Step = 'name' | 'streets' | 'blocks' | 'art' | 'key' | 'drops' | 'walk' | 'publish';

interface Suggestion {
  id: string;
  line: string;
  /** What "I can do it for you" runs. Each returned string is a progress line. */
  run: (say: (line: string) => void) => Promise<void>;
}

function pickSuggestion(step: Step, b: Builder): Suggestion | null {
  const w = b.world;
  if (!w) return null;
  const filled = b.streets.filter((s) => (b.blocksByStreet[s.id]?.length ?? 0) > 0).length;
  const coin = (w.zora_profile_url ?? '').match(/base:(0x[0-9a-fA-F]{40})/);

  if (step === 'blocks' && filled < 3 && b.streets.length >= 3) {
    return {
      id: 'fill-three',
      line: `Three streets need something on them before the doors open. Your records on the first three is the quickest start.`,
      run: async (say) => {
        for (const s of b.streets.slice(0, 3)) {
          if ((b.blocksByStreet[s.id]?.length ?? 0) > 0) continue;
          say(`Putting your records on ${s.name}`);
          await b.addBlock(s.id, 'catalog-list', { heading: 'The records', limit: 8 });
        }
        say('Done. Three streets have something on them.');
      },
    };
  }
  if (step === 'art' && !w.hero_image && w.entrance_poster) {
    return {
      id: 'hero-from-gate',
      line: 'No hero picture yet. The gate picture would carry the map fine until you have one made.',
      run: async (say) => { say('Setting the hero'); await b.saveWorld({ hero_image: w.entrance_poster }); say('Done. Frame it from the Art step if you like.'); },
    };
  }
  if (step === 'art' && !w.entrance_poster && w.hero_image) {
    return {
      id: 'gate-from-hero',
      line: 'No gate picture yet. The hero would stand at the doors until you have one made.',
      run: async (say) => { say('Setting the gate'); await b.saveWorld({ entrance_poster: w.hero_image }); say('Done.'); },
    };
  }
  if (step === 'key' && coin && b.gate.kind !== 'token') {
    return {
      id: 'coin-key',
      line: 'Your creator coin link carries the coin. It can be the key to your world.',
      run: async (say) => { say('Setting your coin as the key'); await b.saveGate({ kind: 'token', token_address: coin[1] }); say('Done. Fan and insider doors open on how much of it someone holds.'); },
    };
  }
  if (step === 'publish' && (w.story?.length ?? 0) === 0 && w.positioning) {
    return {
      id: 'story-from-line',
      line: 'The gate needs a story. Your one line about the world can be the first paragraph.',
      run: async (say) => { say('Writing your line onto the gate'); await b.saveWorld({ story: [w.positioning] }); say('Done. Add to it any time.'); },
    };
  }
  if (step === 'streets' && b.streets.some((s) => /^The (Gate|Streets|Studio|Gallery|Council|Stage|Wall|Parlour)$/.test(s.name))) {
    return {
      id: 'names',
      line: 'These street names are the starter set. Rename any of them to what they are in your world; the cities below too.',
      run: async (say) => { say('Nothing to run: tap a name to change it.'); },
    };
  }
  return null;
}

export function MoshaSuggest({ step, b }: { step: Step; b: Builder }) {
  const suggestion = useMemo(() => pickSuggestion(step, b), [step, b]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (!suggestion || dismissed === suggestion.id) return null;

  const run = async () => {
    setBusy(true);
    setLog([]);
    try {
      await suggestion.run((line) => setLog((l) => [...l, line]));
      toast('Done', { description: suggestion.line.split('.')[0] + '.' });
    } catch (err) {
      setLog((l) => [...l, (err as Error)?.message || 'That did not go through.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3" role="status">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Mo$ha</p>
          <p className="mt-0.5 text-sm text-foreground">{suggestion.line}</p>
          {log.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {log.map((l, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  {busy && i === log.length - 1 ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <Check className="h-3 w-3 text-primary" />}
                  {l}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" className="h-10 rounded-full text-xs" disabled={busy} onClick={() => void run()}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {busy ? 'Doing it' : 'I can do it for you'}
            </Button>
            <Button size="sm" variant="ghost" className="h-10 rounded-full text-xs" disabled={busy} onClick={() => setDismissed(suggestion.id)}>
              Not now
            </Button>
          </div>
        </div>
        <button type="button" onClick={() => setDismissed(suggestion.id)} aria-label="Put this away" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
