import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Crop, Image as ImageIcon, Loader2, RefreshCw, UserRound, X } from 'lucide-react';
import { CoverCropDialog } from '@/components/studio/CoverCrop';
import type { CoverLanding } from '@/hooks/useCoverLanding';

const ACCEPT = 'image/*,.heic,.heif';

/**
 * One place to add artwork. A tap on the square or the button picks a photo;
 * on a desktop a picture can also be dropped on it or pasted. Whatever shape
 * it is, it is squared from the centre and starts uploading straight away.
 * Adjust opens the crop window for anyone who wants a different part.
 */
export function ArtworkField({
  cover,
  label,
  hint,
  disabled = false,
  profileUrl,
  listenPaste = false,
  compact = false,
  fallbackPreview,
  fallbackNote,
}: {
  cover: CoverLanding;
  label: string;
  hint?: string;
  disabled?: boolean;
  /** The artist's profile picture, offered when nothing is picked. */
  profileUrl?: string | null;
  /** Take a pasted picture from anywhere on the page. Only one field should. */
  listenPaste?: boolean;
  compact?: boolean;
  /** What shows when this field is empty, like the release artwork on a track. */
  fallbackPreview?: string | null;
  fallbackNote?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [cropping, setCropping] = useState<File | null>(null);
  const { pick } = cover;

  useEffect(() => {
    if (!listenPaste || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      pick(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [listenPaste, disabled, pick]);

  const working = cover.status === 'preparing' || cover.status === 'uploading';
  const has = cover.status !== 'idle' && !(cover.status === 'error' && !cover.preview);
  const preview = has ? cover.preview : fallbackPreview ?? null;
  const box = compact ? 'h-16 w-16' : 'h-24 w-24 sm:h-28 sm:w-28';

  const open = () => { if (!disabled) inputRef.current?.click(); };

  return (
    <div
      onDragOver={(e) => { if (disabled) return; e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (disabled) return;
        const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        pick(file);
      }}
      className={`rounded-xl border border-dashed p-3 transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border'}`}
    >
      <CoverCropDialog
        file={cropping}
        onCancel={() => setCropping(null)}
        onDone={(f) => { setCropping(null); cover.adjust(f); }}
      />
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) pick(f);
        }}
      />
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={open}
          disabled={disabled}
          aria-label={has ? 'Change the artwork' : 'Add artwork'}
          className={`relative flex ${box} shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted disabled:opacity-60`}
        >
          {preview
            ? <img src={preview} alt="" className={`h-full w-full object-cover ${!has ? 'opacity-60' : ''}`} />
            : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
          {working && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-foreground" />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={open}
              disabled={disabled}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-semibold text-foreground hover:bg-secondary/80 disabled:opacity-60"
            >
              <ImageIcon className="h-4 w-4" /> {has ? 'Change' : 'Add artwork'}
            </button>
            {cover.original && !cover.fromProfile && !working && cover.status !== 'error' && (
              <button
                type="button"
                onClick={() => setCropping(cover.original)}
                disabled={disabled}
                className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
              >
                <Crop className="h-4 w-4" /> Adjust
              </button>
            )}
            {has && !working && (
              <button
                type="button"
                onClick={cover.clear}
                disabled={disabled}
                aria-label="Remove this artwork"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {!has && profileUrl && (
            <button
              type="button"
              onClick={() => cover.fromProfileUrl(profileUrl)}
              disabled={disabled}
              className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-sm font-semibold text-primary disabled:opacity-60"
            >
              <UserRound className="h-4 w-4" /> Use my profile picture
            </button>
          )}
          <div className="mt-1 text-xs" aria-live="polite">
            {cover.status === 'preparing' && <p className="text-muted-foreground">Getting it ready.</p>}
            {cover.status === 'uploading' && (
              <p className="text-muted-foreground">Uploading the artwork, {Math.round(cover.progress)}%. Carry on, it finishes by itself.</p>
            )}
            {cover.status === 'ready' && (
              <p className="inline-flex items-center gap-1 text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                {cover.cropped ? 'Artwork is in. Cut to the centre square; Adjust to pick another part.' : 'Artwork is in.'}
              </p>
            )}
            {cover.warn && cover.status !== 'error' && <p className="mt-0.5 text-amber-500">{cover.warn}</p>}
            {cover.status === 'error' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="inline-flex items-start gap-1 text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {cover.error}
                </p>
                {cover.original && !/picture|HEIC|opened|pixels|square/i.test(cover.error ?? '') && (
                  <button type="button" onClick={cover.retry} className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-semibold text-primary">
                    <RefreshCw className="h-3.5 w-3.5" /> Try again
                  </button>
                )}
              </div>
            )}
            {cover.status === 'idle' && (
              <p className="text-muted-foreground">
                {fallbackNote ?? hint ?? 'Any photo. It is squared for you.'}
                <span className="hidden sm:inline"> Drop a picture here{listenPaste ? ' or paste one' : ''}.</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
