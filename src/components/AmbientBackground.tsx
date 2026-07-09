import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { backgroundPools, type BackgroundPoolName, type BgImage } from '@/data/backgroundPools';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/lib/utils';

type OverlayVariant = 'hero' | 'card' | 'text' | 'none';

interface AmbientBackgroundProps {
  /** Which section pool to rotate through */
  pool: BackgroundPoolName;
  /**
   * Image layer opacity. Guidance: hero 0.35-0.5, cards 0.16-0.28,
   * text-heavy areas 0.08-0.18.
   */
  opacity?: number;
  /** Darkening overlay on top of the imagery to keep text readable */
  overlay?: OverlayVariant;
  /** Slow ken-burns zoom on the active layer */
  zoom?: boolean;
  /** Subtle floating particles */
  particles?: boolean;
  /** Very soft blue/purple glow blobs */
  glow?: boolean;
  /** Rotation interval in ms; default is a random 8-15s per instance */
  intervalMs?: number;
  className?: string;
}

const OVERLAY_CLASSES: Record<OverlayVariant, string> = {
  hero: 'bg-gradient-to-b from-background/60 via-background/40 to-background/80',
  card: 'bg-gradient-to-b from-background/70 via-background/55 to-background/85',
  text: 'bg-background/80',
  none: '',
};

function bgStyle(img: BgImage, opacity: number): React.CSSProperties {
  return {
    backgroundImage: `url(${img.src})`,
    backgroundSize: img.size ?? 'cover',
    backgroundPosition: img.position ?? 'center',
    backgroundRepeat: 'no-repeat',
    opacity,
  };
}

function pickNext(poolLength: number, current: number): number {
  if (poolLength <= 1) return current;
  let next = current;
  while (next === current) {
    next = Math.floor(Math.random() * poolLength);
  }
  return next;
}

/**
 * Living-world section background: softly rotates through a themed image
 * pool with crossfades (never hard cuts), optional slow zoom, floating
 * particles and blue/purple glow. Purely decorative - absolutely
 * positioned, pointer-events-none, and static under prefers-reduced-motion.
 *
 * Parent must be position:relative; page content should sit above it
 * (relative/z-10).
 */
export const AmbientBackground = memo(function AmbientBackground({
  pool,
  opacity = 0.2,
  overlay = 'card',
  zoom = false,
  particles = false,
  glow = false,
  intervalMs,
  className,
}: AmbientBackgroundProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const images = backgroundPools[pool];
  const interval = useMemo(
    () => intervalMs ?? 8000 + Math.floor(Math.random() * 7000),
    [intervalMs]
  );

  const [frontIndex, setFrontIndex] = useState(() =>
    Math.floor(Math.random() * images.length)
  );
  const [backIndex, setBackIndex] = useState(frontIndex);
  const [showFront, setShowFront] = useState(true);
  const showFrontRef = useRef(true);

  // Refs mirror state so the interval callback reads fresh values without
  // re-arming the timer every rotation.
  const frontIndexRef = useRef(frontIndex);
  const backIndexRef = useRef(backIndex);
  useEffect(() => { frontIndexRef.current = frontIndex; }, [frontIndex]);
  useEffect(() => { backIndexRef.current = backIndex; }, [backIndex]);

  // Rotate: load the incoming image into the hidden layer, then crossfade.
  useEffect(() => {
    if (prefersReducedMotion || images.length <= 1) return;

    const timer = window.setInterval(() => {
      const currentIndex = showFrontRef.current ? frontIndexRef.current : backIndexRef.current;
      const nextIndex = pickNext(images.length, currentIndex);
      const next = images[nextIndex];

      // Preload so the crossfade never reveals a half-loaded image.
      const img = new Image();
      img.onload = img.onerror = () => {
        if (showFrontRef.current) {
          setBackIndex(nextIndex);
        } else {
          setFrontIndex(nextIndex);
        }
        // Let the hidden layer paint before fading.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            showFrontRef.current = !showFrontRef.current;
            setShowFront(showFrontRef.current);
          });
        });
      };
      img.src = next.src;
    }, interval);

    return () => window.clearInterval(timer);
  }, [images, interval, prefersReducedMotion]);

  const animateZoom = zoom && !prefersReducedMotion;

  return (
    <div
      aria-hidden
      className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)}
    >
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-[1800ms] ease-in-out',
          animateZoom && showFront && 'animate-ambient-zoom'
        )}
        style={{
          ...bgStyle(images[frontIndex], opacity),
          opacity: showFront ? opacity : 0,
        }}
      />
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-[1800ms] ease-in-out',
          animateZoom && !showFront && 'animate-ambient-zoom'
        )}
        style={{
          ...bgStyle(images[backIndex], opacity),
          opacity: showFront ? 0 : opacity,
        }}
      />

      {overlay !== 'none' && (
        <div className={cn('absolute inset-0', OVERLAY_CLASSES[overlay])} />
      )}

      {glow && (
        <>
          <div
            className={cn(
              'absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl bg-blue-500/10',
              !prefersReducedMotion && 'animate-ambient-glow'
            )}
          />
          <div
            className={cn(
              'absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full blur-3xl bg-purple-500/10',
              !prefersReducedMotion && 'animate-ambient-glow-alt'
            )}
          />
        </>
      )}

      {particles && !prefersReducedMotion && <AmbientParticles />}
    </div>
  );
});

const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 71) % 100}%`,
  size: 2 + ((i * 13) % 4),
  duration: 14 + ((i * 7) % 12),
  delay: -((i * 5) % 20),
  hue: i % 2 === 0 ? 'bg-blue-400/25' : 'bg-purple-400/25',
}));

function AmbientParticles() {
  return (
    <div className="absolute inset-0">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className={cn('absolute rounded-full blur-[1px] animate-ambient-float', p.hue)}
          style={{
            left: p.left,
            bottom: '-8px',
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
