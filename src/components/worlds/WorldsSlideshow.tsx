import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArtistName } from '@/components/ArtistName';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { WorldArt } from '@/worlds/components/WorldArt';
import { WORLDS, formatWorldNumber } from '@/worlds/registry';
import type { WorldConfig } from '@/worlds/types';
import { usePublishedWorlds, worldPath } from '@/hooks/usePublishedWorlds';
import { WorldDoorway } from './WorldDoorway';

const SLIDE_MS = 14000;
const CODE_SLUGS = new Set(WORLDS.map((w) => w.slug));

/** What a world chose to show in its advert: its gate by default. */
function adFor(world: WorldConfig): { poster?: string; video?: string; fitKey: string } {
  const ad = world.ad;
  if (ad?.kind === 'custom' && (ad.image || ad.video)) return { poster: ad.image, video: ad.video, fitKey: 'ad' };
  if (ad?.kind === 'hero') return { poster: world.heroImage, video: world.heroVideo, fitKey: 'hero' };
  if (world.entrance?.poster) return { poster: world.entrance.poster, video: world.entrance.video, fitKey: 'entrance' };
  return { poster: world.heroImage, video: world.heroVideo, fitKey: 'hero' };
}

/**
 * Every open world's advert, one at a time, sliding on its own.
 *
 * World #001 shows exactly what it always showed here: IMan's filmed brass
 * doors, opening. Every other world shows what its artist chose for this
 * slot in the builder (the gate loop, the hero loop, or a clip made for it).
 * With one world open there is nothing to slide and the doorway stands alone.
 */
export function WorldsSlideshow({ cta, className = '' }: { cta: ReactNode; className?: string }) {
  const { data: worlds = [] } = usePublishedWorlds();
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const timer = useRef<number | null>(null);
  const count = worlds.length;

  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count < 2 || held) return;
    let reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* fine */ }
    if (reduced) return;
    timer.current = window.setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => { if (timer.current !== null) window.clearInterval(timer.current); };
  }, [count, held]);

  if (!count) return null;
  const current = Math.min(index, count - 1);
  const world = worlds[current];

  return (
    <div
      className={`relative ${className}`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onTouchStart={() => setHeld(true)}
      onTouchEnd={() => setHeld(false)}
    >
      {CODE_SLUGS.has(world.slug) ? (
        <WorldDoorway key={world.slug} cta={cta} />
      ) : (
        <WorldAd key={world.slug} world={world} cta={cta} />
      )}

      {count > 1 && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
            aria-label="Previous world"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Worlds">
            {worlds.map((w, i) => (
              <button
                key={w.slug}
                type="button"
                role="tab"
                aria-selected={i === current}
                aria-label={formatWorldNumber(w)}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === current ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/40'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % count)}
            aria-label="Next world"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{count === 1 ? 'One world open.' : `${count} worlds open.`}</span>
        <Link to="/worlds" className="inline-flex items-center gap-1 font-semibold text-primary">
          Every world
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

/** A built world's advert: the picture its artist chose, and the ask under it. */
function WorldAd({ world, cta }: { world: WorldConfig; cta: ReactNode }) {
  const ad = adFor(world);
  return (
    <div>
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border bg-black sm:aspect-[21/9]">
        <WorldArt poster={ad.poster} video={ad.video} fit={world.artFit?.[ad.fitKey]} className="h-full w-full object-cover" eager />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{formatWorldNumber(world)}</p>
          <h3 className="mt-1 font-heading text-2xl font-bold leading-tight text-white sm:text-3xl"><ArtistName name={world.artistName} artistId={(world as { artistId?: string | null }).artistId} size={20} /></h3>
          {world.positioning ? <p className="mt-1 max-w-xl text-sm text-white/80 line-clamp-2">{world.positioning}</p> : null}
          <Link
            to={worldPath(world)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Walk in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="mt-3">{cta}</div>
    </div>
  );
}
