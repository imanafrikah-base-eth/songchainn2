/**
 * Making a picture small enough to actually arrive.
 *
 * A phone camera writes 4000 pixel, 8 megabyte files. Nothing on SONGCHAINN
 * shows a picture bigger than about 2000 pixels, so on a phone in Lusaka
 * every upload was spending most of its time sending detail that would be
 * thrown away on arrival. Shrinking first is the single thing that makes an
 * upload feel fast, and it costs a fraction of a second on the device.
 *
 * What it never does: touch a video, touch a file that is already small, or
 * quietly change a file it cannot read. When anything at all goes wrong, the
 * original is used, because a slow upload beats a broken one.
 */

/** Nothing here is displayed larger than this, so nothing needs to be. */
const MAX_EDGE = 2048;
/** Under this, the saving is not worth the wait. */
const SKIP_UNDER_BYTES = 400 * 1024;
/** Covers have to stay square and crisp, so they get more room. */
const COVER_EDGE = 1600;

function canShrink(file: File): boolean {
  if (typeof document === 'undefined') return false;
  if (!file.type.startsWith('image/')) return false;
  // A GIF is usually animated and a canvas would flatten it to one frame.
  if (file.type === 'image/gif') return false;
  return file.size > SKIP_UNDER_BYTES;
}

async function readImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('unreadable'));
      img.src = url;
    });
  } finally {
    // Revoked on the next tick so the decode that is already running finishes.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * A smaller version of the same picture, or the original when shrinking it
 * would not help or did not work.
 */
export async function shrinkImage(file: File, opts: { maxEdge?: number; quality?: number } = {}): Promise<File> {
  if (!canShrink(file)) return file;
  const maxEdge = opts.maxEdge ?? MAX_EDGE;
  const quality = opts.quality ?? 0.86;

  try {
    const img = await readImage(file);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest) return file;
    const scale = Math.min(1, maxEdge / longest);
    // Already small enough and already a modern format: leave it alone.
    if (scale === 1 && (file.type === 'image/webp' || file.size < 1_200_000)) return file;

    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    // Only take the new one when it is genuinely smaller. Re-encoding a
    // well-compressed picture can make it bigger, and sending the bigger one
    // would be worse than doing nothing.
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** A cover, kept square and crisp but no larger than it needs to be. */
export function shrinkCover(file: File): Promise<File> {
  return shrinkImage(file, { maxEdge: COVER_EDGE, quality: 0.9 });
}

/** How much was saved, for a line on screen. Empty when nothing changed. */
export function savedLabel(before: File, after: File): string {
  if (after === before || after.size >= before.size) return '';
  const pct = Math.round((1 - after.size / before.size) * 100);
  if (pct < 10) return '';
  return `${pct}% smaller, so it lands faster`;
}
