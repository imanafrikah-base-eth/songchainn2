// One slot of art in a world, and the three ways to fill it.
//
// IMan's world was dressed by hand: every door, every city, the brass
// entrance, the sky. This is how every other artist dresses theirs without
// anyone's hand but their own. A slot takes an upload from the phone (it
// lands in the artist's gallery, the same place their feed photos live), a
// piece already in that gallery, or a link. Video slots are the silent loops
// that play over a still; a still is always enough.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Link2, Loader2, Trash2, Upload, Film, Move } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useMediaUpload, useMyMedia } from '@/hooks/useArtistMedia';
import { ClipVideo } from '@/worlds/builder/ClipVideo';
import { PhotoPositioner } from '@/components/PhotoPositioner';
import { cropImage, CENTRE_CROP, type PhotoCrop } from '@/lib/cropImage';

/** The slot's shape as a number, read off its Tailwind aspect class. */
function ratioOf(aspect: string): number {
  if (/aspect-square/.test(aspect)) return 1;
  const m = aspect.match(/aspect-\[(\d+)\/(\d+)\]/);
  return m ? Number(m[1]) / Number(m[2]) : 16 / 9;
}

/** How wide the cut picture should be for this slot. */
function outputWidthFor(ratio: number): number {
  if (ratio === 1) return 1200;
  return ratio > 1 ? 1920 : 1080;
}

export function ArtPicker({
  label,
  help,
  value,
  onChange,
  kind = 'image',
  aspect = 'aspect-[16/9]',
}: {
  label: string;
  help?: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  kind?: 'image' | 'video';
  /** Tailwind aspect class for the preview. */
  aspect?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, phase, progress } = useMediaUpload();
  const { data: media = [] } = useMyMedia();
  const [picking, setPicking] = useState(false);
  const [link, setLink] = useState('');
  /** A video waiting to be cut into a loop before it uploads. */
  const [clipping, setClipping] = useState<File | null>(null);
  /** A picture waiting to be dragged into its frame before it uploads. */
  const [framing, setFraming] = useState<File | null>(null);
  const framingUrl = useMemo(() => (framing ? URL.createObjectURL(framing) : null), [framing]);
  const [crop, setCrop] = useState<PhotoCrop>(CENTRE_CROP);
  const [cutting, setCutting] = useState(false);
  const ratio = ratioOf(aspect);
  useEffect(() => () => { if (framingUrl) URL.revokeObjectURL(framingUrl); }, [framingUrl]);
  const busy = phase === 'preparing' || phase === 'uploading';
  const mine = media.filter((m) => m.kind === kind);

  const onFile = async (file: File | undefined, opts?: { cut?: boolean }) => {
    if (!file) return;
    // A video goes through the cutter first, the way IMan's loops were made.
    // The artist can still send the whole thing.
    if (kind === 'video' && !opts?.cut) {
      setClipping(file);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    // A picture is dragged into the slot's frame first, the same positioner
    // as the profile photos. A GIF keeps its motion by skipping the cut.
    if (kind === 'image' && !opts?.cut && file.type !== 'image/gif') {
      setFraming(file);
      setCrop(CENTRE_CROP);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    const item = await upload(file, { title: label });
    if (item?.public_url) {
      onChange(item.public_url);
      toast.success('Up', { description: `${label} is set.` });
    } else {
      toast.error('That did not upload', { description: 'Try a smaller file, or a JPG, PNG, WebP, MP4 or WebM.' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
        </div>
        {value ? (
          <button type="button" onClick={() => onChange(null)} aria-label={`Clear ${label}`} className="rounded-full p-1 text-muted-foreground hover:text-foreground">
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {framing && framingUrl ? (
        <div className="mt-2 rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <Move className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Drag it into the frame</p>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            This is the exact shape of the slot. Slide the picture until the part you want shows; only that part uploads.
          </p>
          <div className={`relative w-full overflow-hidden rounded-md bg-black/40 ${aspect}`}>
            <PhotoPositioner src={framingUrl} onChange={setCrop} className="absolute inset-0" alt={`${label} preview`} disabled={cutting} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-full text-xs"
              disabled={cutting}
              onClick={async () => {
                setCutting(true);
                try {
                  const cut = await cropImage(framing, { ...crop, aspect: ratio }, {
                    outputWidth: outputWidthFor(ratio),
                    mime: framing.type === 'image/png' ? 'image/png' : 'image/jpeg',
                    quality: 0.9,
                    fileName: framing.name,
                  });
                  setFraming(null);
                  await onFile(cut, { cut: true });
                } catch {
                  toast.error('That picture could not be cut', { description: 'Sending it whole instead.' });
                  const whole = framing;
                  setFraming(null);
                  await onFile(whole, { cut: true });
                } finally {
                  setCutting(false);
                }
              }}
            >
              {cutting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Move className="mr-1 h-3.5 w-3.5" />}
              Use this framing
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" disabled={cutting} onClick={() => { const whole = framing; setFraming(null); void onFile(whole, { cut: true }); }}>
              Use the whole picture
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full text-xs" disabled={cutting} onClick={() => setFraming(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {clipping ? (
        <div className="mt-2">
          <ClipVideo
            file={clipping}
            onDone={(result) => {
              setClipping(null);
              if (result) void onFile(result, { cut: true });
            }}
          />
        </div>
      ) : null}

      <div className={`mt-2 overflow-hidden rounded-md bg-black/30 ${aspect}`}>
        {value ? (
          kind === 'video' ? (
            <video src={value} muted loop playsInline autoPlay className="h-full w-full object-contain" />
          ) : (
            <img src={value} alt="" className="h-full w-full object-cover" loading="lazy" />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            {kind === 'video' ? <Film className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept={kind === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/gif,image/avif'}
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
          {busy ? `${progress}%` : 'Upload'}
        </Button>
        {mine.length > 0 ? (
          <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => setPicking((p) => !p)}>
            From my gallery
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full text-xs" onClick={() => setPicking((p) => !p)}>
          <Link2 className="mr-1 h-3.5 w-3.5" /> Link
        </Button>
      </div>

      {picking ? (
        <div className="mt-2 space-y-2">
          {mine.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {mine.slice(0, 20).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onChange(m.public_url); setPicking(false); }}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border ${value === m.public_url ? 'border-primary' : 'border-border'}`}
                  aria-label={m.title || 'Gallery piece'}
                >
                  {m.kind === 'video' ? (
                    <video src={m.public_url} muted className="h-full w-full object-cover" />
                  ) : (
                    <img src={m.public_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-1.5">
            <input
              className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus-ring"
              placeholder="https://..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
              spellCheck={false}
            />
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-full text-xs"
              disabled={!/^https?:\/\//.test(link.trim())}
              onClick={() => { onChange(link.trim()); setLink(''); setPicking(false); }}
            >
              Use it
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
