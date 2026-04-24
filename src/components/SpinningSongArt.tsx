import { cn } from '@/lib/utils';

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
          src={coverImage}
          alt=""
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
