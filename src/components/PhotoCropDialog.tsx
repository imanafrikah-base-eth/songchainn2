import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PhotoPositioner } from '@/components/PhotoPositioner';
import { CENTRE_CROP, cropImage, type PhotoCrop } from '@/lib/cropImage';
import { shrinkImage } from '@/lib/shrinkImage';

/**
 * Any photo, into any shape, and the version you framed is the one that goes
 * live.
 *
 * The Studio already had this for square cover art. Everywhere else that takes
 * a picture (a profile picture, the wide photo across the top of an artist
 * page) sent the raw file off the camera: no framing, no shrinking, and a flat
 * refusal over ten megabytes. So a phone photo was either refused outright or
 * uploaded whole and then cropped by CSS, which means the artist never decided
 * what the picture actually shows.
 *
 * This is the same idea as the cover cropper, with the shape as an argument,
 * so a round profile picture and a wide banner can share one screen.
 */

/** A photo already this shape, to the eye, does not need the cropper. */
const SHAPE_SLACK = 0.02;

function readSize(file: File): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/**
 * What to do with a picked photo. One already the right shape comes back
 * shrunk and ready to send; anything else needs framing first. A photo that
 * cannot be read at all is handed back untouched so the caller can say so.
 */
export async function preparePhoto(
  file: File,
  aspect: number,
  maxEdge: number,
): Promise<{ file: File; needsCrop: boolean }> {
  const size = await readSize(file);
  if (!size || !size.width || !size.height) return { file, needsCrop: false };
  const ratio = size.width / size.height;
  if (Math.abs(ratio - aspect) > SHAPE_SLACK * Math.max(1, aspect)) return { file, needsCrop: true };
  return { file: await shrinkImage(file, { maxEdge, quality: 0.9 }), needsCrop: false };
}

/**
 * Drag a photo into the frame. Open while `file` is set.
 *
 * `aspect` is width over height: 1 for a profile picture, about 3 for the
 * band across the top of a page.
 */
export function PhotoCropDialog({
  file,
  aspect,
  outputWidth,
  circle = false,
  title = 'Frame your photo',
  description,
  onDone,
  onCancel,
}: {
  file: File | null;
  aspect: number;
  outputWidth: number;
  /** Round it off, for a profile picture. */
  circle?: boolean;
  title?: string;
  description?: string;
  onDone: (cropped: File) => void;
  onCancel: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<PhotoCrop>({ ...CENTRE_CROP, aspect });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setCrop({ ...CENTRE_CROP, aspect });
    setProblem(null);
    return () => URL.revokeObjectURL(url);
  }, [file, aspect]);

  const use = async () => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const cropped = await cropImage(file, { ...crop, aspect }, {
        outputWidth,
        circle,
        mime: circle ? 'image/png' : 'image/jpeg',
        quality: 0.9,
        fileName: file.name.replace(/\.[^.]+$/, '') + '-framed',
      });
      onDone(cropped);
    } catch (err) {
      setProblem((err as Error)?.message || 'That photo could not be framed. Try another one.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? 'Drag the photo until the part you want is in the frame. What you see here is what goes live.'}
          </DialogDescription>
        </DialogHeader>
        {src && (
          <PhotoPositioner
            src={src}
            onChange={setCrop}
            disabled={busy}
            alt="Your photo, drag to fit"
            className={`mx-auto w-full max-w-sm border border-border bg-muted ${circle ? 'rounded-full' : 'rounded-xl'}`}
            style={{ aspectRatio: String(aspect) }}
          />
        )}
        {problem && <p className="text-xs text-destructive">{problem}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-11 rounded-full" disabled={busy} onClick={onCancel}>
            Pick another
          </Button>
          <Button className="h-11 rounded-full" disabled={busy || !src} onClick={() => void use()}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
            Use this
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PhotoCropDialog;
