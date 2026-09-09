import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { WorldArt } from '@/worlds/components/WorldArt';
import { formatWorldNumber } from '@/worlds/registry';
import { usePublishedWorlds, worldPath } from '@/hooks/usePublishedWorlds';

const SLIDE_MS = 6500;

/**
 * Every open world, one at a time, sliding on its own.
 *
 * The advert on Home used to be World #001 alone. As artists open worlds
 * they take their turn here without anybody editing the page. It stops
 * while a finger or a pointer is on it, respects reduced motion, and the
 * whole list is one link away on the Artist Worlds page.
 */
export function WorldsSlideshow({ className = '' }: { className?: string }) {
  const { data: worlds = [] } = usePublishedWorlds();
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const stillTimer = useRef<number | null>(null);
  const count = worlds.length;

  // Stay in range if the list shrinks.
  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count < 2 || held) return;
    let reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* fine */ }
    if (reduced) return;
    stillTimer.current = window.setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => { if (stillTimer.current !== null) window.clearInterval(stillTimer.current); };
  }, [count, held]);

  if (!count) return null;
  const world = worlds[Math.min(index, count - 1)];

  return (
    <div
      className={`relative ${className}`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onTouchStart={() => setHeld(true)}
      onTouchEnd={() => setHeld(false)}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border bg-black sm:aspect-[21/9]">
        {worlds.map((w, i) => (
          <div
            key={w.slug}
            className={`absolute inset-0 transition-opacity duration-700 ${i === index ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            aria-hidden={i !== index}
          >
            <WorldArt poster={w.heroImage} video={w.heroVideo} className="h-full w-full object-cover" eager={i === index} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
          </div>
        ))}

        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{formatWorldNumber(world)}</p>
          <h3 className="mt-1 font-heading text-2xl font-bold leading-tight text-white sm:text-3xl">{world.artistName}</h3>
          {world.positioning ? (
            <p className="mt-1 max-w-xl text-sm text-white/80 line-clamp-2">{world.positioning}</p>
          ) : null}
          <Link
            to={worldPath(world)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Walk in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + count) % count)}
              aria-label="Previous world"
              className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % count)}
              aria-label="Next world"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute right-4 top-4 flex gap-1.5" role="tablist" aria-label="Worlds">
              {worlds.map((w, i) => (
                <button
                  key={w.slug}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={formatWorldNumber(w)}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{count === 1 ? 'One world open so far.' : `${count} worlds open.`}</span>
        <Link to="/worlds" className="inline-flex items-center gap-1 font-semibold text-primary">
          See every world
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
