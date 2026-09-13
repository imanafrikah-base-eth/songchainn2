import { cn } from '@/lib/utils';
import { thumb } from '@/lib/img';

interface SongArtProps {
  isPlaying?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  coverImage?: string;
}

const sizeClasses = {
  sm: 'w-10 h-10',
  md: 'w-12 h-12',
  lg: 'w-14 h-14',
  xl: 'w-full h-full',
};

/** CSS width of each slot, for thumb(). xl fills a card, which tops out near 384. */
const slotPx = { sm: 40, md: 48, lg: 56, xl: 384 } as const;

export function SpinningSongArt({ isPlaying = false, size = 'md', className, coverImage }: SongArtProps) {
  return (
    <div
      className={cn(
        'rounded-xl overflow-hidden flex-shrink-0',
        sizeClasses[size],
        className,
      )}
    >
      {coverImage ? (
        <img
          /* Was the raw R2 cover (1 to 2 MB) in a 48 px player chip, mounted on every page including the signed-out landing. */
          src={thumb(coverImage, slotPx[size])}
          alt=""
          decoding="async"
          className={cn(
            'w-full h-full object-cover',
            isPlaying && 'animate-spin [animation-duration:3s]',
          )}
        />
      ) : (
        <div
          className={cn(
            'w-full h-full bg-gradient-to-br from-primary to-primary/50',
            isPlaying && 'animate-spin [animation-duration:3s]',
          )}
        />
      )}
    </div>
  );
}
