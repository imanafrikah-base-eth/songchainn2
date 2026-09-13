import { useCallback, useEffect, useRef, useState } from 'react';
import { checkCover, COVER_MIN_PX, landCover } from '@/lib/coverArt';
import { shrinkCover } from '@/lib/shrinkImage';
import { squareCover } from '@/components/studio/CoverCrop';

/**
 * Artwork that is on its way the moment it is picked.
 *
 * Audio already starts uploading when the file is chosen; the cover used to
 * wait for Send, then refuse anything that was not square, then open a crop
 * window. Now a picture is cut to its centre square on the device, shrunk,
 * checked and sent in the background straight away, so by the time the
 * artist presses Send the artwork is already in. The crop window is still
 * there, as an optional Adjust, never as a step.
 */

export type CoverStatus = 'idle' | 'preparing' | 'uploading' | 'ready' | 'error';

interface CoverState {
  status: CoverStatus;
  /** What is shown: the squared picture on the device, or the landed URL. */
  preview: string | null;
  url: string | null;
  error: string | null;
  warn: string | null;
  progress: number;
  /** The picture was not square and was cut to its centre. */
  cropped: boolean;
  /** The picture as picked, kept so Adjust always starts from the whole photo. */
  original: File | null;
  fromProfile: boolean;
}

const IDLE: CoverState = {
  status: 'idle', preview: null, url: null, error: null, warn: null, progress: 0, cropped: false, original: null, fromProfile: false,
};

const STALE = new Error('stale');

export interface CoverLanding extends CoverState {
  /** A picture from the picker, a drop or a paste. */
  pick: (file: File) => void;
  /** The same photo, cropped by hand in the Adjust window. */
  adjust: (cropped: File) => void;
  /** The artist's own profile picture, as a one-tap fallback. */
  fromProfileUrl: (url: string) => void;
  retry: () => void;
  clear: () => void;
  /** Resolves to the landed URL, or null when nothing is picked or it failed. */
  whenReady: () => Promise<string> | null;
}

function looksLikeImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i.test(file.name);
}

function imageSize(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function useCoverLanding(): CoverLanding {
  const [state, setState] = useState<CoverState>(IDLE);
  const seq = useRef(0);
  const promiseRef = useRef<Promise<string> | null>(null);
  const blobRef = useRef<string | null>(null);
  const lastRef = useRef<{ file: File; adjusted: boolean; original: File } | null>(null);

  const setBlob = (url: string | null) => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    blobRef.current = url;
  };
  useEffect(() => () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current); }, []);

  const run = useCallback((file: File, adjusted: boolean, original: File, fromProfile = false) => {
    const id = ++seq.current;
    lastRef.current = { file, adjusted, original };
    setState((s) => ({ ...IDLE, status: 'preparing', preview: s.preview, original, fromProfile }));
    const p = (async () => {
      if (!looksLikeImage(file)) throw new Error('That is not a picture. Pick a photo for the artwork.');
      const { file: square, cropped } = adjusted ? { file: await shrinkCover(file), cropped: false } : await squareCover(file);
      if (id !== seq.current) throw STALE;
      const blob = URL.createObjectURL(square);
      setBlob(blob);
      setState((s) => ({ ...s, preview: blob, cropped }));
      const check = await checkCover(square);
      if (id !== seq.current) throw STALE;
      if (check.block) throw new Error(check.block);
      setState((s) => ({ ...s, status: 'uploading', warn: check.warn, progress: 0 }));
      let landed: string;
      try {
        landed = await landCover(square, (pct) => {
          if (id === seq.current) setState((s) => (s.status === 'uploading' ? { ...s, progress: pct } : s));
        });
      } catch (err) {
        throw new Error((err as Error)?.message || 'The artwork did not upload. Check your connection and try again.');
      }
      if (id !== seq.current) throw STALE;
      setState((s) => ({ ...s, status: 'ready', url: landed, progress: 100 }));
      return landed;
    })();
    promiseRef.current = p;
    p.catch((err) => {
      if (err === STALE || id !== seq.current) return;
      promiseRef.current = null;
      setState((s) => ({ ...s, status: 'error', error: (err as Error)?.message || 'The artwork did not work. Try another picture.' }));
    });
  }, []);

  const pick = useCallback((file: File) => run(file, false, file), [run]);

  const adjust = useCallback((cropped: File) => {
    const original = lastRef.current?.original ?? cropped;
    run(cropped, true, original);
  }, [run]);

  const retry = useCallback(() => {
    const last = lastRef.current;
    if (last) run(last.file, last.adjusted, last.original, false);
  }, [run]);

  const clear = useCallback(() => {
    seq.current++;
    promiseRef.current = null;
    lastRef.current = null;
    setBlob(null);
    setState(IDLE);
  }, []);

  const fromProfileUrl = useCallback((url: string) => {
    const id = ++seq.current;
    setState({ ...IDLE, status: 'preparing', fromProfile: true, preview: url });
    void (async () => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error('unreachable');
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('not an image');
        if (id !== seq.current) return;
        const ext = blob.type.split('/')[1] || 'jpg';
        const file = new File([blob], `profile-picture.${ext}`, { type: blob.type });
        run(file, false, file, true);
      } catch {
        // The picture host would not hand the bytes over. A picture that is
        // already square and big enough can be pointed at as it is.
        const size = await imageSize(url);
        if (id !== seq.current) return;
        const ok = !!size && size.width > 0 && Math.abs(size.width / size.height - 1) <= 0.02 && Math.min(size.width, size.height) >= COVER_MIN_PX;
        if (ok) {
          promiseRef.current = Promise.resolve(url);
          setState({ ...IDLE, status: 'ready', url, preview: url, progress: 100, fromProfile: true });
        } else {
          promiseRef.current = null;
          setState({ ...IDLE, status: 'error', fromProfile: true, error: 'Your profile picture could not be used as artwork. Pick a photo instead.' });
        }
      }
    })();
  }, [run]);

  const whenReady = useCallback(() => promiseRef.current, []);

  return { ...state, pick, adjust, fromProfileUrl, retry, clear, whenReady };
}
