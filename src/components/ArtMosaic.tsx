import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { ARTISTS, SONGS } from '@/data/musicData';

/**
 * Real pictures where there used to be only words.
 *
 * ArtMosaic is a drifting strip of actual record covers from the catalog;
 * ArtistFaces is the artists themselves. Both are decoration for a section
 * that has a point to make, so they stay quiet: no captions, no links, and
 * hidden from screen readers. The order is fixed per page load so the strip
 * does not reshuffle under somebody's eyes.
 */

function pick<T>(list: T[], n: number, seed: number): T[] {
  const out: T[] = [];
  const used = new Set<number>();
  let x = seed || 1;
  while (out.length < Math.min(n, list.length)) {
    x = (x * 9301 + 49297) % 233280;
    const i = Math.floor((x / 233280) * list.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(list[i]);
  }
  return out;
}

export function useCoverArt(count: number, seed = 7): string[] {
  const { songs } = usePublishedCatalog();
  return useMemo(() => {
    const pool = (songs.length ? songs : SONGS).map((s) => s.coverImage).filter((u): u is string => Boolean(u));
    const unique = [...new Set(pool)];
    return pick(unique, count, seed);
  }, [songs, count, seed]);
}

export function ArtMosaic({
  count = 14,
  seed = 7,
  size = 'md',
  drift = true,
  className = '',
}: {
  count?: number;
  seed?: number;
  size?: 'sm' | 'md' | 'lg';
  /** Slide slowly sideways. Off under reduced motion by CSS. */
  drift?: boolean;
  className?: string;
}) {
  const covers = useCoverArt(count, seed);
  if (!covers.length) return null;
  const tile = size === 'sm' ? 'h-12 w-12' : size === 'lg' ? 'h-24 w-24 sm:h-28 sm:w-28' : 'h-16 w-16 sm:h-20 sm:w-20';
  const row = [...covers, ...covers];
  return (
    <div className={`pointer-events-none select-none overflow-hidden ${className}`} aria-hidden="true">
      <div className={`flex w-max gap-2 ${drift ? 'motion-safe:animate-[drift_60s_linear_infinite]' : ''}`}>
        {row.map((src, i) => (
          <img key={`${src}-${i}`} src={src} alt="" loading="lazy" decoding="async" className={`${tile} shrink-0 rounded-lg object-cover shadow-md shadow-black/40`} />
        ))}
      </div>
    </div>
  );
}

/** A row of the artists' own faces, overlapping the way a guest list does. */
export function ArtistFaces({ count = 8, className = '', size = 'md' }: { count?: number; className?: string; size?: 'sm' | 'md' }) {
  const faces = useMemo(() => ARTISTS.filter((a) => a.profileImage).slice(0, count), [count]);
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10 sm:h-12 sm:w-12';
  if (!faces.length) return null;
  return (
    <div className={`flex ${className}`} aria-hidden="true">
      {faces.map((a, i) => (
        <img
          key={a.id}
          src={a.profileImage}
          alt=""
          loading="lazy"
          decoding="async"
          className={`${dim} rounded-full border-2 border-background object-cover ${i ? '-ml-3' : ''}`}
        />
      ))}
    </div>
  );
}

/** A card with a real picture behind its words. */
export function PictureCard({
  image,
  video,
  title,
  line,
  to,
  cta,
  className = '',
  children,
}: {
  image: string;
  video?: string;
  title: string;
  line: string;
  to?: string;
  cta?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <>
      <img src={image} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
      {video && (
        <video src={video} poster={image} muted loop playsInline autoPlay preload="none" className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
      <div className="relative flex h-full flex-col justify-end p-4">
        <p className="font-heading text-lg font-bold leading-tight text-white drop-shadow">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-white/80 drop-shadow">{line}</p>
        {cta && <span className="mt-2 inline-flex items-center text-xs font-semibold text-white">{cta} <span aria-hidden="true">&nbsp;›</span></span>}
        {children}
      </div>
    </>
  );
  const cls = `group relative block min-h-[11rem] overflow-hidden rounded-2xl border border-border bg-black ${className}`;
  return to ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}
