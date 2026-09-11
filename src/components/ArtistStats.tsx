import { useEffect, useRef, useState } from 'react';
import { Heart, Music, PlayCircle, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useOverlayFlag } from '@/lib/overlayFlag';

/**
 * The numbers under an artist's name, with some life in them.
 *
 * Four flat grey boxes with a figure in each is what a spreadsheet looks
 * like, not what a career looks like. Same four numbers, but they count up
 * when they come into view, the biggest one leads, each carries its own
 * colour, and under them a bar shows how the streams are spread across the
 * catalogue so the shape of the thing is visible at a glance.
 *
 * They are also tappable. A figure on its own is a fact with nothing to do
 * about it, so each one opens a short panel saying what the number actually
 * counts, and what moves it.
 *
 * Nothing here is invented: every figure is the one that was passed in.
 * Anybody who asked their system for less motion gets the final numbers
 * immediately, no counting.
 */

interface Stat {
  key: string;
  label: string;
  value: number;
  icon: typeof Music;
  tint: string;
  ring: string;
  meaning: string;
  ownerNote?: string;
}

function useCountUp(target: number, run: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target <= 0) {
      setN(target);
      return;
    }
    const started = performance.now();
    const span = Math.min(1400, 400 + Math.log10(Math.max(10, target)) * 320);
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / span);
      // Fast at first, easing to a stop, the way a counter should feel.
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run]);
  return n;
}

function StatCard({ stat, run, onOpen }: { stat: Stat; run: boolean; onOpen: () => void }) {
  const shown = useCountUp(stat.value, run);
  const Icon = stat.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${stat.label}: ${stat.value.toLocaleString()}. What this means.`}
      className={`group relative min-h-[104px] overflow-hidden rounded-xl border border-border bg-card p-4 text-center transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${stat.ring}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 -top-8 h-16 opacity-40 blur-2xl ${stat.tint}`} aria-hidden="true" />
      <Icon className={`relative mx-auto mb-2 h-6 w-6 ${stat.ring.replace('hover:border-', 'text-').replace('/40', '')}`} />
      <p className="relative font-heading text-2xl font-bold tabular-nums text-foreground">
        {shown.toLocaleString()}
      </p>
      <p className="relative text-sm text-muted-foreground">{stat.label}</p>
    </button>
  );
}

export function ArtistStats({
  songs,
  streams,
  followers,
  likes,
  topSongs,
  isOwner = false,
  artistName,
  onSeeSongs,
  className = '',
}: {
  songs: number;
  streams: number;
  followers: number;
  likes: number;
  /** The busiest few records, for the shape bar. Optional. */
  topSongs?: Array<{ id: string; title: string; plays: number }>;
  /** True when the person looking at this page is the artist. */
  isOwner?: boolean;
  artistName?: string;
  /** Takes the reader to the record list on this page. */
  onSeeSongs?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useOverlayFlag(Boolean(openKey));

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }),
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const who = artistName || 'this artist';

  const stats: Stat[] = [
    {
      key: 'streams',
      label: streams === 1 ? 'Stream' : 'Streams',
      value: streams,
      icon: PlayCircle,
      tint: 'bg-primary',
      ring: 'hover:border-primary/40',
      meaning: `Every play of every record ${who} has here, counted once per listen. It is the number that decides where the music sits on Hot Today and what it earns.`,
      ownerNote: 'Releasing and posting is what moves it. The bar under these numbers shows which of your records is carrying the rest.',
    },
    {
      key: 'songs',
      label: songs === 1 ? 'Song' : 'Songs',
      value: songs,
      icon: Music,
      tint: 'bg-emerald-500',
      ring: 'hover:border-emerald-500/40',
      meaning: `Records ${who} has released here. Each one has its own page, its own coin and its own share link.`,
      ownerNote: 'Anything still in the Studio is not counted until it goes live, and nothing goes live without cover art.',
    },
    {
      key: 'followers',
      label: followers === 1 ? 'Follower' : 'Followers',
      value: followers,
      icon: Users,
      tint: 'bg-sky-500',
      ring: 'hover:border-sky-500/40',
      meaning: `People who get told the moment ${who} releases something. This is what turns a drop into a first day rather than a slow week.`,
      ownerNote: 'Every post you make reaches all of them. A quiet account stops being followed.',
    },
    {
      key: 'likes',
      label: likes === 1 ? 'Like' : 'Likes',
      value: likes,
      icon: Heart,
      tint: 'bg-rose-500',
      ring: 'hover:border-rose-500/40',
      meaning: 'Records saved by somebody who wanted to come back to them. A like is a stronger signal than a play, because it was deliberate.',
      ownerNote: 'Liked records are the ones to build a set, a drop or a world around.',
    },
  ];

  const top = (topSongs ?? []).filter((s) => s.plays > 0).slice(0, 6);
  const topTotal = top.reduce((sum, s) => sum + s.plays, 0);
  const open = stats.find((s) => s.key === openKey) ?? null;

  return (
    <div ref={ref} className={className}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.key} stat={s} run={seen} onOpen={() => setOpenKey(s.key)} />
        ))}
      </div>

      {top.length > 1 && topTotal > 0 && (
        <div className="mt-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`How the streams sit across the top ${top.length} records`}>
            {top.map((s, i) => (
              <span
                key={s.id}
                title={`${s.title}: ${s.plays.toLocaleString()} streams`}
                className={[
                  'h-full transition-[width] duration-1000 ease-out',
                  ['bg-primary', 'bg-emerald-500', 'bg-sky-500', 'bg-rose-500', 'bg-amber-500', 'bg-violet-500'][i % 6],
                ].join(' ')}
                style={{ width: seen ? `${(s.plays / topTotal) * 100}%` : '0%' }}
              />
            ))}
          </div>
          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
            Most played: {top[0].title} · {top[0].plays.toLocaleString()} streams
          </p>
        </div>
      )}

      <Sheet open={Boolean(open)} onOpenChange={(v) => !v && setOpenKey(null)}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          {open && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2.5">
                  <open.icon className="h-5 w-5 text-primary" />
                  {open.label}
                </SheetTitle>
              </SheetHeader>
              <p className="mt-2 font-heading text-4xl font-bold tabular-nums text-foreground">
                {open.value.toLocaleString()}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{open.meaning}</p>
              {isOwner && open.ownerNote && (
                <p className="mt-2 text-sm leading-relaxed text-foreground">{open.ownerNote}</p>
              )}

              {top.length > 0 && (open.key === 'streams' || open.key === 'songs') && (
                <ul className="mt-4 space-y-1.5">
                  {top.slice(0, 5).map((s, i) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="w-4 shrink-0 text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground">{s.title}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{s.plays.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}

              {onSeeSongs && (
                <div className="mt-5 pb-2">
                  <Button
                    className="h-11 w-full"
                    onClick={() => {
                      setOpenKey(null);
                      onSeeSongs();
                    }}
                  >
                    See all the music
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default ArtistStats;
