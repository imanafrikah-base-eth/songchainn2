/**
 * Where a photo sits inside a window, independent of screen size.
 *
 * The photo is scaled to cover the window (the way object-fit: cover does),
 * and (cx, cy) is the point of the photo, as a fraction of its width and
 * height, that sits at the centre of the window. 0.5 / 0.5 is centred.
 * `aspect` is the window's width divided by its height. Because none of it
 * is in pixels, the same crop survives a rotation or a different device.
 */
export interface PhotoCrop {
  cx: number;
  cy: number;
  aspect: number;
}

export const CENTRE_CROP: PhotoCrop = { cx: 0.5, cy: 0.5, aspect: 1 };

/** The part of an image of `nw` by `nh` that a crop shows, in image pixels. */
export function cropWindow(nw: number, nh: number, crop: PhotoCrop) {
  const aspect = crop.aspect > 0 ? crop.aspect : 1;
  let winW = nw;
  let winH = nw / aspect;
  if (winH > nh) {
    winH = nh;
    winW = nh * aspect;
  }
  const left = Math.min(Math.max(crop.cx * nw - winW / 2, 0), nw - winW);
  const top = Math.min(Math.max(crop.cy * nh - winH / 2, 0), nh - winH);
  return { left, top, width: winW, height: winH };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That image could not be read.'));
    img.src = url;
  });
}

/**
 * Cut the chosen window out of a photo and hand back a file ready to upload.
 * Output is `outputWidth` across, the height following the crop's aspect.
 * A circle crop is masked to a round PNG so it never shows corners.
 */
export async function cropImage(
  source: File | Blob,
  crop: PhotoCrop,
  opts: {
    outputWidth: number;
    circle?: boolean;
    mime?: 'image/jpeg' | 'image/png' | 'image/webp';
    quality?: number;
    fileName?: string;
  },
): Promise<File> {
  const url = URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) throw new Error('That image could not be read.');

    const aspect = opts.circle ? 1 : crop.aspect;
    const win = cropWindow(nw, nh, { ...crop, aspect });
    // Never upscale past the source: a phone photo cropped to a strip is
    // still limited by the pixels it has.
    const outW = Math.max(1, Math.min(opts.outputWidth, Math.round(win.width)));
    const outH = Math.max(1, Math.round(outW / (aspect > 0 ? aspect : 1)));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot crop images.');
    ctx.imageSmoothingQuality = 'high';
    if (opts.circle) {
      ctx.beginPath();
      ctx.arc(outW / 2, outH / 2, Math.min(outW, outH) / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }
    ctx.drawImage(img, win.left, win.top, win.width, win.height, 0, 0, outW, outH);

    const mime = opts.mime ?? (opts.circle ? 'image/png' : 'image/jpeg');
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, opts.quality ?? 0.9));
    if (!blob) throw new Error('The crop could not be saved.');
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const base = (opts.fileName ?? 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.${ext}`, { type: mime });
  } finally {
    URL.revokeObjectURL(url);
  }
}
