import { CONSENT_LINES } from '@/legal/policies';

/**
 * The one line that has to be read at the moment somebody does the thing.
 *
 * These lines were written and then never shown anywhere, so the Terms
 * described a point-of-action consent the app never asked for. A consent
 * buried in a document accepted months ago is not consent to the thing being
 * done right now, which is the whole reason these exist separately.
 *
 * Deliberately plain and deliberately not dismissible. It sits directly above
 * the button that does the thing, because a warning somebody has to go looking
 * for is a warning written for us rather than for them.
 */
export function ConsentNotice({
  which,
  className = '',
}: {
  which: keyof typeof CONSENT_LINES | string;
  className?: string;
}) {
  const line = CONSENT_LINES[which];
  if (!line) return null;

  return (
    <p
      className={
        'rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground ' +
        className
      }
    >
      {line}
    </p>
  );
}
