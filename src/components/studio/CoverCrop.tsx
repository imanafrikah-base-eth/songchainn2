import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PhotoPositioner } from '@/components/PhotoPositioner';
import { CENTRE_CROP, cropImage, type PhotoCrop } from '@/lib/cropImage';
import { shrinkCover } from '@/lib/shrinkImage';

/**
 * Any photo can be a cover.
 *
 * Covers have to be square and small enough to arrive, and the app used to
 * refuse anything else and tell the artist to go and fix it somewhere else.
 * An artist on a phone does not have somewhere else. So a photo that is not
 * square opens a square window to drag it into place, and every cover is made
 * small here, before any check runs. Nobody is ever asked to crop or shrink a
 * picture themselves.
 */

/** A little slack, so a photo that is square to the eye is not sent to the cropper. */
const SQUARE_SLACK = 0.02;
const COVER_OUTPUT_PX = 1600;

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
 * What to do with a picked photo. A square one comes back already shrunk and
 * ready; one that is not square needs the cropper first. A photo that cannot
 * be read is handed back untouched so the cover check can say so plainly.
 */
export async function prepareCover(file: File): Promise<{ file: File; needsCrop: boolean }> {
  const size = await readSize(file);
  if (!size || !size.width || !size.height) return { file, needsCrop: false };
  const ratio = size.width / size.height;
  if (Math.abs(ratio - 1) > SQUARE_SLACK) return { file, needsCrop: true };
  return { file: await shrinkCover(file), needsCrop: false };
}

/** Drag a photo square. Open while `file` is set. */
export function CoverCropDialog({
  file,
  onDone,
  onCancel,
}: {
  file: File | null;
  onDone: (cropped: File) => void;
  onCancel: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<PhotoCrop>(CENTRE_CROP);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setCrop(CENTRE_CROP);
    setProblem(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const use = async () => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const cropped = await cropImage(file, { ...crop, aspect: 1 }, {
        outputWidth: COVER_OUTPUT_PX,
        mime: 'image/jpeg',
        quality: 0.9,
        fileName: file.name.replace(/\.[^.]+$/, '') + '-cover',
      });
      onDone(cropped);
    } catch (err) {
      setProblem((err as Error)?.message || 'That photo could not be cropped. Try another one.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Make it square</DialogTitle>
          <DialogDescription>Covers are square. Drag the photo until the part you want is in the frame.</DialogDescription>
        </DialogHeader>
        {src && (
          <PhotoPositioner
            src={src}
            onChange={setCrop}
            disabled={busy}
            alt="Your cover, drag to fit"
            className="mx-auto aspect-square w-full max-w-sm rounded-xl border border-border bg-muted"
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
