import { cn } from '@/lib/utils';

/**
 * The one "New" mark, everywhere a record or catalogue is new.
 *
 * It never wraps and never shrinks: beside a long title that is being cut
 * short, the old pills were squeezed until the word broke across two lines.
 */
export function NewBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center whitespace-nowrap rounded-md bg-primary px-1.5 text-[10px] font-bold uppercase leading-none tracking-wider text-primary-foreground',
        className,
      )}
    >
      New
    </span>
  );
}

export default NewBadge;
