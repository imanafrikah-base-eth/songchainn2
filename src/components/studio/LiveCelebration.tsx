import { useEffect, useSyncExternalStore, type CSSProperties } from 'react';
import { Music, Music2, Music3, Music4, X } from 'lucide-react';

/**
 * The moment a record goes live, said once, with a little rise of notes.
 *
 * Fired from the send (useBatchUpload) when the judges pass a record, shown by
 * one host mounted in App, so it lands wherever the artist is when that
 * happens: the Studio, the Mo$ha chat, another page. It goes by itself after a
 * few seconds; a tap on the close goes sooner.
 */

type Celebration = { id: number; title: string; line: string };

let current: Celebration | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const snapshot = () => current;

const KIND_WORD: Record<string, string> = { ep: 'EP', album: 'album', mixtape: 'mixtape', compilation: 'compilation' };

/** How long it stays up. */
const SHOW_MS = 6500;

export function celebrateLive(o: { titles: string[]; releaseTitle?: string | null; kind?: string | null }): void {
  const titles = o.titles.map((t) => t.trim()).filter(Boolean);
  if (!titles.length) return;
  const word = o.kind ? KIND_WORD[o.kind] : undefined;
  const title = word ? `Your ${word} is live` : titles.length === 1 ? 'Your song is live' : `${titles.length} songs are live`;
  const line =
    word && o.releaseTitle
      ? `"${o.releaseTitle}" is out on $ongChainn. Go share it.`
      : titles.length === 1
        ? `"${titles[0]}" is out on $ongChainn. Go share it.`
        : `${titles.slice(0, 3).map((t) => `"${t}"`).join(', ')}${titles.length > 3 ? ' and more' : ''} are out on $ongChainn.`;
  current = { id: nextId++, title, line };
  emit();
}

const NOTES = [
  { Icon: Music, left: '-4%', delay: 0, r: '-14deg' },
  { Icon: Music2, left: '10%', delay: 350, r: '10deg' },
  { Icon: Music3, left: '24%', delay: 120, r: '-6deg' },
  { Icon: Music4, left: '40%', delay: 520, r: '16deg' },
  { Icon: Music, left: '56%', delay: 240, r: '-12deg' },
  { Icon: Music2, left: '70%', delay: 640, r: '8deg' },
  { Icon: Music3, left: '84%', delay: 60, r: '-18deg' },
  { Icon: Music4, left: '98%', delay: 420, r: '12deg' },
];

export function LiveCelebrationHost() {
  const c = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    if (!c) return;
    const t = window.setTimeout(() => {
      if (current?.id === c.id) {
        current = null;
        emit();
      }
    }, SHOW_MS);
    return () => window.clearTimeout(t);
  }, [c]);

  if (!c) return null;

  const close = () => {
    current = null;
    emit();
  };

  return (
    <div key={c.id} className="pointer-events-none fixed inset-x-0 top-[16%] z-[120] flex justify-center px-4" aria-live="polite">
      <style>{`@keyframes sc-note-rise{0%{transform:translateY(24px) scale(.7) rotate(0);opacity:0}15%{opacity:.9}100%{transform:translateY(-140px) scale(1.05) rotate(var(--r));opacity:0}}@keyframes sc-live-in{0%{transform:translateY(-10px) scale(.96);opacity:0}100%{transform:none;opacity:1}}@media (prefers-reduced-motion: reduce){.sc-note{display:none}.sc-live-card{animation:none!important}}`}</style>
      <div className="relative w-full max-w-sm">
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-0 h-0" aria-hidden>
          {NOTES.map(({ Icon, left, delay, r }, i) => (
            <Icon
              key={i}
              className="sc-note absolute bottom-0 h-5 w-5 text-primary"
              style={{ left, opacity: 0, animation: `sc-note-rise 2.6s ease-out ${delay}ms 2 both`, '--r': r } as CSSProperties}
            />
          ))}
        </div>
        <div
          role="status"
          className="sc-live-card pointer-events-auto relative z-10 rounded-2xl border border-border bg-card px-4 py-3 text-foreground shadow-xl"
          style={{ animation: 'sc-live-in 280ms ease-out' }}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Music2 className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{c.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{c.line}</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
