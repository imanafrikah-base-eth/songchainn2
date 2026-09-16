import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * The little "i" beside a thing that needs a word of explanation.
 *
 * Not everybody using SONGCHAINN knows what a pulse is, what points are for,
 * or why a room has a key. An icon on its own is a guess, and most people do
 * not guess, they leave (founder, 16 Sep 2026).
 *
 * It opens on a tap as well as a hover, because a phone has no hover, and that
 * is the whole reason tooltips fail the people this is for. One sentence,
 * plain words, no jargon.
 */
export function Hint({
  label,
  children,
  className,
  side = 'top',
}: {
  /** What this explains, for screen readers: "What Hot Today means". */
  label: string;
  /** One sentence. Two at the very most. */
  children: ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className={[
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground',
            'transition-colors hover:bg-white/10 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
            className ?? '',
          ].join(' ')}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        className="w-64 border-white/10 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export default Hint;
