/**
 * Size-appropriate images and polite video, for listeners on mobile data.
 *
 * The catalog's covers live on R2 at full size: 1.5 to 2.4 MB each, and a
 * 4 MB photograph here and there. A 64 px tile in a list was downloading all
 * of that. An artist page came to about 25 MB before a single note played.
 *
 * `thumb()` sends a picture through Vercel's own Image Optimization
 * (`/_vercel/image`, switched on by the `images` block in vercel.json), which
 * resizes it to the slot, re-encodes it at quality 70 and serves WebP to any
 * browser that asks for it. The widths here MUST be listed in
 * vercel.json images.sizes, and every host must match images.remotePatterns,
 * or Vercel answers 400.
 *
 * If the optimizer ever refuses (quota, an unlisted host, a local dev server
 * where the endpoint does not exist), src/lib/imageFallback.ts sees the error,
 * pulls the original address back out of the query string and loads that, so
 * the worst case is the old behaviour, never a hole.
 *
 * Full size stays where somebody is actually looking at the picture: the song
 * page hero and the full-screen viewer. Those call nothing here.
 */

/** Must match vercel.json images.sizes exactly. */
export const THUMB_WIDTHS = [96, 192, 384, 640, 828, 1080] as const;

export const THUMB_QUALITY = 70;

const OPTIMIZABLE_HOST = /^(pub-[a-z0-9]+\.r2\.dev|wsjhbfmzbonxmxaaassu\.supabase\.co|(www\.)?songchainn\.xyz)$/i;

/** Only on the deployed site: the endpoint does not exist on a dev server or inside the Android shell. */
function optimizerAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return /(^|\.)songchainn\.xyz$/i.test(host) || /\.vercel\.app$/i.test(host);
}

/** The smallest listed width that covers the slot at the screen's density (capped at 2x). */
function pickWidth(cssPx: number): number {
  const dpr = typeof window !== 'undefined' ? Math.min(2, Math.max(1, window.devicePixelRatio || 1)) : 2;
  const need = Math.ceil(cssPx * dpr);
  return THUMB_WIDTHS.find((w) => w >= need) ?? THUMB_WIDTHS[THUMB_WIDTHS.length - 1];
}

/**
 * A resized address for a picture shown `cssPx` wide (its CSS width in the
 * layout, not device pixels). Anything it cannot optimise comes back as it
 * went in: data URLs, blob URLs, bundled assets, unknown hosts, gifs (which
 * would lose their motion).
 */
export function thumb(src: string | null | undefined, cssPx: number): string | undefined {
  if (!src) return undefined;
  if (!optimizerAvailable()) return src;
  let url: URL;
  try {
    url = new URL(src, window.location.href);
  } catch {
    return src;
  }
  if (url.protocol !== 'https:' || !OPTIMIZABLE_HOST.test(url.hostname)) return src;
  if (/\.(gif|svg)(\?|$)/i.test(url.pathname)) return src;
  if (url.pathname.startsWith('/_vercel/image')) return src;
  // A picture on our own origin is passed as a path, which is how Vercel expects local images.
  const target = url.origin === window.location.origin ? `${url.pathname}${url.search}` : url.toString();
  return `/_vercel/image?url=${encodeURIComponent(target)}&w=${pickWidth(cssPx)}&q=${THUMB_QUALITY}`;
}

/** The original address behind a thumb() URL, or null when it is not one. */
export function originalOf(optimized: string): string | null {
  const at = optimized.indexOf('/_vercel/image?');
  if (at === -1) return null;
  try {
    const u = new URL(optimized, 'https://x.invalid');
    const raw = u.searchParams.get('url');
    if (!raw) return null;
    return raw.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${raw}` : raw;
  } catch {
    return null;
  }
}

/**
 * For an <img onError>: false while the global fallback is still retrying the
 * original file behind a resized copy, true once the picture has really
 * failed. Without this, a component that hides its image on error would hide
 * it before the original ever got its chance.
 */
export function reallyBroken(event: { currentTarget: HTMLImageElement }): boolean {
  return event.currentTarget.hasAttribute('data-img-fallback') || !event.currentTarget.hasAttribute('data-img-original-retry');
}

type Connection = { saveData?: boolean; effectiveType?: string };

/**
 * May this visitor be sent a decorative video at all?
 *
 * No when they asked for reduced motion, turned on Save-Data, or the browser
 * reports a 2g or 3g connection. Browsers without the Network Information API
 * (Safari, Firefox) report nothing, so they are judged on motion alone and the
 * video still only starts once it is on screen.
 */
export function decorativeVideoAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  } catch {
    return false;
  }
  const conn = (navigator as Navigator & { connection?: Connection }).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType && /^(slow-2g|2g|3g)$/.test(conn.effectiveType)) return false;
  return true;
}
