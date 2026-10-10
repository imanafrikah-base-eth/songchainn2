import { cn } from '@/lib/utils';

/**
 * The little bouncing bars beside whatever is playing, the way Spotify and
 * Apple Music mark it. Four bars in the text colour, each on its own beat;
 * they settle low and still when the music pauses. Pure CSS, so a long list
 * of songs costs nothing extra, and people who asked their device for less
 * motion get still bars.
 */
const BEATS = [
  { delay: '0ms', duration: '900ms' },
  { delay: '-300ms', duration: '700ms' },
  { delay: '-600ms', duration: '1100ms' },
  { delay: '-150ms', duration: '800ms' },
];

export function NowPlayingBars({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex h-3 w-3.5 flex-shrink-0 items-end gap-[2px] text-primary', className)}
    >
      {BEATS.map((b, i) => (
        <span
          key={i}
          className={cn('now-playing-bar w-[2px] rounded-full bg-current', playing ? 'is-playing' : '')}
          style={{ animationDelay: b.delay, animationDuration: b.duration }}
        />
      ))}
    </span>
  );
}
