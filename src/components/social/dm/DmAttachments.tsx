import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Loader2, Music2, Paperclip, RotateCw, Video, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DM_MAX_FILES, dmMediaUrl, formatDmBytes, formatDmDuration, type DmAttachment } from '@/lib/dmMedia';
import type { DmTrayItem } from '@/hooks/useDmTray';

/**
 * Media in a direct message: the paperclip, the tray of files on their way up,
 * and the photos, clips, recordings and files inside the conversation.
 */

/** A signed link for a file in the conversation, signed again once if it stops working. */
function useDmMediaUrl(path: string, download?: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    void dmMediaUrl(path, { download, fresh: tries > 0 }).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path, download, tries]);
  return { url, refresh: () => setTries((t) => t + 1), exhausted: tries >= 2 };
}

/** The paperclip: photos, videos, audio or any file. */
export function DmAttachButton({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label="Add photos, videos or files"
        title="Add photos, videos, audio or files"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
      >
        <Paperclip className="h-5 w-5" aria-hidden="true" />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Cleared at once so the same file can be picked again later.
          e.target.value = '';
          onFiles(files);
        }}
      />
    </>
  );
}

/** The files waiting above the message box. Scrolls sideways on a phone. */
export function DmTray({
  items,
  dragging = false,
  onRemove,
  onRetry,
}: {
  items: DmTrayItem[];
  dragging?: boolean;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}) {
  if (!items.length && !dragging) return null;
  const pending = items.filter((i) => i.status === 'uploading').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const status = failed
    ? failed === 1
      ? 'One file did not go up. Try it again or remove it to send.'
      : `${failed} files did not go up. Try them again or remove them to send.`
    : pending
      ? `${pending === 1 ? '1 file' : `${pending} files`} going up. You can keep typing.`
      : '';

  return (
    <div>
      {dragging && (
        <div className="mx-3 mt-2 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-3 text-center text-xs text-muted-foreground">
          Drop to add. Up to {DM_MAX_FILES} files.
        </div>
      )}
      {items.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto px-3 pb-1 pt-2 scrollbar-hide [overscroll-behavior-x:contain]" aria-label="Files to send">
          {items.map((item) => (
            <TrayChip key={item.key} item={item} onRemove={() => onRemove(item.key)} onRetry={() => onRetry(item.key)} />
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <div className="flex items-start justify-between gap-2 px-3 pb-1 text-[11px] leading-snug text-muted-foreground" aria-live="polite">
          <span className="min-w-0">{status}</span>
          <span className="shrink-0 tabular-nums">
            {items.length} of {DM_MAX_FILES}
          </span>
        </div>
      )}
    </div>
  );
}

function TrayChip({ item, onRemove, onRetry }: { item: DmTrayItem; onRemove: () => void; onRetry: () => void }) {
  const moving = item.status === 'uploading';
  const failed = item.status === 'failed';
  const meta = failed
    ? item.error ?? 'That did not go up.'
    : moving
      ? `${formatDmBytes(item.size)} · ${item.progress}%`
      : formatDmBytes(item.attachment?.size ?? item.size);

  const Icon = item.kind === 'video' ? Video : item.kind === 'audio' ? Music2 : item.kind === 'image' ? ImageIcon : FileText;
  const body = (
    <>
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <Icon className="h-5 w-5" aria-hidden="true" />
        )}
        {moving && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/55">
            <Loader2 className="h-4 w-4 animate-spin text-foreground" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-medium text-foreground">{item.name}</span>
        <span className={`mt-0.5 line-clamp-2 text-[11px] leading-tight ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>{meta}</span>
        {failed && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-foreground">
            <RotateCw className="h-3 w-3" aria-hidden="true" /> Try again
          </span>
        )}
      </span>
    </>
  );

  return (
    <li
      className={`relative flex h-[4.5rem] w-[14rem] max-w-[78vw] shrink-0 items-center gap-2 overflow-hidden rounded-xl border bg-card pl-2 ${failed ? 'border-destructive/50' : 'border-border'}`}
    >
      {failed ? (
        <button type="button" onClick={onRetry} className="flex h-full min-w-0 flex-1 items-center gap-2" aria-label={`Try ${item.name} again`}>
          {body}
        </button>
      ) : (
        <span className="flex h-full min-w-0 flex-1 items-center gap-2">{body}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.name}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      {moving && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-muted" aria-hidden="true">
          <span className="block h-full bg-foreground/60 transition-[width] duration-300" style={{ width: `${Math.max(3, item.progress)}%` }} />
        </span>
      )}
    </li>
  );
}

/** The media inside one message. */
export function DmAttachmentList({ attachments, mine }: { attachments: DmAttachment[]; mine: boolean }) {
  if (!attachments.length) return null;
  const images = attachments.filter((a) => a.kind === 'image');
  const videos = attachments.filter((a) => a.kind === 'video');
  const rest = attachments.filter((a) => a.kind === 'audio' || a.kind === 'file');
  const cols = images.length === 1 ? 'grid-cols-1' : images.length === 2 || images.length === 4 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div className={`flex w-full max-w-[18rem] flex-col gap-1.5 ${mine ? 'items-end' : 'items-start'}`}>
      {images.length > 0 && (
        <div className={`grid gap-1 ${cols}`}>
          {images.map((a) => (
            <DmImage key={a.id} att={a} layout={images.length === 1 ? 'single' : images.length === 2 || images.length === 4 ? 'pair' : 'grid'} />
          ))}
        </div>
      )}
      {videos.map((a) => (
        <DmVideo key={a.id} att={a} />
      ))}
      {rest.map((a) => (a.kind === 'audio' ? <DmAudio key={a.id} att={a} /> : <DmFile key={a.id} att={a} />))}
    </div>
  );
}

function DmImage({ att, layout }: { att: DmAttachment; layout: 'single' | 'pair' | 'grid' }) {
  const { url, refresh, exhausted } = useDmMediaUrl(att.path);
  const download = useDmMediaUrl(att.path, att.name);
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  // A picture this browser cannot paint (a HEIC on a computer) is still a file they can open.
  if (broken) return <DmFile att={att} />;
  const ratio = att.width && att.height ? Math.min(1.6, Math.max(0.6, att.width / att.height)) : 1;
  const size =
    layout === 'single' ? 'w-60 max-w-full' : layout === 'pair' ? 'h-28 w-28' : 'h-20 w-20';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${att.name}`}
        className={`overflow-hidden rounded-xl border border-border bg-muted ${size}`}
        style={layout === 'single' ? { aspectRatio: String(ratio), maxHeight: '20rem' } : undefined}
      >
        {url ? (
          <img
            src={url}
            alt={att.name}
            loading="lazy"
            onError={() => (exhausted ? setBroken(true) : refresh())}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="block h-full min-h-20 w-full animate-pulse bg-muted" />
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(96vw,56rem)] border-border bg-background p-2 sm:p-3">
          <DialogTitle className="sr-only">{att.name}</DialogTitle>
          {url && <img src={url} alt={att.name} className="mx-auto max-h-[78vh] w-auto max-w-full rounded-lg object-contain" />}
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <p className="min-w-0 truncate text-xs text-muted-foreground">{att.name}</p>
            {download.url && (
              <a
                href={download.url}
                download={att.name}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> Save
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DmVideo({ att }: { att: DmAttachment }) {
  const { url, refresh, exhausted } = useDmMediaUrl(att.path);
  const [broken, setBroken] = useState(false);
  if (broken) return <DmFile att={att} />;
  return (
    <div className="w-64 max-w-full overflow-hidden rounded-xl border border-border bg-black">
      {url ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          onError={() => (exhausted ? setBroken(true) : refresh())}
          className="block max-h-80 w-full"
        />
      ) : (
        <div className="aspect-video w-full animate-pulse bg-muted" />
      )}
    </div>
  );
}

function DmAudio({ att }: { att: DmAttachment }) {
  const { url, refresh, exhausted } = useDmMediaUrl(att.path);
  const [broken, setBroken] = useState(false);
  if (broken) return <DmFile att={att} />;
  const meta = [formatDmDuration(att.durationSec), formatDmBytes(att.size)].filter(Boolean).join(' · ');
  return (
    <div className="w-64 max-w-full rounded-xl border border-border bg-card px-3 py-2">
      <p className="flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
        <Music2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{att.name}</span>
      </p>
      {meta && <p className="text-[11px] text-muted-foreground">{meta}</p>}
      {url ? (
        <audio
          src={url}
          controls
          preload="none"
          onError={() => (exhausted ? setBroken(true) : refresh())}
          className="mt-1.5 h-11 w-full"
        />
      ) : (
        <div className="mt-1.5 h-11 w-full animate-pulse rounded-full bg-muted" />
      )}
    </div>
  );
}

function DmFile({ att }: { att: DmAttachment }) {
  const { url } = useDmMediaUrl(att.path, att.name);
  return (
    <a
      href={url ?? undefined}
      download={att.name}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={!url}
      className="flex min-h-11 w-64 max-w-full items-center gap-2 rounded-xl border border-border bg-card py-1 pl-1 pr-3 text-left"
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FileText className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{att.name}</span>
        <span className="block text-[11px] text-muted-foreground">{formatDmBytes(att.size) || 'File'}</span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </a>
  );
}
