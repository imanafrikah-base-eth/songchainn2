// One slot of art in a world, and the three ways to fill it.
//
// IMan's world was dressed by hand: every door, every city, the brass
// entrance, the sky. This is how every other artist dresses theirs without
// anyone's hand but their own. A slot takes an upload from the phone, a
// piece already in their gallery, or a link.
//
// Fast first: a picked file goes up the moment it is picked, private to the
// world (it never lands on the public gallery unless the artist shows it
// there). Framing (drag, pinch, zoom) and, for a video, cutting a short loop
// are one tap away afterwards, never in the way.

import { useRef, useState } from 'react';
import { Image as ImageIcon, Link2, Loader2, Move, Scissors, Trash2, Upload, Film } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useMediaUpload, useMyMedia } from '@/hooks/useArtistMedia';
import { ClipVideo } from '@/worlds/builder/ClipVideo';
import { MediaFramer } from '@/worlds/builder/MediaFramer';
import { fitStyle, type ArtFit } from '@/lib/artFit';

export function ArtPicker({
  label,
  help,
  value,
  onChange,
  kind = 'image',
  aspect = 'aspect-[16/9]',
  fit,
  onFit,
}: {
  label: string;
  help?: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  kind?: 'image' | 'video';
  /** Tailwind aspect class for the preview. */
  aspect?: string;
  /** How the art sits in this frame, when the slot remembers one. */
  fit?: ArtFit;
  /** Given when the slot can be framed. */
  onFit?: (fit: ArtFit | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, phase, progress } = useMediaUpload();
  const { data: media = [] } = useMyMedia();
  const [picking, setPicking] = useState(false);
  const [link, setLink] = useState('');
  const [framing, setFraming] = useState(false);
  /** The last file picked here, kept so a loop can still be cut from it after it went up. */
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [clipping, setClipping] = useState(false);
  const busy = phase === 'preparing' || phase === 'uploading';
  const mine = media.filter((m) => m.kind === kind);

  const send = async (file: File) => {
    const item = await upload(file, { title: label, private: true });
    if (item?.public_url) {
      onChange(item.public_url);
      onFit?.(null);
      toast.success('Up', { description: `${label} is set. Frame it or cut it if you like.` });
    } else {
      toast.error('That did not upload', { description: 'Try a smaller file, or a JPG, PNG, WebP, MP4 or WebM.' });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    setLastFile(file);
    setClipping(false);
    setFraming(false);
    await send(file);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
        </div>
        {value ? (
          <button type="button" onClick={() => { onChange(null); onFit?.(null); setFraming(false); }} aria-label={`Clear ${label}`} className="rounded-full p-1 text-muted-foreground hover:text-foreground">
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {value && framing && onFit ? (
        <div className="mt-2">
          <MediaFramer src={value} kind={kind} aspect={aspect} value={fit} onChange={(f) => onFit(f)} onDone={() => setFraming(false)} />
        </div>
      ) : (
        <div className={`relative mt-2 overflow-hidden rounded-md bg-black/30 ${aspect}`}>
          {value ? (
            kind === 'video' ? (
              <video src={value} muted loop playsInline autoPlay className="absolute inset-0 h-full w-full object-cover" style={fitStyle(fit)} />
            ) : (
              <img src={value} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" style={fitStyle(fit)} />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              {kind === 'video' ? <Film className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
            </div>
          )}
          {busy && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      )}

      {clipping && lastFile && kind === 'video' ? (
        <div className="mt-2">
          <ClipVideo
            file={lastFile}
            onDone={(result) => {
              setClipping(false);
              if (result && result !== lastFile) void send(result);
            }}
          />
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept={kind === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/gif,image/avif'}
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button type="button" size="sm" variant={value ? 'outline' : 'default'} className="h-8 rounded-full text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
          {busy ? `${progress}%` : value ? 'Replace' : 'Upload'}
        </Button>
        {value && onFit ? (
          <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" disabled={busy} onClick={() => setFraming((f) => !f)}>
            <Move className="mr-1 h-3.5 w-3.5" /> {framing ? 'Close' : 'Frame'}
          </Button>
        ) : null}
        {value && kind === 'video' && lastFile ? (
          <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" disabled={busy} onClick={() => setClipping((c) => !c)}>
            <Scissors className="mr-1 h-3.5 w-3.5" /> Cut a loop
          </Button>
        ) : null}
        {mine.length > 0 ? (
          <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full text-xs" onClick={() => setPicking((p) => !p)}>
            Gallery
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
                  onClick={() => { onChange(m.public_url); onFit?.(null); setPicking(false); }}
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
              onClick={() => { onChange(link.trim()); onFit?.(null); setLink(''); setPicking(false); }}
            >
              Use it
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
