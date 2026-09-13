import { useState } from "react";

/**
 * A person's round profile picture, or their initial when there is none.
 *
 * The global image fallback (src/lib/imageFallback.ts) swaps any broken image
 * for a neutral tile first; this component then drops the image altogether and
 * shows the initial, which reads as a person rather than an empty slot.
 */
export function ParticipantPhoto({
  url,
  name,
  className = "",
}: {
  url?: string | null;
  name?: string | null;
  /** Size and text size classes, e.g. "h-8 w-8 text-xs". */
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!url && failedUrl !== url;
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-bold text-foreground ${className}`}
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <span aria-hidden>{initial}</span>
      )}
    </div>
  );
}

export default ParticipantPhoto;
