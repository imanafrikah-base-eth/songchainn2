/**
 * Route a texture through our own origin so WebGL will accept it.
 *
 * See api/img.ts for why. Short version: R2 sends no CORS headers, an <img>
 * does not care, WebGL very much does.
 *
 * Only 3D rooms call this. Flat pages keep hitting R2 directly.
 */

/** Hosts that genuinely need the detour. Anything else is left alone. */
const NEEDS_PROXY = /^https:\/\/pub-[a-z0-9]+\.r2\.dev\//i;

export function proxied(src: string): string {
  if (!src) return src;
  // Already ours, or a data URI, or a relative path: no detour needed.
  if (src.startsWith('/') || src.startsWith('data:') || src.startsWith('blob:')) return src;
  if (!NEEDS_PROXY.test(src)) return src;
  return `/api/img?u=${encodeURIComponent(src)}`;
}
