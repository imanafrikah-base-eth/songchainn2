import { useEffect, useState } from 'react';

// Cache extracted colors (and failures, as null) so the same cover art is
// never re-sampled on repeat plays/re-renders.
const colorCache = new Map<string, string | null>();

function rgbToHslString(r: number, g: number, b: number): string {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  const hDeg = Math.round(h * 360);
  // Push saturation/lightness toward a usable glow accent rather than the raw average,
  // which otherwise skews muddy/desaturated for most photographic cover art.
  const sPct = Math.round(Math.min(100, s * 100 * 1.2));
  const lPct = Math.round(Math.min(65, Math.max(40, l * 100)));
  return `${hDeg} ${sPct}% ${lPct}%`;
}

function extractDominantColor(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 16;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const rr = data[i], gg = data[i + 1], bb = data[i + 2];
          const max = Math.max(rr, gg, bb);
          const min = Math.min(rr, gg, bb);
          const lightness = (max + min) / 2 / 255;
          const saturation = max === min ? 0 : (max - min) / 255;
          // Skip near-black/near-white/low-saturation pixels so the result is a
          // punchy accent rather than a muddy gray average.
          if (lightness < 0.08 || lightness > 0.92 || saturation < 0.15) continue;
          r += rr; g += gg; b += bb; count++;
        }
        if (count === 0) {
          for (let i = 0; i < data.length; i += 4) {
            r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
          }
        }
        if (count === 0) { resolve(null); return; }

        resolve(rgbToHslString(r / count, g / count, b / count));
      } catch {
        // Tainted canvas (CORS-blocked image) or other read failure.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/** Converts an "H S% L%" string (as returned by this hook) to an "R, G, B" triplet for rgba()/framer-motion use. */
export function hslToRgbTriplet(hsl: string): string {
  const [hStr, sStr, lStr] = hsl.split(' ');
  const h = parseFloat(hStr);
  const s = parseFloat(sStr) / 100;
  const l = parseFloat(lStr) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  return `${R}, ${G}, ${B}`;
}

/**
 * Extracts a representative accent color (as an "H S% L%" string, ready to
 * drop into `hsl(var(--artwork-glow))`) from a song's cover art. Returns
 * `color: null` while loading, on extraction failure, or when CORS blocks
 * pixel reads — callers should treat null as "use the default theme glow."
 */
export function useArtworkColor(coverImage?: string | null) {
  const [color, setColor] = useState<string | null>(() =>
    coverImage ? colorCache.get(coverImage) ?? null : null
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!coverImage) {
      setColor(null);
      setIsLoading(false);
      return;
    }
    if (colorCache.has(coverImage)) {
      setColor(colorCache.get(coverImage) ?? null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    extractDominantColor(coverImage).then((result) => {
      colorCache.set(coverImage, result);
      if (cancelled) return;
      setColor(result);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [coverImage]);

  return { color, isLoading };
}
