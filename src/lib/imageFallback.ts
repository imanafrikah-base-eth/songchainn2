/**
 * Global image fallback.
 *
 * The app renders ~100 <img> tags and only a handful handled onError, so any
 * single bad URL painted the browser's broken-image glyph: a torn page icon
 * with alt text next to it. That one glyph does more damage to how finished an
 * app feels than almost anything else, because real apps never show it.
 *
 * `error` does not bubble, but it does capture, so a single capture-phase
 * listener on the document catches every image failure in the app, including
 * ones in components that have not been written yet.
 *
 * Anything that already handles its own onError still works: React's handler
 * runs too, and if it swaps the element out entirely, this placeholder simply
 * never gets seen.
 */

const HANDLED = 'data-img-fallback';

/**
 * Neutral placeholder tile, inline so it can never itself fail to load.
 * Colours are the resting card surface and muted foreground from index.css,
 * so it reads as an empty slot rather than an error.
 */
const PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <rect width="120" height="120" fill="#1A1B1E"/>
      <g fill="none" stroke="#5A5D64" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M50 74V42l26-6v32"/>
      </g>
      <g fill="#5A5D64">
        <ellipse cx="43.5" cy="74" rx="7.5" ry="6.5"/>
        <ellipse cx="69.5" cy="68" rx="7.5" ry="6.5"/>
      </g>
    </svg>`.replace(/\s+/g, ' ')
  );

function onImageError(event: Event) {
  const el = event.target as HTMLElement | null;
  if (!el || el.tagName !== 'IMG') return;

  const img = el as HTMLImageElement;

  // Never loop: one swap per element, and never re-enter on the placeholder.
  if (img.hasAttribute(HANDLED)) return;
  img.setAttribute(HANDLED, '');

  img.src = PLACEHOLDER;
  // The alt text is what renders beside a broken glyph. Once we have a tile,
  // the tile is the message, so keep the element decorative for screen readers
  // rather than announcing a filename that failed.
  img.alt = '';
  img.removeAttribute('srcset');
  img.removeAttribute('sizes');
  img.style.objectFit = 'cover';
}

let installed = false;

/** Call once, before the app renders. */
export function installImageFallback() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('error', onImageError, true); // capture: error does not bubble
}

export const IMAGE_PLACEHOLDER = PLACEHOLDER;
