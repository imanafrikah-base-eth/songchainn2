import { supabase } from '@/integrations/supabase/client';
import { shrinkImage } from '@/lib/shrinkImage';

/**
 * Files people send each other in direct messages: photos, video, audio and
 * anything else.
 *
 * Everyone can send media in a private conversation, listener or artist. (Only
 * artists post media to the timeline and pages; that rule lives elsewhere and
 * is unchanged.) Files sit in the private dm-media bucket at
 * <conversation id>/<sender id>/<id>.<ext>, readable only by the people in
 * that conversation, and reach the screen as short-lived signed links.
 * send_direct_message keeps only files that are really there under the
 * sender's own folder of that conversation.
 */

export const DM_MEDIA_BUCKET = 'dm-media';
/** Files in one message. Keep in step with dm_messages_attachments_check. */
export const DM_MAX_FILES = 10;
const MB = 1024 * 1024;
/** Pictures are shrunk on the phone first; the limit is checked after. */
export const DM_LIMITS = { image: 25 * MB, video: 50 * MB, audio: 50 * MB, file: 25 * MB } as const;

export type DmAttachmentKind = 'image' | 'video' | 'audio' | 'file';

export interface DmAttachment {
  id: string;
  kind: DmAttachmentKind;
  name: string;
  mime: string;
  size: number;
  path: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  flac: 'audio/flac',
  amr: 'audio/amr',
  pdf: 'application/pdf',
};

function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

/** A usable type even when the phone gave an empty one. */
export function dmMimeOf(file: { name: string; type: string }): string {
  return (file.type || EXT_MIME[extOf(file.name)] || 'application/octet-stream').toLowerCase();
}

export function dmKindOf(file: { name: string; type: string }): DmAttachmentKind {
  const mime = dmMimeOf(file);
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

export function formatDmBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / MB;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function formatDmDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** What is wrong with the size, in words, or null when it fits. */
export function dmLimitProblem(kind: DmAttachmentKind, size: number): string | null {
  const cap = DM_LIMITS[kind];
  if (size <= cap) return null;
  const word = kind === 'image' ? 'Pictures' : kind === 'video' ? 'Videos' : kind === 'audio' ? 'Audio files' : 'Files';
  return `${word} can be up to ${Math.round(cap / MB)} MB.`;
}

const KINDS = new Set<DmAttachmentKind>(['image', 'video', 'audio', 'file']);

/** Only well formed attachments survive a read from the database. */
export function cleanDmAttachments(raw: unknown): DmAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: DmAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    if (typeof a.path !== 'string' || !a.path || !KINDS.has(a.kind as DmAttachmentKind)) continue;
    out.push({
      id: typeof a.id === 'string' ? a.id : a.path,
      kind: a.kind as DmAttachmentKind,
      name: typeof a.name === 'string' && a.name ? a.name : 'file',
      mime: typeof a.mime === 'string' ? a.mime : 'application/octet-stream',
      size: typeof a.size === 'number' ? a.size : 0,
      path: a.path,
      width: typeof a.width === 'number' ? a.width : undefined,
      height: typeof a.height === 'number' ? a.height : undefined,
      durationSec: typeof a.durationSec === 'number' ? a.durationSec : undefined,
    });
    if (out.length >= DM_MAX_FILES) break;
  }
  return out;
}

/* Signed links, reused until shortly before they expire. */
const SIGN_SECONDS = 3600;
const signed = new Map<string, { url: string; until: number }>();

/**
 * A link the browser can open, for somebody in the conversation. `fresh` signs
 * again even when a cached link has not run out (it failed to load), and
 * `download` makes the link save the file under that name.
 */
export async function dmMediaUrl(path: string, opts: { download?: string; fresh?: boolean } = {}): Promise<string | null> {
  const key = opts.download ? `${path}#download` : path;
  const hit = signed.get(key);
  if (!opts.fresh && hit && hit.until > Date.now()) return hit.url;
  try {
    const { data, error } = await supabase.storage
      .from(DM_MEDIA_BUCKET)
      .createSignedUrl(path, SIGN_SECONDS, opts.download ? { download: opts.download } : undefined);
    if (error || !data?.signedUrl) return null;
    signed.set(key, { url: data.signedUrl, until: Date.now() + (SIGN_SECONDS - 300) * 1000 });
    return data.signedUrl;
  } catch {
    return null;
  }
}

type Measured = Partial<Pick<DmAttachment, 'width' | 'height' | 'durationSec'>>;

/** Width and height of a picture or clip, length of a clip or recording. Best effort, never throws. */
function measure(file: File, kind: DmAttachmentKind): Promise<Measured> {
  if (kind === 'file' || typeof document === 'undefined') return Promise.resolve({});
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    let settled = false;
    // finish is only reached from the timeout once it fires, well after it exists.
    const timer = window.setTimeout(() => finish({}), 8000);
    const finish = (v: Measured) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(v);
    };
    if (kind === 'image') {
      const img = new Image();
      img.onload = () => finish({ width: img.naturalWidth || undefined, height: img.naturalHeight || undefined });
      img.onerror = () => finish({});
      img.src = url;
      return;
    }
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const durationSec = Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 10) / 10 : undefined;
      if (kind === 'video') {
        const v = el as HTMLVideoElement;
        finish({ width: v.videoWidth || undefined, height: v.videoHeight || undefined, durationSec });
      } else {
        finish({ durationSec });
      }
    };
    el.onerror = () => finish({});
    el.src = url;
  });
}

/**
 * Send one file into the conversation's folder, with progress. Pictures are
 * made lighter on the phone first. Resolves with the attachment to send, or
 * throws a message a person can read (an AbortError when it was removed).
 */
export async function uploadDmFile(o: {
  conversationId: string;
  userId: string;
  file: File;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}): Promise<DmAttachment> {
  const kind = dmKindOf(o.file);
  let file = o.file;
  if (kind === 'image') {
    try {
      file = await shrinkImage(o.file);
    } catch {
      file = o.file;
    }
  }
  if (!file.size) throw new Error('That file is empty.');
  const problem = dmLimitProblem(kind, file.size);
  if (problem) throw new Error(problem);

  const mime = dmMimeOf(file);
  const id = crypto.randomUUID();
  const ext = extOf(file.name) || extOf(o.file.name) || (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  const path = `${o.conversationId}/${o.userId}/${id}.${ext}`;

  const [{ data: session }, dims] = await Promise.all([supabase.auth.getSession(), measure(file, kind)]);
  const token = session?.session?.access_token;
  if (!token) throw new Error('Sign in to send files.');
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
  if (!base || !anon) throw new Error('Sending files is not set up here.');
  if (o.signal?.aborted) throw new DOMException('Removed', 'AbortError');

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${base}/storage/v1/object/${DM_MEDIA_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', anon);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', mime);
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) o.onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        o.onProgress?.(100);
        resolve();
        return;
      }
      let message = 'That file did not go up. Try again.';
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        const said = `${body?.message ?? ''} ${body?.error ?? ''}`;
        if (/exceed|too large|payload/i.test(said)) message = 'That file is too big to send.';
      } catch {
        /* keep the plain message */
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('The connection dropped. Try again.'));
    xhr.onabort = () => reject(new DOMException('Removed', 'AbortError'));
    o.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });

  return {
    id,
    kind,
    name: (o.file.name || `${kind}.${ext}`).slice(0, 200),
    mime,
    size: file.size,
    path,
    ...dims,
  };
}
