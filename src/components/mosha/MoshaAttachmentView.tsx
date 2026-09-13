import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Music2, Pause, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { attachmentUrl, formatBytes, formatDuration, type MoshaAttachment } from '@/lib/moshaAttachments';

/** A link for this file, signed for its owner when it is private. */
function useAttachmentUrl(att: MoshaAttachment): string | null {
  const [url, setUrl] = useState<string | null>(att.storage === 'r2' ? att.url || null : null);
  useEffect(() => {
    let alive = true;
    void attachmentUrl(att).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [att.id, att.path, att.url, att.storage]);
  return url;
}

/** The files sent with a message, in the history of either Mo$ha chat. */
export function MoshaAttachmentList({ attachments, mine = true }: { attachments?: MoshaAttachment[]; mine?: boolean }) {
  if (!attachments?.length) return null;
  const images = attachments.filter((a) => a.kind === 'image');
  const rest = attachments.filter((a) => a.kind !== 'image');
  return (
    <div className={`mt-1.5 flex w-full max-w-[18rem] flex-col gap-1.5 ${mine ? 'ml-auto items-end' : 'items-start'}`}>
      {images.length > 0 && (
        <div className={`grid gap-1 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {images.map((a) => (
            <ImageThumb key={a.id} att={a} single={images.length === 1} />
          ))}
        </div>
      )}
      {rest.map((a) => (a.kind === 'audio' ? <AudioChip key={a.id} att={a} /> : <FileChip key={a.id} att={a} />))}
    </div>
  );
}

function ImageThumb({ att, single }: { att: MoshaAttachment; single: boolean }) {
  const url = useAttachmentUrl(att);
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  // A picture this browser cannot paint (a HEIC on a desktop) is still a file they can open.
  if (broken) return <FileChip att={att} />;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${att.name}`}
        className={`overflow-hidden rounded-xl border border-border bg-muted ${single ? 'h-44 w-56 max-w-full' : 'h-20 w-20'}`}
      >
        {url ? (
          <img src={url} alt={att.name} loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : (
          <span className="block h-full w-full animate-pulse bg-muted" />
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(96vw,56rem)] border-border bg-background p-2 sm:p-3">
          <DialogTitle className="sr-only">{att.name}</DialogTitle>
          {url && <img src={url} alt={att.name} className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg object-contain" />}
          <p className="truncate px-1 pt-1 text-xs text-muted-foreground">{att.name}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AudioChip({ att }: { att: MoshaAttachment }) {
  const url = useAttachmentUrl(att);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => () => audio.current?.pause(), []);

  const toggle = () => {
    if (!url) return;
    if (!audio.current) {
      const el = new Audio(url);
      el.preload = 'none';
      el.onended = () => setPlaying(false);
      el.onpause = () => setPlaying(false);
      el.onplay = () => setPlaying(true);
      el.onerror = () => {
        setPlaying(false);
        setFailed(true);
      };
      audio.current = el;
    }
    if (audio.current.paused) void audio.current.play().catch(() => setFailed(true));
    else audio.current.pause();
  };

  const meta = [formatDuration(att.durationSec), formatBytes(att.size)].filter(Boolean).join(' · ');
  return (
    <div className="flex w-full items-center gap-2 rounded-xl border border-border bg-card py-1 pl-1 pr-3">
      {failed && url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${att.name}`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={!url}
          aria-label={playing ? `Pause ${att.name}` : `Play ${att.name}`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-50"
        >
          {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
        </button>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1 truncate text-xs font-medium text-foreground">
          <Music2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{att.name}</span>
        </span>
        <span className="block text-[11px] text-muted-foreground">{failed ? 'Cannot play here. Tap to open it.' : meta}</span>
      </span>
    </div>
  );
}

function FileChip({ att }: { att: MoshaAttachment }) {
  const url = useAttachmentUrl(att);
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={!url}
      className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-card py-1 pl-1 pr-3 text-left"
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FileText className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{att.name}</span>
        <span className="block text-[11px] text-muted-foreground">{formatBytes(att.size)}</span>
      </span>
    </a>
  );
}
