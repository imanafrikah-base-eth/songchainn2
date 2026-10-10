import { artistPath } from '@/lib/slugRoutes';
import { memo, useState, type ImgHTMLAttributes } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArtistName } from '@/components/ArtistName';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { thumb } from '@/lib/img';
import { ScrollRail } from '@/components/ScrollRail';
import { useArtworkColor } from '@/hooks/useArtworkColor';
import { cn } from '@/lib/utils';

/**
 * The first thing on Home, and on the landing page for a visitor.
 *
 * The page used to open with a headline, a paragraph and three icon-and-text
 * blocks, which is the anatomy of a flyer. A music app opens with music. This
 * is one record, at size, full bleed to the edges of the screen, with its own
 * artwork supplying the colour.
 *
 * 10 Oct 2026, the founder asked for a change people notice at first sight.
 *  - The top of the page takes the main colour of the cover (Spotify and Apple
 *    Music do this), and it changes when the record changes. Only colour that
 *    comes FROM the artwork may wash a page; that is the one exception to the
 *    neutral palette rule (see src/index.css).
 *  - An entrance: the cover eases up into place, the words follow, the artist
 *    faces ripple in one after another.
 *  - A face whose song is playing in the Room right now wears a slowly turning
 *    ring.
 *  - Pictures sit on a soft loading surface and fade in, so the hero never
 *    shows a black hole while a cover is on its way (the founder saw exactly
 *    that on 10 Oct: a new cover took 5 s through the optimizer the first time).
 */

export interface HeroFeature {
  id: string;
  title: string;
  artist: string;
  /** The catalog artist id, so the verification mark can travel with the name. */
  artistId?: string;
  coverImage?: string;
  /** Small line above the title: "New release", "Hot today", ... */
  label?: string;
  /** Where tapping the artwork goes. */
  href?: string;
}

interface HomeHeroProps {
  feature: HeroFeature;
  onPlay?: () => void;
  /** Circular artist avatars under the hero. Real faces, not icons. */
  faces?: Array<{ id: string; name: string; image?: string }>;
  /** The artist whose song is playing in the Room this minute, if any. */
  liveArtistId?: string | null;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** An image that waits on a soft surface and fades in, instead of popping or leaving a hole. */
function FadeImg({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      {...props}
      // A picture already in the cache can finish before React listens for
      // load, and it would sit invisible forever. Look on mount as well.
      ref={(el) => {
        if (!el || loaded) return;
        if (el.complete && el.naturalWidth > 0) {
          setLoaded(true);
          return;
        }
        // The browser's own listener, so a load can never slip past React.
        el.addEventListener('load', () => setLoaded(true), { once: true });
      }}
      onLoad={(e) => {
        setLoaded(true);
        props.onLoad?.(e);
      }}
      // Never hide a picture behind a failed fade: the global fallback retries
      // it, and if that fails too the surface underneath shows, not a hole.
      onError={(e) => {
        setLoaded(true);
        props.onError?.(e);
      }}
      className={cn('transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0', className)}
    />
  );
}

export const HomeHero = memo(function HomeHero({ feature, onPlay, faces = [], liveArtistId }: HomeHeroProps) {
  const art = feature.coverImage;
  const href = feature.href ?? `/catalog/${feature.id}`;
  const { color } = useArtworkColor(art);
  const calm = useReducedMotion();

  const rise = (delay: number) =>
    calm
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: EASE },
        };

  return (
    <section
      aria-label="Featured release"
      className="relative -mx-4 sm:-mx-6 lg:-mx-8 mb-7 sm:mb-10"
    >
      <div className="relative overflow-hidden">
        {/* Backdrop: the record's own artwork, out of focus. */}
        <div className="absolute inset-0 bg-secondary/60" />
        {art ? (
          <FadeImg
            /* Blurred to nothing, so a small copy looks identical and costs a fraction. */
            src={thumb(art, 96)}
            alt=""
            aria-hidden
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl !opacity-45"
          />
        ) : null}

        {/* The record's own colour, washing the top of the page. Cross-fades when the record changes. */}
        <AnimatePresence>
          {color ? (
            <motion.div
              key={color}
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: `linear-gradient(180deg, hsl(${color} / 0.62) 0%, hsl(${color} / 0.34) 40%, hsl(${color} / 0.08) 75%, transparent 100%)`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          ) : null}
        </AnimatePresence>

        {/* Scrim so the type stays legible and the section melts into the page. */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/25 to-background" />

        <div className="relative flex flex-col items-center gap-5 px-6 pb-8 pt-10 text-center sm:flex-row sm:items-end sm:gap-7 sm:px-8 sm:pb-10 sm:text-left lg:px-10">
          <motion.div
            className="shrink-0"
            {...(calm
              ? {}
              : {
                  initial: { opacity: 0, y: 28, scale: 0.92 },
                  animate: { opacity: 1, y: 0, scale: 1 },
                  transition: { duration: 0.75, ease: EASE },
                  whileHover: { scale: 1.03, rotate: -1 },
                  whileTap: { scale: 0.97 },
                })}
          >
            <Link
              to={href}
              className="relative block focus-ring rounded-xl"
              aria-label={`${feature.title} by ${feature.artist}`}
            >
              {art ? (
                <div
                  className="h-44 w-44 overflow-hidden rounded-xl bg-secondary sm:h-52 sm:w-52"
                  style={{
                    // The cover's own colour under it: the artwork exception, never a theme glow.
                    boxShadow: color
                      ? `0 24px 60px -18px hsl(${color} / 0.75), 0 8px 24px -12px rgb(0 0 0 / 0.6)`
                      : '0 8px 24px -12px rgb(0 0 0 / 0.6)',
                  }}
                >
                  <FadeImg
                    src={thumb(art, 208)}
                    alt=""
                    width={208}
                    height={208}
                    className="h-full w-full object-cover"
                    /* eager: this is the largest paint on the page, never lazy it */
                    loading="eager"
                    decoding="async"
                  />
                </div>
              ) : (
                <div className="h-44 w-44 rounded-xl bg-secondary sm:h-52 sm:w-52" />
              )}
            </Link>
          </motion.div>

          <div className="min-w-0 flex-1">
            {feature.label ? (
              <motion.p {...rise(0.15)} className="text-xs font-medium uppercase tracking-[0.14em] text-foreground/75">
                {feature.label}
              </motion.p>
            ) : null}
            <motion.h1
              {...rise(0.22)}
              className="mt-1.5 truncate font-heading text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl"
            >
              {feature.title}
            </motion.h1>
            <motion.p {...rise(0.3)} className="mt-1 truncate text-sm text-foreground/75 sm:text-base">
              <ArtistName name={feature.artist} artistId={feature.artistId} size={14} />
            </motion.p>

            <motion.div {...rise(0.38)} className="mt-5 flex items-center justify-center gap-2.5 sm:justify-start">
              <motion.div whileTap={calm ? undefined : { scale: 0.94 }} whileHover={calm ? undefined : { scale: 1.04 }}>
                <Button
                  size="lg"
                  onClick={onPlay}
                  className="h-12 rounded-full px-8 text-sm font-semibold"
                >
                  <Play className="mr-2 h-4 w-4 fill-current" />
                  Play
                </Button>
              </motion.div>
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="h-12 rounded-full px-6 text-sm font-semibold"
              >
                <Link to={href}>View</Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      {faces.length > 0 ? (
        <div className="mt-1 px-4 sm:px-6 lg:px-8">
          <ScrollRail label="Artists" listClassName="gap-4 pb-1 pt-1">
            {faces.map((f, i) => {
              const live = !!liveArtistId && f.id === liveArtistId;
              return (
                <motion.li
                  key={f.id}
                  className="w-16 shrink-0 text-center sm:w-[4.5rem]"
                  {...(calm
                    ? {}
                    : {
                        initial: { opacity: 0, y: 14, scale: 0.8 },
                        animate: { opacity: 1, y: 0, scale: 1 },
                        transition: { duration: 0.45, delay: 0.35 + Math.min(i, 12) * 0.05, ease: EASE },
                      })}
                >
                  <Link
                    to={artistPath(f.id)}
                    className="group block focus-ring rounded-full"
                    aria-label={live ? `${f.name}, playing in the Room now` : f.name}
                  >
                    <span className="relative mx-auto block h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]">
                      {live ? (
                        <span aria-hidden className="hero-live-ring absolute -inset-[3px] rounded-full" />
                      ) : null}
                      <span className="absolute inset-0 overflow-hidden rounded-full bg-secondary ring-2 ring-background">
                        {f.image ? (
                          <FadeImg
                            src={thumb(f.image, 72)}
                            alt=""
                            width={72}
                            height={72}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                            loading="eager"
                            decoding="async"
                          />
                        ) : null}
                      </span>
                    </span>
                    <span className={cn('mt-1.5 block truncate text-[11px]', live ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                      {f.name}
                    </span>
                  </Link>
                </motion.li>
              );
            })}
          </ScrollRail>
        </div>
      ) : null}
    </section>
  );
});
