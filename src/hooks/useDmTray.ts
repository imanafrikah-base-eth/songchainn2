import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { toast } from 'sonner';
import { DM_MAX_FILES, dmKindOf, uploadDmFile, type DmAttachment, type DmAttachmentKind } from '@/lib/dmMedia';

/**
 * The files waiting to go with the next direct message. Each one starts going
 * up the moment it is picked, so by the time Send is pressed they are already
 * in; Send waits for none of them because it only lights up once all are in.
 */

export interface DmTrayItem {
  key: string;
  file: File;
  name: string;
  kind: DmAttachmentKind;
  size: number;
  status: 'uploading' | 'done' | 'failed';
  progress: number;
  error?: string;
  previewUrl?: string;
  attachment?: DmAttachment;
}

export function useDmTray(conversationId: string | null, userId: string | null) {
  const [items, setItems] = useState<DmTrayItem[]>([]);
  const itemsRef = useRef<DmTrayItem[]>(items);
  itemsRef.current = items;
  const aborts = useRef(new Map<string, AbortController>());

  const patch = useCallback((key: string, p: Partial<DmTrayItem>) => {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }, []);

  const start = useCallback(
    (item: DmTrayItem) => {
      if (!conversationId || !userId) return;
      aborts.current.get(item.key)?.abort();
      const ctrl = new AbortController();
      aborts.current.set(item.key, ctrl);
      patch(item.key, { status: 'uploading', progress: 0, error: undefined });
      uploadDmFile({
        conversationId,
        userId,
        file: item.file,
        signal: ctrl.signal,
        onProgress: (progress) => patch(item.key, { progress }),
      })
        .then((attachment) => patch(item.key, { status: 'done', progress: 100, attachment }))
        .catch((e: unknown) => {
          if ((e as Error)?.name === 'AbortError') return;
          patch(item.key, { status: 'failed', error: (e as Error)?.message || 'That file did not go up.' });
        })
        .finally(() => {
          if (aborts.current.get(item.key) === ctrl) aborts.current.delete(item.key);
        });
    },
    [conversationId, userId, patch],
  );

  const add = useCallback(
    (files: File[]) => {
      if (!files.length || !conversationId || !userId) return;
      const room = DM_MAX_FILES - itemsRef.current.length;
      if (room <= 0) {
        toast(`Up to ${DM_MAX_FILES} files in one message`);
        return;
      }
      if (files.length > room) {
        toast(`Up to ${DM_MAX_FILES} files in one message`, { description: `${files.length - room} left out.` });
      }
      const fresh: DmTrayItem[] = files.slice(0, room).map((file) => {
        const kind = dmKindOf(file);
        return {
          key: crypto.randomUUID(),
          file,
          name: file.name || kind,
          kind,
          size: file.size,
          status: 'uploading',
          progress: 0,
          previewUrl: kind === 'image' ? URL.createObjectURL(file) : undefined,
        };
      });
      setItems((list) => [...list, ...fresh]);
      fresh.forEach(start);
    },
    [conversationId, userId, start],
  );

  const remove = useCallback((key: string) => {
    aborts.current.get(key)?.abort();
    aborts.current.delete(key);
    const gone = itemsRef.current.find((i) => i.key === key);
    if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
    setItems((list) => list.filter((i) => i.key !== key));
  }, []);

  const retry = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (item) start(item);
    },
    [start],
  );

  /** After a send: the tray empties. Files already in storage stay with the message. */
  const clear = useCallback(() => {
    for (const i of itemsRef.current) {
      if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
      if (i.status === 'uploading') aborts.current.get(i.key)?.abort();
    }
    aborts.current.clear();
    setItems([]);
  }, []);

  // A different conversation starts with an empty tray.
  useEffect(() => clear, [conversationId, clear]);

  const ready = items.filter((i) => i.status === 'done' && i.attachment).map((i) => i.attachment as DmAttachment);
  const pending = items.filter((i) => i.status === 'uploading').length;
  const failed = items.filter((i) => i.status === 'failed').length;

  return { items, add, remove, retry, clear, ready, pending, failed };
}

/** Drag files onto the conversation, and paste a screenshot into the box. */
export function useDmDrop(onFiles: (files: File[]) => void, enabled: boolean) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const bind = {
    onDragEnter: (e: DragEvent) => {
      if (!enabled || !hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!enabled || !hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (!enabled || !hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!enabled || !hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      onFiles(Array.from(e.dataTransfer.files ?? []));
    },
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!enabled) return;
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length) return;
    e.preventDefault();
    // A copied picture comes with a meaningless name; give it the moment it was pasted.
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    onFiles(
      files.map((f, i) =>
        f.name && f.name !== 'image.png'
          ? f
          : new File([f], `Screenshot-${stamp}${i ? `-${i + 1}` : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, {
              type: f.type,
              lastModified: f.lastModified,
            }),
      ),
    );
  };

  return { dragging, bind, onPaste };
}
