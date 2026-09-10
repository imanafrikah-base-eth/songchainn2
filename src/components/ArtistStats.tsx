import { useEffect, useRef, useState } from 'react';
import { Heart, Music, PlayCircle, Users } from 'lucide-react';

/**
 * The numbers under an artist's name, with some life in them.
 *
 * Four flat grey boxes with a figure in each is what a spreadsheet looks
 * like, not what a career looks like. Same four numbers, but they count up
 * when they come into view, the biggest one leads, each carries its own
 * colour, and under them a bar shows how the streams are spread across the
 * catalogue so the shape of the thing is visible at a glance.
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

function StatCard({ stat, run }: { stat: Stat; run: boolean }) {
  const shown = useCountUp(stat.value, run);
  const Icon = stat.icon;
  return (
    <div className={`group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-center transition-transform hover:-translate-y-0.5 ${stat.ring}`}>
      <div className={`pointer-events-none absolute inset-x-0 -top-8 h-16 opacity-40 blur-2xl ${stat.tint}`} aria-hidden="true" />
      <Icon className={`relative mx-auto mb-2 h-6 w-6 ${stat.ring.replace('hover:border-', 'text-').replace('/40', '')}`} />
      <p className="relative font-heading text-2xl font-bold tabular-nums text-foreground">
        {shown.toLocaleString()}
      </p>
      <p className="relative text-sm text-muted-foreground">{stat.label}</p>
    </div>
  );
}

export function ArtistStats({
  songs,
  streams,
  followers,
  likes,
  topSongs,
  className = '',
}: {
  songs: number;
  streams: number;
  followers: number;
  likes: number;
  /** The busiest few records, for the shape bar. Optional. */
  topSongs?: Array<{ id: string; title: string; plays: number }>;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

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

  const stats: Stat[] = [
    { key: 'streams', label: streams === 1 ? 'Stream' : 'Streams', value: streams, icon: PlayCircle, tint: 'bg-primary', ring: 'hover:border-primary/40' },
    { key: 'songs', label: songs === 1 ? 'Song' : 'Songs', value: songs, icon: Music, tint: 'bg-emerald-500', ring: 'hover:border-emerald-500/40' },
    { key: 'followers', label: followers === 1 ? 'Follower' : 'Followers', value: followers, icon: Users, tint: 'bg-sky-500', ring: 'hover:border-sky-500/40' },
    { key: 'likes', label: likes === 1 ? 'Like' : 'Likes', value: likes, icon: Heart, tint: 'bg-rose-500', ring: 'hover:border-rose-500/40' },
  ];

  const top = (topSongs ?? []).filter((s) => s.plays > 0).slice(0, 6);
  const topTotal = top.reduce((sum, s) => sum + s.plays, 0);

  return (
    <div ref={ref} className={className}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => <StatCard key={s.key} stat={s} run={seen} />)}
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
    </div>
  );
}

export default ArtistStats;
