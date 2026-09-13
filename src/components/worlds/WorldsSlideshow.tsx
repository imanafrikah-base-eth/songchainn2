import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArtistName } from '@/components/ArtistName';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { WorldArt } from '@/worlds/components/WorldArt';
import { WORLDS, formatWorldNumber } from '@/worlds/registry';
import type { WorldConfig } from '@/worlds/types';
import { usePublishedWorlds, worldPath } from '@/hooks/usePublishedWorlds';
import { WorldDoorway } from './WorldDoorway';

/** How long a built world's advert plays before the next world slides in. */
const SLIDE_MS = 7000;
/**
 * World #001's slide lasts as long as its doors take to open and hold (they
 * report when they are done). This is only the ceiling, for doors that stall.
 */
const DOOR_MAX_MS = 12000;
/** Roughly how long the doors take, for the progress bar. */
const DOOR_EXPECTED_MS = 5500;
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
 * Every open world's advert, one after another, on its own.
 *
 * Founder, 13 Sep 2026: an auto slideshow of every live world, nobody pressing
 * next, each world showing its own preview animation before the next one comes.
 * World #001's slide opens IMan's filmed brass doors by itself, holds a beat on
 * the other side and then hands over; every other world plays the loop its
 * artist chose for this slot (gate, hero, or a clip made for it) for a few
 * seconds. It only runs while the section is on screen, so the doors never
 * open to nobody. The dots still jump straight to a world.
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
  // A mouse resting on the advert holds it. A finger only pauses it briefly: on
  // a phone a scroll over the advert fires touchcancel, not touchend, so a
  // "held while touched" flag stayed on and the slideshow stopped for good.
  const [hovered, setHovered] = useState(false);
  const [pausedUntil, setPausedUntil] = useState(0);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [inView, setInView] = useState(false);
  // Bumped on every move, so the next slide gets its full time and replays.
  const [cycle, setCycle] = useState(0);
  const resumeTimer = useRef<number | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const count = worlds.length;

  const reducedMotion = (() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  })();
  const running = count > 1 && inView && !hovered && pausedUntil === 0 && pageVisible && !reducedMotion;

  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Starts false and only the browser says otherwise. It used to be set true
  // while the list was still loading (no node to watch yet), which pushed the
  // doors open for a moment off screen and then left the slideshow waiting.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const node = host.current;
    if (!node) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    io.observe(node);
    return () => io.disconnect();
  }, [count]);

  const current = count ? Math.min(index, count - 1) : 0;
  const world = worlds[current];
  const isDoors = world ? CODE_SLUGS.has(world.slug) : false;

  const next = useCallback(() => {
    if (count < 2) return;
    setIndex((i) => (i + 1) % count);
    setCycle((c) => c + 1);
  }, [count]);

  // One slide at a time. A built world moves on after its advert has played;
  // the doors move on when they say they are done, and this is their ceiling.
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(next, isDoors ? DOOR_MAX_MS : SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [running, index, cycle, isDoors, next]);

  useEffect(() => {
    if (!pausedUntil) return;
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setPausedUntil(0), Math.max(0, pausedUntil - Date.now()));
    return () => { if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current); };
  }, [pausedUntil]);

  const onDoorsFinished = useCallback(() => {
    if (running) next();
  }, [running, next]);

  if (!count || !world) return null;
  const ctaForWorld = typeof cta === 'function' ? cta(world) : cta;
  const pauseForTouch = () => setPausedUntil(Date.now() + TOUCH_PAUSE_MS);
  const goTo = (to: number) => {
    setIndex(((to % count) + count) % count);
    setCycle((c) => c + 1);
  };
  const slideMs = isDoors ? DOOR_EXPECTED_MS : SLIDE_MS;

  return (
    <div
      ref={host}
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
                        ? { width: '100%', animation: `worlds-slide-progress ${slideMs}ms linear` }
                        : { width: '100%', opacity: 0.6 }
                      : { width: 0 }
                }
              />
            </div>
          ))}
          <style>{'@keyframes worlds-slide-progress { from { width: 0 } to { width: 100% } }'}</style>
        </div>
      )}

      {/* Keyed by the move, not only the world, so a world that comes round
          again plays its animation again: the doors open every time. */}
      <div key={`${world.slug}-${cycle}`} className="animate-in fade-in duration-500">
        {isDoors ? (
          <WorldDoorway
            cta={ctaForWorld}
            inSlideshow={count > 1}
            autoPlay={count > 1 && inView && !reducedMotion}
            onFinished={onDoorsFinished}
          />
        ) : (
          <WorldAd world={world} cta={ctaForWorld} />
        )}
      </div>

      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5" role="tablist" aria-label="Worlds">
          {worlds.map((w, i) => (
            <button
              key={w.slug}
              type="button"
              role="tab"
              aria-selected={i === current}
              aria-label={formatWorldNumber(w)}
              onClick={() => goTo(i)}
              className="flex h-11 min-w-8 items-center justify-center"
            >
              <span className={`block h-1.5 rounded-full transition-all ${i === current ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/40'}`} />
            </button>
          ))}
        </div>
      )}

      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
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
