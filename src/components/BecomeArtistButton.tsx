import { Loader2, Mic2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useBecomeArtist } from '@/hooks/useBecomeArtist';
import { cn } from '@/lib/utils';

/**
 * The one door a fan sees toward the artist side of SONGCHAINN.
 *
 * Fans never get artist tools (Studio, world builder, launcher, gallery) put in
 * front of them. Wherever a fan would have met one of those, they meet this
 * instead: one tap turns their account into an artist account and opens the
 * Studio (founder, 15 Sep 2026).
 */
export function BecomeArtistButton({
  label = 'I make music, become an artist',
  className,
  variant = 'default',
  size = 'sm',
  to,
}: {
  label?: string;
  className?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  /** Where to land after, the Studio by default. */
  to?: string;
}) {
  const { becomeArtist, pending } = useBecomeArtist();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pending}
      onClick={() => void becomeArtist({ to })}
      className={cn('gap-1.5 rounded-full', className)}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic2 className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}

export default BecomeArtistButton;
