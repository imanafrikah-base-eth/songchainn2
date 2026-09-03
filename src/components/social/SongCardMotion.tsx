import { motion } from 'framer-motion';
import { Music } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { SongCardData, SongCardStyleId } from '@/types/social';

/**
 * A song card that moves.
 *
 * This is the audience's "video": no file, no upload, no bytes in a bucket.
 * The card is a handful of fields and the app draws and animates it, which is
 * why anybody can make one without opening a hole for arbitrary media.
 *
 * One component draws it in the maker and in the feed, so what somebody builds
 * is exactly what everybody else sees.
 */

export type { SongCardData, SongCardStyleId } from '@/types/social';

export const SONGCARD_STYLES: { id: SongCardStyleId; label: string }[] = [
  { id: 'pulse', label: 'Pulse' },
  { id: 'spin', label: 'Spin' },
  { id: 'drift', label: 'Drift' },
  { id: 'still', label: 'Still' },
];

/** Anything not in the list falls back to a card that simply sits there. */
const isStyle = (v: unknown): v is SongCardStyleId =>
  typeof v === 'string' && SONGCARD_STYLES.some((s) => s.id === v);

export function normaliseSongCard(raw: unknown): SongCardData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== 'string' || typeof r.artist !== 'string') return null;
  return {
    songId: String(r.songId ?? ''),
    title: r.title,
    artist: r.artist,
    coverImage: typeof r.coverImage === 'string' ? r.coverImage : null,
    style: isStyle(r.style) ? r.style : 'still',
    caption: typeof r.caption === 'string' ? r.caption : '',
  };
}

export function SongCardMotion({ card, large = false }: { card: SongCardData; large?: boolean }) {
  const reduced = usePrefersReducedMotion();

  // Respect the system setting. Somebody who has asked their phone to stop
  // animating things has asked us too, and a looping card is exactly the kind
  // of motion that setting exists for.
  const art =
    reduced || card.style === 'still'
      ? {}
      : card.style === 'spin'
        ? { rotate: 360 }
        : card.style === 'pulse'
          ? { scale: [1, 1.05, 1] }
          : { y: [0, -8, 0] };

  const transition =
    reduced || card.style === 'still'
      ? undefined
      : card.style === 'spin'
        ? { duration: 8, repeat: Infinity, ease: 'linear' as const }
        : { duration: card.style === 'pulse' ? 2 : 3.5, repeat: Infinity, ease: 'easeInOut' as const };

  return (
    <div
      className={`relative flex aspect-[3/4] w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-neutral-900 to-black ${
        large ? 'p-6' : 'p-4'
      }`}
    >
      {/* A soft wash of the artwork behind, so every card takes its colour from
          the record rather than from a palette we chose. */}
      {card.coverImage && (
        <img
          src={card.coverImage}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl"
        />
      )}

      <motion.div
        animate={art}
        transition={transition}
        className={`relative overflow-hidden rounded-xl shadow-2xl ${
          card.style === 'spin' ? 'rounded-full' : ''
        } ${large ? 'h-44 w-44' : 'h-28 w-28'}`}
      >
        {card.coverImage ? (
          <img src={card.coverImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-primary/20">
            <Music className={large ? 'h-16 w-16 text-primary/70' : 'h-10 w-10 text-primary/70'} />
          </span>
        )}
      </motion.div>

      <div className="relative mt-4 w-full text-center">
        <p className={`truncate font-semibold text-white ${large ? 'text-lg' : 'text-sm'}`}>
          {card.title}
        </p>
        <p className={`truncate text-white/60 ${large ? 'text-sm' : 'text-xs'}`}>{card.artist}</p>
        {card.caption && (
          <p className={`mt-3 line-clamp-3 text-white/90 ${large ? 'text-base' : 'text-xs'}`}>
            {card.caption}
          </p>
        )}
      </div>

      <span className="absolute bottom-2 right-3 text-[9px] uppercase tracking-widest text-white/30">
        SONGCHAINN
      </span>
    </div>
  );
}
