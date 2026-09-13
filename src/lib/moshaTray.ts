import { supabase } from '@/integrations/supabase/client';
import { shrinkImage } from '@/lib/shrinkImage';
import { sendFile } from '@/lib/storageUpload';
import {
  ATTACH_BUCKET,
  formatBytes,
  kindOf,
  MAX_ATTACHMENTS,
  MAX_AUDIO_BYTES,
  MAX_FILE_BYTES,
  mimeOf,
  type MoshaAttachment,
} from '@/lib/moshaAttachments';

/**
 * The files waiting to go to Mo$ha, one tray per person.
 *
 * It lives outside every chat component on purpose. Closing the chat, going to
 * another page, opening the picker again, switching between the pop-up and the
 * Inbox, or the phone reloading the tab: none of it touches what is waiting.
 * Metadata and, until a file has gone up, the file itself are kept in
 * IndexedDB, so a reload picks up where it was. Only Send or the x empties it.
 *
 * Every file starts uploading the moment it is picked, so by the time the
 * person has finished typing most of it is already there. Three go at once;
 * one failing never holds up the others.
 */

export type TrayStatus = 'queued' | 'preparing' | 'uploading' | 'done' | 'failed' | 'refused';

export type TrayItem = {
  id: string;
  /** name + size + lastModified of what was picked: the same file twice is one file. */
  sig: string;
  name: string;
  mime: string;
  size: number;
  kind: MoshaAttachment['kind'];
  status: TrayStatus;
  progress: number;
  error?: string;
  /** A local picture of an image, for the chip. Never persisted. */
  previewUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  attachment?: MoshaAttachment;
  addedAt: number;
};

export type TraySnapshot = { items: TrayItem[]; notice: string | null; ready: boolean };

type Store = {
  snapshot: TraySnapshot;
  files: Map<string, File>;
  running: Set<string>;
  aborts: Map<string, () => void>;
  listeners: Set<() => void>;
  hydrated: Promise<void>;
};

const PARALLEL = 3;
const STALL_MS = 45_000;
const EMPTY: TraySnapshot = { items: [], notice: null, ready: true };
const stores = new Map<string, Store>();

/* ------------------------------------------------------------ IndexedDB --- */

const DB_NAME = 'songchainn-mosha-tray';
const DB_STORE = 'items';
type Persisted = { id: string; userId: string; meta: Partial<TrayItem> & Omit<TrayItem, 'previewUrl' | 'progress'>; blob?: Blob };

let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function dbRun(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest | void): Promise<unknown> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, mode);
      const req = fn(tx.objectStore(DB_STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    } catch {
      // A full disk or private mode: the tray still works for this page.
      resolve(undefined);
    }
  });
}

function persist(userId: string, item: TrayItem, file?: File): void {
  const { previewUrl, progress, ...meta } = item;
  void previewUrl;
  void progress;
  const rec: Persisted = { id: item.id, userId, meta, blob: item.status === 'done' ? undefined : file };
  void dbRun('readwrite', (s) => s.put(rec)).catch(() => undefined);
}

function unpersist(ids: string[]): void {
  if (!ids.length) return;
  void dbRun('readwrite', (s) => {
    for (const id of ids) s.delete(id);
  }).catch(() => undefined);
}

/* ---------------------------------------------------------------- store --- */

function emit(s: Store, patch: Partial<TraySnapshot>): void {
  s.snapshot = { ...s.snapshot, ...patch };
  s.listeners.forEach((l) => l());
}

function update(s: Store, id: string, patch: Partial<TrayItem>): TrayItem | null {
  let found: TrayItem | null = null;
  const items = s.snapshot.items.map((it) => {
    if (it.id !== id) return it;
    found = { ...it, ...patch };
    return found;
  });
  if (found) emit(s, { items });
  return found;
}

function storeFor(userId: string): Store {
  let s = stores.get(userId);
  if (s) return s;
  const created: Store = {
    snapshot: { items: [], notice: null, ready: false },
    files: new Map(),
    running: new Set(),
    aborts: new Map(),
    listeners: new Set(),
    hydrated: Promise.resolve(),
  };
  created.hydrated = hydrate(userId, created);
  stores.set(userId, created);
  s = created;
  return s;
}

async function hydrate(userId: string, s: Store): Promise<void> {
  try {
    const all = ((await dbRun('readonly', (st) => st.getAll())) as Persisted[] | undefined) ?? [];
    const mine = all.filter((r) => r && r.userId === userId).sort((a, b) => a.meta.addedAt - b.meta.addedAt);
    const restored: TrayItem[] = [];
    for (const r of mine) {
      const item: TrayItem = { ...r.meta, progress: r.meta.status === 'done' ? 100 : 0 };
      if (item.status !== 'done' && item.status !== 'refused') {
        if (r.blob) {
          const file = r.blob instanceof File ? r.blob : new File([r.blob], item.name, { type: item.mime });
          s.files.set(item.id, file);
          if (item.status !== 'failed') item.status = 'queued';
        } else {
          item.status = 'failed';
          item.error = 'This file was lost when the page closed. Remove it and add it again.';
        }
      }
      if (item.kind === 'image') {
        const f = s.files.get(item.id);
        if (f) item.previewUrl = safeObjectUrl(f);
      }
      restored.push(item);
    }
    // Anything added in the moment before the saved tray came back stays too.
    const known = new Set(restored.map((i) => i.id));
    emit(s, { items: [...restored, ...s.snapshot.items.filter((i) => !known.has(i.id))], ready: true });
  } catch {
    emit(s, { ready: true });
  }
  pump(userId, s);
}

function safeObjectUrl(f: Blob): string | undefined {
  try {
    return URL.createObjectURL(f);
  } catch {
    return undefined;
  }
}

export function subscribeTray(userId: string | null, listener: () => void): () => void {
  if (!userId) return () => undefined;
  const s = storeFor(userId);
  s.listeners.add(listener);
  return () => {
    s.listeners.delete(listener);
  };
}

export function getTray(userId: string | null): TraySnapshot {
  if (!userId) return EMPTY;
  return storeFor(userId).snapshot;
}

/** Add picked, dropped or pasted files. Explains, in the tray, anything not added. */
export function addToTray(userId: string, picked: File[]): void {
  const s = storeFor(userId);
  const files = picked.filter(Boolean);
  if (!files.length) return;
  const have = new Set(s.snapshot.items.map((i) => i.sig));
  let room = MAX_ATTACHMENTS - s.snapshot.items.length;
  const fresh: TrayItem[] = [];
  let dupes = 0;
  let over = 0;
  files.forEach((file, n) => {
    const sig = `${file.name}|${file.size}|${file.lastModified}`;
    if (have.has(sig)) {
      dupes += 1;
      return;
    }
    if (room <= 0) {
      over += 1;
      return;
    }
    have.add(sig);
    room -= 1;
    const kind = kindOf(file);
    const item: TrayItem = {
      id: crypto.randomUUID(),
      sig,
      name: file.name || (kind === 'image' ? 'Pasted picture.png' : 'File'),
      mime: mimeOf(file),
      size: file.size,
      kind,
      status: 'queued',
      progress: 0,
      addedAt: Date.now() + n / 1000,
    };
    const tooBig = refusal(item);
    if (tooBig) {
      item.status = 'refused';
      item.error = tooBig;
    } else {
      s.files.set(item.id, file);
      if (kind === 'image') item.previewUrl = safeObjectUrl(file);
    }
    fresh.push(item);
    persist(userId, item, tooBig ? undefined : file);
  });

  const notes: string[] = [];
  if (over) {
    notes.push(
      `You can send ${MAX_ATTACHMENTS} files in one message, so ${over === 1 ? '1 file was' : `${over} files were`} not added. Send these first, then add the rest to the next message.`,
    );
  }
  if (dupes) notes.push(dupes === 1 ? 'That file is already here.' : `${dupes} of those are already here.`);
  emit(s, { items: [...s.snapshot.items, ...fresh], notice: notes.length ? notes.join(' ') : null });
  pump(userId, s);
}

/** Why a file cannot go, before a byte moves. Pictures are judged after shrinking. */
function refusal(item: TrayItem): string | undefined {
  if (item.size <= 0) return 'This file is empty.';
  if (item.kind === 'audio' && item.size > MAX_AUDIO_BYTES) {
    return `Audio can be up to 100 MB. This one is ${formatBytes(item.size)}.`;
  }
  if (item.kind === 'file' && item.size > MAX_FILE_BYTES) {
    return `Files can be up to 25 MB. This one is ${formatBytes(item.size)}.`;
  }
  return undefined;
}

export function removeFromTray(userId: string, id: string): void {
  const s = storeFor(userId);
  const item = s.snapshot.items.find((i) => i.id === id);
  if (!item) return;
  s.aborts.get(id)?.();
  s.files.delete(id);
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  // A picture that already went up and was then taken back is not kept.
  if (item.attachment?.storage === 'private' && item.attachment.path) {
    void supabase.storage.from(ATTACH_BUCKET).remove([item.attachment.path]).catch(() => undefined);
  }
  unpersist([id]);
  emit(s, { items: s.snapshot.items.filter((i) => i.id !== id), notice: null });
  pump(userId, s);
}

export function retryTrayItem(userId: string, id: string): void {
  const s = storeFor(userId);
  if (!s.files.has(id)) return;
  update(s, id, { status: 'queued', progress: 0, error: undefined });
  pump(userId, s);
}

export function dismissTrayNotice(userId: string): void {
  const s = storeFor(userId);
  if (s.snapshot.notice) emit(s, { notice: null });
}

/** Sent: the tray empties. The uploaded files now belong to the message. */
export function clearTray(userId: string): void {
  const s = storeFor(userId);
  const ids = s.snapshot.items.map((i) => i.id);
  s.snapshot.items.forEach((i) => {
    s.aborts.get(i.id)?.();
    if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
  });
  s.files.clear();
  unpersist(ids);
  emit(s, { items: [], notice: null });
}

export function trayPending(items: TrayItem[]): number {
  return items.filter((i) => i.status === 'queued' || i.status === 'preparing' || i.status === 'uploading').length;
}

export function trayBlocked(items: TrayItem[]): number {
  return items.filter((i) => i.status === 'failed' || i.status === 'refused').length;
}

/**
 * Wait for every file still going up, then hand back what is ready. Refuses
 * (and says how many) when a file failed or cannot go, so nothing is sent
 * missing a file the person thinks is attached.
 */
export async function settleTray(
  userId: string,
): Promise<{ ok: true; attachments: MoshaAttachment[] } | { ok: false; blocked: number }> {
  const s = storeFor(userId);
  await s.hydrated;
  return new Promise((resolve) => {
    let unsub: (() => void) | null = null;
    const check = () => {
      const items = s.snapshot.items;
      if (trayPending(items)) return;
      unsub?.();
      const blocked = trayBlocked(items);
      if (blocked) resolve({ ok: false, blocked });
      else resolve({ ok: true, attachments: items.map((i) => i.attachment).filter((a): a is MoshaAttachment => Boolean(a)) });
    };
    s.listeners.add(check);
    unsub = () => s.listeners.delete(check);
    check();
  });
}

/* --------------------------------------------------------------- upload --- */

function pump(userId: string, s: Store): void {
  for (const it of s.snapshot.items) {
    if (s.running.size >= PARALLEL) break;
    if (it.status !== 'queued' || s.running.has(it.id) || !s.files.has(it.id)) continue;
    s.running.add(it.id);
    void run(userId, s, it.id).finally(() => {
      s.running.delete(it.id);
      s.aborts.delete(it.id);
      pump(userId, s);
    });
  }
}

function alive(s: Store, id: string): boolean {
  return s.snapshot.items.some((i) => i.id === id);
}

async function run(userId: string, s: Store, id: string): Promise<void> {
  const original = s.files.get(id);
  const start = s.snapshot.items.find((i) => i.id === id);
  if (!original || !start) return;
  try {
    update(s, id, { status: 'preparing', progress: 0, error: undefined });
    let file = original;
    const meta: Partial<TrayItem> = {};

    if (start.kind === 'image') {
      if (start.mime !== 'image/gif') file = await shrinkImage(original);
      const dims = await readImageSize(file);
      if (dims) Object.assign(meta, dims);
      if (file.size > MAX_FILE_BYTES) {
        if (alive(s, id)) {
          const item = update(s, id, { status: 'refused', error: `Pictures can be up to 25 MB. This one is ${formatBytes(file.size)}.` });
          if (item) persist(userId, item);
        }
        return;
      }
    } else if (start.kind === 'audio') {
      const d = await readDuration(original);
      if (d) meta.durationSec = d;
    }
    if (!alive(s, id)) return;
    const mime = file === original ? start.mime : file.type || start.mime;
    if (file.type !== mime) {
      file = new File([file], file.name || start.name, { type: mime, lastModified: file.lastModified });
    }
    update(s, id, { ...meta, status: 'uploading', progress: 0 });
    const onProgress = (pct: number) => {
      if (alive(s, id)) update(s, id, { progress: Math.min(99, pct) });
    };

    let attachment: MoshaAttachment;
    if (start.kind === 'audio') {
      attachment = await sendAudio(userId, s, id, file, start, onProgress);
    } else {
      attachment = await sendPrivate(userId, s, id, file, start, onProgress);
    }
    attachment = { ...attachment, width: meta.width, height: meta.height, durationSec: meta.durationSec };
    if (!alive(s, id)) {
      if (attachment.storage === 'private' && attachment.path) {
        void supabase.storage.from(ATTACH_BUCKET).remove([attachment.path]).catch(() => undefined);
      }
      return;
    }
    s.files.delete(id);
    const done = update(s, id, { status: 'done', progress: 100, attachment, size: file.size, mime });
    if (done) persist(userId, done);
  } catch (err) {
    if (!alive(s, id)) return;
    const message = err instanceof Error && err.message ? err.message : 'That did not go up.';
    const failed = update(s, id, { status: 'failed', error: message });
    if (failed) persist(userId, failed, s.files.get(id));
  }
}

/**
 * Audio takes the Studio's road into R2 (upload-url purpose 'mosha', no songs
 * row). If that door is not open, a clip that fits goes to the private bucket
 * instead, so a song or a voice note is never refused for the wrong reason.
 */
async function sendAudio(
  userId: string,
  s: Store,
  id: string,
  file: File,
  item: TrayItem,
  onProgress: (pct: number) => void,
): Promise<MoshaAttachment> {
  const { data, error } = await supabase.functions.invoke('upload-url', {
    body: { purpose: 'mosha', fileName: item.name, contentType: file.type, fileBytes: file.size },
  });
  const ticket = data as { attachmentId?: string; uploadUrl?: string; publicUrl?: string; storageKey?: string } | null;
  if (!error && ticket?.uploadUrl && ticket.publicUrl && ticket.attachmentId) {
    await sendFile(ticket.uploadUrl, file, { kind: 'mosha', id: ticket.attachmentId }, onProgress);
    return {
      id: ticket.attachmentId,
      kind: 'audio',
      name: item.name,
      mime: file.type,
      size: file.size,
      url: ticket.publicUrl,
      storage: 'r2',
      path: ticket.storageKey,
    };
  }
  if (file.size <= MAX_FILE_BYTES) return sendPrivate(userId, s, id, file, item, onProgress);
  throw new Error((await invokeError(error)) ?? 'That audio could not start going up. Tap to try again.');
}

async function invokeError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response } | null)?.context;
  try {
    if (ctx && typeof ctx.clone === 'function') {
      const body = (await ctx.clone().json()) as { error?: string };
      if (body?.error) return body.error;
    }
  } catch {
    /* no readable reason */
  }
  return null;
}

function safeName(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(-80);
  return base || 'file';
}

async function sendPrivate(
  userId: string,
  s: Store,
  id: string,
  file: File,
  item: TrayItem,
  onProgress: (pct: number) => void,
): Promise<MoshaAttachment> {
  const path = `${userId}/${id}/${safeName(file.name || item.name)}`;
  const bucket = supabase.storage.from(ATTACH_BUCKET);
  const { data, error } = await bucket.createSignedUploadUrl(path, { upsert: true });
  if (error || !data?.signedUrl) throw new Error('That file could not start going up. Tap to try again.');
  await xhrPut(data.signedUrl, file, s, id, onProgress);
  const { data: link } = await bucket.createSignedUrl(path, 7 * 24 * 3600);
  return {
    id,
    kind: item.kind,
    name: item.name,
    mime: file.type || item.mime,
    size: file.size,
    url: link?.signedUrl ?? '',
    storage: 'private',
    path,
  };
}

function xhrPut(url: string, file: File, s: Store, id: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };
    const stall = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        xhr.abort();
        finish(new Error('It stopped moving. Tap to try again.'));
      }, STALL_MS);
    };
    s.aborts.set(id, () => {
      xhr.abort();
      finish(new Error('Removed.'));
    });
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = (e) => {
      stall();
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) finish();
      else finish(new Error('Storage did not take that file. Tap to try again.'));
    };
    xhr.onerror = () => finish(new Error('The connection dropped. Tap to try again.'));
    stall();
    xhr.send(file);
  });
}

function readImageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = safeObjectUrl(file);
    if (!url) return resolve(null);
    const img = new Image();
    const done = (v: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    img.onload = () => done(img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.onerror = () => done(null);
    setTimeout(() => done(null), 10_000);
    img.src = url;
  });
}

function readDuration(file: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = safeObjectUrl(file);
    if (!url) return resolve(undefined);
    const audio = document.createElement('audio');
    let settled = false;
    const done = (v?: number) => {
      if (settled) return;
      settled = true;
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(v && Number.isFinite(v) ? v : undefined);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done();
    setTimeout(() => done(), 8_000);
    audio.src = url;
  });
}
