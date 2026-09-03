/**
 * The SONGCHAINN mark. Deliberately not the artist tick.
 *
 * The blue tick answers "is this really that artist". This answers "is this the
 * platform speaking", which is a different claim and a more dangerous one to
 * counterfeit: a post carrying the platform's authority is exactly the thing
 * somebody would want to fake, so it must not be possible to mistake one for
 * the other at a glance.
 *
 * So it is a different SHAPE, not a different colour. Colour alone fails for
 * anyone who cannot distinguish the two hues, and it fails at small sizes for
 * everybody. A shield reads as authority where a tick reads as identity, and
 * the two are still telling apart in greyscale.
 */
export function OfficialBadge({
  size = 18,
  withLabel = false,
}: {
  size?: number;
  withLabel?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label="Official SONGCHAINN account"
        className="shrink-0"
      >
        <title>Official SONGCHAINN account</title>
        {/* Shield, not a circle. */}
        <path
          d="M12 2.2 4.6 5.3v6.1c0 4.6 3.1 8.6 7.4 10.4 4.3-1.8 7.4-5.8 7.4-10.4V5.3L12 2.2Z"
          fill="hsl(var(--primary))"
        />
        <path
          d="M12 2.2 4.6 5.3v6.1c0 4.6 3.1 8.6 7.4 10.4 4.3-1.8 7.4-5.8 7.4-10.4V5.3L12 2.2Z"
          fill="none"
          stroke="hsl(var(--background))"
          strokeWidth="1.1"
        />
        {/* A sound wave rather than a tick, because this is a music platform
            and the mark should say which one. */}
        <path
          d="M8.2 12h1.3l1.2-3.1 1.6 6.2 1.2-3.1h1.5"
          fill="none"
          stroke="hsl(var(--background))"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withLabel && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          Official
        </span>
      )}
    </span>
  );
}
