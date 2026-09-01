import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Lightbulb, MessageCircle } from 'lucide-react';
import { MOSHA_BEATS, shouldGreet, type BuilderStep } from '@/worlds/builder/moshaGuide';

/**
 * Mo$ha, sitting beside the world builder.
 *
 * Opens itself the first time an artist reaches a screen, then stays out of the
 * way unless asked. It never blocks the step, never covers a control, and never
 * needs an answer: an artist who knows exactly what they are building should be
 * able to ignore it completely and never feel nagged.
 *
 * What it is really for is permission. Most artists do not know they are
 * allowed to build a radio station or a town with its own rules, and a list of
 * real examples on the screen where the decision happens is worth more than any
 * amount of documentation nobody opens.
 */

const SEEN_KEY = 'songchainn:mosha-builder-seen';

function loadSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function remember(key: string) {
  try {
    const next = Array.from(new Set([...loadSeen(), key])).slice(-60);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    /* private browsing, and it only costs a repeated greeting */
  }
}

export function MoshaPanel({ step, worldId }: { step: BuilderStep; worldId: string }) {
  const beat = MOSHA_BEATS[step];
  const [open, setOpen] = useState(false);
  const [openSuggestion, setOpenSuggestion] = useState<string | null>(null);

  const key = useMemo(() => `${worldId || 'new'}:${step}`, [worldId, step]);

  useEffect(() => {
    if (shouldGreet(loadSeen(), worldId || 'new', step)) {
      setOpen(true);
      remember(key);
    }
    setOpenSuggestion(null);
  }, [key, step, worldId]);

  if (!beat) return null;

  return (
    <aside className="mb-6 overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
          <MessageCircle className="h-4 w-4 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Mo$ha</span>
          <span className="block truncate text-xs text-muted-foreground">{beat.question}</span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4">
          <p className="mb-4 max-w-prose text-sm text-muted-foreground">{beat.opener}</p>

          <ul className="space-y-1.5">
            {beat.suggestions.map((s) => {
              const isOpen = openSuggestion === s.label;
              return (
                <li key={s.label}>
                  <button
                    type="button"
                    onClick={() => setOpenSuggestion(isOpen ? null : s.label)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      isOpen
                        ? 'border-primary/40 bg-primary/5 text-foreground'
                        : 'border-border text-foreground hover:border-primary/30'
                    }`}
                  >
                    <Lightbulb className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <span className="flex-1">{s.label}</span>
                  </button>
                  {isOpen && (
                    <div className="px-3 py-2">
                      <p className="max-w-prose text-sm text-muted-foreground">{s.detail}</p>
                      {s.blocks && s.blocks.length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Built with:{' '}
                          <span className="font-medium text-foreground">{s.blocks.join(', ')}</span>
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {beat.watchOut && (
            <p className="mt-4 max-w-prose border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">One thing: </span>
              {beat.watchOut}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
