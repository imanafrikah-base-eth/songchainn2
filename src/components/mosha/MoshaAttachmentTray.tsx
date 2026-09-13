import { useCallback, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent } from 'react';
import { FileText, Image as ImageIcon, Loader2, Music2, Paperclip, RotateCw, X } from 'lucide-react';
import { formatBytes, formatDuration, MAX_ATTACHMENTS } from '@/lib/moshaAttachments';
import {
  addToTray,
  dismissTrayNotice,
  getTray,
  removeFromTray,
  retryTrayItem,
  subscribeTray,
  trayBlocked,
  trayPending,
  type TrayItem,
} from '@/lib/moshaTray';

/** The waiting files for this person, shared by the pop-up chat and the Inbox. */
export function useMoshaTray(userId: string | null) {
  const subscribe = useCallback((l: () => void) => subscribeTray(userId, l), [userId]);
  const snap = useSyncExternalStore(subscribe, () => getTray(userId), () => getTray(null));
  const add = useCallback((files: File[]) => {
    if (userId && files.length) addToTray(userId, files);
  }, [userId]);
  return {
    items: snap.items,
    notice: snap.notice,
    count: snap.items.length,
    pending: trayPending(snap.items),
    blocked: trayBlocked(snap.items),
    add,
  };
}

/** Drag and drop onto a chat, and paste a screenshot into its box. */
export function useAttachDrop(userId: string | null) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const onDragEnter = (e: DragEvent) => {
    if (!userId || !hasFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!userId || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: DragEvent) => {
    if (!userId || !hasFiles(e)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!userId || !hasFiles(e)) return;
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    addToTray(userId, Array.from(e.dataTransfer.files ?? []));
  };
  const onPaste = (e: ClipboardEvent) => {
    if (!userId) return;
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length) return;
    // A copied picture comes with a meaningless name; give it the moment it was pasted.
    e.preventDefault();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    addToTray(
      userId,
      files.map((f, i) =>
        f.name && f.name !== 'image.png' ? f : new File([f], `Screenshot-${stamp}${i ? `-${i + 1}` : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type, lastModified: f.lastModified }),
      ),
    );
  };
  return { dragging, bind: { onDragEnter, onDragOver, onDragLeave, onDrop }, onPaste };
}

/** The paperclip. Opens the picker for songs, pictures, or any file at all. */
export function AttachButton({ userId, disabled, className = '' }: { userId: string | null; disabled?: boolean; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  if (!userId) return null;
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label="Add files"
        title="Add songs, pictures, screenshots or any file"
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 ${className}`}
      >
        <Paperclip className="h-5 w-5" aria-hidden="true" />
      </button>
      {/* No accept list: songs, pictures and any other file are all welcome. */}
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
          addToTray(userId, files);
        }}
      />
    </>
  );
}

/** The chips waiting above the message box. Scrolls sideways on a phone. */
export function AttachmentTray({
  userId,
  waiting = false,
  dragging = false,
}: {
  userId: string | null;
  /** Send was pressed and is waiting for files to finish. */
  waiting?: boolean;
  dragging?: boolean;
}) {
  const tray = useMoshaTray(userId);
  if (!userId) return null;
  if (!tray.count && !tray.notice && !dragging) return null;

  let status = '';
  if (tray.blocked) {
    status = tray.blocked === 1
      ? 'One file did not go up. Try it again or remove it to send.'
      : `${tray.blocked} files did not go up. Try them again or remove them to send.`;
  } else if (waiting && tray.pending) {
    status = `Sending as soon as ${tray.pending === 1 ? 'the last file is' : `${tray.pending} files are`} up.`;
  } else if (tray.pending) {
    status = `${tray.pending === 1 ? '1 file' : `${tray.pending} files`} going up. You can keep typing or add more.`;
  }

  return (
    <div className="border-t border-border bg-background">
      {dragging && (
        <div className="mx-3 mt-2 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-3 text-center text-xs text-muted-foreground">
          Drop to add. Up to {MAX_ATTACHMENTS} files.
        </div>
      )}
      {tray.count > 0 && (
        <ul className="flex gap-2 overflow-x-auto px-3 pt-2 pb-1 scrollbar-hide [overscroll-behavior-x:contain]" aria-label="Files to send">
          {tray.items.map((item) => (
            <TrayChip key={item.id} item={item} onRemove={() => removeFromTray(userId, item.id)} onRetry={() => retryTrayItem(userId, item.id)} />
          ))}
        </ul>
      )}
      {(status || tray.notice || tray.count > 0) && (
        <div className="flex items-start justify-between gap-2 px-3 pb-1.5 text-[11px] leading-snug text-muted-foreground" aria-live="polite">
          <span className="min-w-0">
            {tray.notice ? (
              <button type="button" onClick={() => dismissTrayNotice(userId)} className="text-left text-foreground/80">
                {tray.notice}
              </button>
            ) : (
              status
            )}
          </span>
          {tray.count > 0 && <span className="shrink-0 tabular-nums">{tray.count} of {MAX_ATTACHMENTS}</span>}
        </div>
      )}
    </div>
  );
}

function TrayChip({ item, onRemove, onRetry }: { item: TrayItem; onRemove: () => void; onRetry: () => void }) {
  const moving = item.status === 'queued' || item.status === 'preparing' || item.status === 'uploading';
  const failed = item.status === 'failed';
  const refused = item.status === 'refused';
  const bad = failed || refused;

  const meta = refused || failed
    ? item.error ?? 'That did not go up.'
    : item.status === 'queued'
      ? `${formatBytes(item.size)} · waiting`
      : item.status === 'preparing'
        ? item.kind === 'image' ? 'Making it lighter' : 'Getting it ready'
        : item.status === 'uploading'
          ? `${formatBytes(item.size)} · ${item.progress}%`
          : [formatBytes(item.size), formatDuration(item.durationSec)].filter(Boolean).join(' · ');

  const body = (
    <>
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {item.kind === 'image' && item.previewUrl ? (
          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : item.kind === 'image' ? (
          <ImageIcon className="h-5 w-5" aria-hidden="true" />
        ) : item.kind === 'audio' ? (
          <Music2 className="h-5 w-5" aria-hidden="true" />
        ) : (
          <FileText className="h-5 w-5" aria-hidden="true" />
        )}
        {moving && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/55">
            <Loader2 className="h-4 w-4 animate-spin text-foreground" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-medium text-foreground">{item.name}</span>
        <span className={`mt-0.5 line-clamp-2 text-[11px] leading-tight ${bad ? 'text-destructive' : 'text-muted-foreground'}`}>
          {meta}
        </span>
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
      className={`relative flex h-[4.5rem] w-[15rem] max-w-[80vw] shrink-0 items-center gap-2 overflow-hidden rounded-xl border bg-card pl-2 ${bad ? 'border-destructive/50' : 'border-border'}`}
    >
      {failed ? (
        <button type="button" onClick={onRetry} className="flex h-full min-w-0 flex-1 items-center gap-2" aria-label={`Try ${item.name} again`}>
          {body}
        </button>
      ) : (
        <span className="flex h-full min-w-0 flex-1 items-center gap-2">
          {body}
        </span>
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
          <span className="block h-full bg-foreground/60 transition-[width] duration-300" style={{ width: `${item.status === 'uploading' ? item.progress : 3}%` }} />
        </span>
      )}
    </li>
  );
}
