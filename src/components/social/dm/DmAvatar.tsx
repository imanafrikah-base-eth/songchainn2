import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A round face for a conversation. Falls back to the first letter of the name
 * when there is no picture, or when the picture fails to load.
 */
export function DmAvatar({
  src,
  name,
  size = 44,
  className,
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').trim().slice(0, 1).toUpperCase() || '?';
  const style = { width: size, height: size };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        style={style}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('shrink-0 rounded-full bg-muted object-cover', className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.max(11, Math.round(size * 0.4)) }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground',
        className,
      )}
    >
      {initial}
    </span>
  );
}
