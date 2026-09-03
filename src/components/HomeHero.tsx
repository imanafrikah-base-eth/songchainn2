import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The first thing on Home.
 *
 * The page used to open with a headline, a paragraph and three icon-and-text
 * blocks, which is the anatomy of a flyer. A music app opens with music. This
 * is one record, at size, full bleed to the edges of the screen, with its own
 * artwork supplying the colour.
 *
 * The blurred copy of the cover behind the crisp one is the Apple Music
 * pattern: it fills any aspect ratio, it never crops the art badly, and the
 * colour on screen comes from the record itself rather than from the theme.
 */

export interface HeroFeature {
  id: string;
  title: string;
  artist: string;
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
}

export const HomeHero = memo(function HomeHero({ feature, onPlay, faces = [] }: HomeHeroProps) {
  const art = feature.coverImage;
  const href = feature.href ?? `/catalog/${feature.id}`;

  return (
    <section
      aria-label="Featured release"
      className="relative -mx-4 sm:-mx-6 lg:-mx-8 mb-7 sm:mb-10"
    >
      <div className="relative overflow-hidden">
        {/* Backdrop: the record's own artwork, out of focus. */}
        {art ? (
          <img
            src={art}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl opacity-45"
          />
        ) : (
          <div className="absolute inset-0 bg-secondary" />
        )}
        {/* Scrim so the type stays legible and the section melts into the page. */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/30 to-background" />

        <div className="relative flex flex-col items-center gap-5 px-6 pb-8 pt-10 text-center sm:flex-row sm:items-end sm:gap-7 sm:px-8 sm:pb-10 sm:text-left lg:px-10">
          <Link
            to={href}
            className="block shrink-0 focus-ring rounded-xl"
            aria-label={`${feature.title} by ${feature.artist}`}
          >
            {art ? (
              <img
                src={art}
                alt=""
                className="h-44 w-44 rounded-xl object-cover shadow-float sm:h-52 sm:w-52"
                /* eager: this is the largest paint on the page, never lazy it */
                loading="eager"
                decoding="async"
              />
            ) : (
              <div className="h-44 w-44 rounded-xl bg-secondary sm:h-52 sm:w-52" />
            )}
          </Link>

          <div className="min-w-0 flex-1">
            {feature.label ? (
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {feature.label}
              </p>
            ) : null}
            <h1 className="mt-1.5 truncate font-heading text-2xl font-semibold leading-tight text-foreground sm:text-3xl lg:text-4xl">
              {feature.title}
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground sm:text-base">
              {feature.artist}
            </p>

            <div className="mt-5 flex items-center justify-center gap-2.5 sm:justify-start">
              <Button
                size="lg"
                onClick={onPlay}
                className="h-11 rounded-full px-7 text-sm font-semibold"
              >
                <Play className="mr-2 h-4 w-4 fill-current" />
                Play
              </Button>
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="h-11 rounded-full px-6 text-sm font-semibold"
              >
                <Link to={href}>View</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {faces.length > 0 ? (
        <div className="mt-1 px-4 sm:px-6 lg:px-8">
          <ul className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
            {faces.map((f) => (
              <li key={f.id} className="w-16 shrink-0 text-center sm:w-[4.5rem]">
                <Link to={`/artist/${f.id}`} className="group block focus-ring rounded-full">
                  {f.image ? (
                    <img
                      src={f.image}
                      alt=""
                      className="h-16 w-16 rounded-full object-cover transition-transform group-hover:scale-105 sm:h-[4.5rem] sm:w-[4.5rem]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-secondary sm:h-[4.5rem] sm:w-[4.5rem]" />
                  )}
                  <span className="mt-1.5 block truncate text-[11px] text-muted-foreground">
                    {f.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
});
