/**
 * Two small guards that run once, before anything renders.
 *
 * Media protection. An artist's pictures and clips are theirs. Nothing on
 * the web makes a file impossible to copy, but the ordinary doors are shut:
 * no right-click or long-press save on any image or video, no download
 * button on video controls, no picture-in-picture. Where an artist has said
 * downloads are fine, the app marks that element with data-download-ok and
 * these guards step aside for it.
 *
 * The way back. A phone leaves the app to approve a wallet connection in the
 * wallet's own app. Some wallets bring the person back to the page they left,
 * some drop them on the home page. Before leaving, the app writes down where
 * it was; on the next load, if the person landed on home with that note
 * still fresh, they are put back where they were before the router reads
 * the address.
 */

const RETURN_KEY = 'songchainn_return_to';
const RETURN_TTL_MS = 15 * 60_000;

function allowed(el: Element | null): boolean {
  return !!el && !!el.closest('[data-download-ok]');
}

export function installMediaProtection(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener(
    'contextmenu',
    (e) => {
      const t = e.target as Element | null;
      if (t && (t.closest('img, video, picture') || t.closest('[data-protect]')) && !allowed(t)) e.preventDefault();
    },
    true,
  );
  document.addEventListener(
    'dragstart',
    (e) => {
      const t = e.target as Element | null;
      if (t && t.closest('img, video') && !allowed(t)) e.preventDefault();
    },
    true,
  );
  // Video controls grow a download button on some browsers; take it off the
  // moment a video is about to play, unless the artist allowed it.
  const strip = (e: Event) => {
    const v = e.target as HTMLVideoElement | null;
    if (!v || v.tagName !== 'VIDEO' || allowed(v)) return;
    v.setAttribute('controlslist', 'nodownload noremoteplayback');
    v.disablePictureInPicture = true;
  };
  document.addEventListener('play', strip, true);
  document.addEventListener('loadedmetadata', strip, true);
}

/** Call right before leaving for a wallet app. */
export function rememberReturnPath(): void {
  try {
    const here = window.location.pathname + window.location.search;
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path: here, at: Date.now() }));
  } catch {
    /* storage blocked: the person lands wherever the wallet sends them */
  }
}

/** Call once at boot, before the router mounts. */
export function restoreReturnPath(): void {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return;
    const { path, at } = JSON.parse(raw) as { path?: string; at?: number };
    sessionStorage.removeItem(RETURN_KEY);
    if (!path || typeof at !== 'number' || Date.now() - at > RETURN_TTL_MS) return;
    if (!path.startsWith('/') || path.startsWith('//')) return;
    const here = window.location.pathname + window.location.search;
    // Only step in when the wallet dropped the person on the front door.
    if ((window.location.pathname === '/' || window.location.pathname === '') && here !== path) {
      window.history.replaceState(null, '', path);
    }
  } catch {
    /* nothing to restore */
  }
}
