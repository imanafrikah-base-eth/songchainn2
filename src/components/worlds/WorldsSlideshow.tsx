import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArtistName } from '@/components/ArtistName';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { WorldArt } from '@/worlds/components/WorldArt';
import { WORLDS, formatWorldNumber } from '@/worlds/registry';
import type { WorldConfig } from '@/worlds/types';
import { usePublishedWorlds, worldPath } from '@/hooks/usePublishedWorlds';
import { WorldDoorway } from './WorldDoorway';

/** How long each world's advert stands before the next one slides in. */
const SLIDE_MS = 7000;
/** A tap or a swipe over the advert pauses it this long, then it carries on by itself. */
const TOUCH_PAUSE_MS = 9000;
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
export function WorldsSlideshow({
  cta,
  className = '',
}: {
  /**
   * The ask under the advert. A function receives the world on the current
   * slide, so the key offered is that world's own. It used to be a fixed node
   * built for World #001, which put "Get $IMAN" under GESD1's world.
   */
  cta: ReactNode | ((world: WorldConfig) => ReactNode);
  className?: string;
}) {
  const { data: worlds = [] } = usePublishedWorlds();
  const [index, setIndex] = useState(0);
  // A mouse resting on the advert holds it. A finger never does for long: on a
  // phone a scroll over the advert fires touchcancel, not touchend, so a
  // "held while touched" flag stayed on and the slideshow stopped for good on
  // whichever world was showing. A touch now pauses it briefly instead.
  const [hovered, setHovered] = useState(false);
  const [pausedUntil, setPausedUntil] = useState(0);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  // Bumped on every manual move, so the next slide gets its full time.
  const [cycle, setCycle] = useState(0);
  const resumeTimer = useRef<number | null>(null);
  const count = worlds.length;

  const reducedMotion = (() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  })();
  const running = count > 1 && !hovered && pausedUntil === 0 && pageVisible && !reducedMotion;

  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // One slide at a time: a timeout per slide rather than an interval, so a
  // manual move or a pause always gives the next world its full time.
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [running, count, index, cycle]);

  useEffect(() => {
    if (!pausedUntil) return;
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setPausedUntil(0), Math.max(0, pausedUntil - Date.now()));
    return () => { if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current); };
  }, [pausedUntil]);

  if (!count) return null;
  const current = Math.min(index, count - 1);
  const world = worlds[current];
  const ctaForWorld = typeof cta === 'function' ? cta(world) : cta;
  const pauseForTouch = () => setPausedUntil(Date.now() + TOUCH_PAUSE_MS);
  const goTo = (next: number) => {
    setIndex(((next % count) + count) % count);
    setCycle((c) => c + 1);
  };

  return (
    <div
      className={`relative ${className}`}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHovered(false); }}
      onTouchStart={pauseForTouch}
    >
      {count > 1 && (
        <div className="mb-2 flex gap-1" aria-hidden="true">
          {worlds.map((w, i) => (
            <div key={w.slug} className="h-0.5 flex-1 overflow-hidden rounded-full bg-muted-foreground/25">
              <div
                key={i === current ? `${current}-${cycle}-${running}` : 'idle'}
                className="h-full rounded-full bg-primary"
                style={
                  i < current
                    ? { width: '100%' }
                    : i === current
                      ? running
                        ? { width: '100%', animation: `worlds-slide-progress ${SLIDE_MS}ms linear` }
                        : { width: '100%', opacity: 0.6 }
                      : { width: 0 }
                }
              />
            </div>
          ))}
          <style>{'@keyframes worlds-slide-progress { from { width: 0 } to { width: 100% } }'}</style>
        </div>
      )}
      <div key={world.slug} className="animate-in fade-in duration-500">
        {CODE_SLUGS.has(world.slug) ? (
          <WorldDoorway cta={ctaForWorld} />
        ) : (
          <WorldAd world={world} cta={ctaForWorld} />
        )}
      </div>

      {count > 1 && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => goTo(current - 1)}
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
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all ${i === current ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/40'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => goTo(current + 1)}
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
