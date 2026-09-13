import { supabase } from '@/integrations/supabase/client';

/**
 * Files sent to Mo$ha: songs and artwork for a release, screenshots of a
 * problem. The shape below is a contract shared with the mosha-chat function
 * (body.attachments on the newest user turn) and mosha_messages.attachments.
 *
 * - storage 'r2': audio, sent through upload-url purpose 'mosha'. url is the
 *   public R2 address, path the storage key.
 * - storage 'private': pictures and every other file, in the private Supabase
 *   bucket mosha-attachments under <user id>/. path is what the server signs;
 *   url may be a short-lived signed link.
 */
export type MoshaAttachment = {
  id: string;
  kind: 'audio' | 'image' | 'file';
  name: string;
  mime: string;
  size: number;
  url: string;
  storage: 'r2' | 'private';
  path?: string;
  width?: number;
  height?: number;
  durationSec?: number;
};

export const ATTACH_BUCKET = 'mosha-attachments';
/** Files in one message. Keep in step with mosha_messages_attachments_check. */
export const MAX_ATTACHMENTS = 15;
/** Audio, like the Studio. */
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
/** Pictures (after shrinking) and any other file. Keep in step with the bucket limit. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const AUDIO_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  webm: 'audio/webm',
  flac: 'audio/flac',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  wma: 'audio/x-ms-wma',
  amr: 'audio/amr',
};

const IMAGE_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

function ext(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

/** What a picked file is, from its type or, when the phone gave none, its name. */
export function kindOf(file: { name: string; type: string }): MoshaAttachment['kind'] {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('audio/')) return 'audio';
  // A voice memo saved as .webm or .ogg can arrive typed as video.
  if (t.startsWith('image/')) return 'image';
  const e = ext(file.name);
  if (AUDIO_EXT[e] && !t.startsWith('video/')) return 'audio';
  if (IMAGE_EXT[e]) return 'image';
  return 'file';
}

/** A usable type even when the browser gave an empty one. */
export function mimeOf(file: { name: string; type: string }): string {
  if (file.type) return file.type.toLowerCase();
  const e = ext(file.name);
  return AUDIO_EXT[e] ?? IMAGE_EXT[e] ?? 'application/octet-stream';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** Only well formed attachments survive a read from the database. */
export function cleanAttachments(raw: unknown): MoshaAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is MoshaAttachment => {
      if (!a || typeof a !== 'object') return false;
      const x = a as Record<string, unknown>;
      return (
        typeof x.id === 'string' &&
        (x.kind === 'audio' || x.kind === 'image' || x.kind === 'file') &&
        (x.storage === 'r2' || x.storage === 'private') &&
        typeof x.name === 'string'
      );
    })
    .slice(0, MAX_ATTACHMENTS);
}

/** A line for a message that is only files, so the thread never shows an empty bubble. */
export function filesOnlyLine(count: number): string {
  return count === 1 ? 'Here is a file.' : `Here are ${count} files.`;
}

/* Signed links for private files, reused until shortly before they expire. */
const SIGN_SECONDS = 3600;
const signed = new Map<string, { url: string; until: number }>();
const signing = new Map<string, Promise<string | null>>();

/** A link the browser can open. Private files are signed for their owner. */
export async function attachmentUrl(att: MoshaAttachment): Promise<string | null> {
  if (att.storage === 'r2') return att.url || null;
  const path = att.path;
  if (!path) return att.url || null;
  const hit = signed.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const inflight = signing.get(path);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const { data, error } = await supabase.storage.from(ATTACH_BUCKET).createSignedUrl(path, SIGN_SECONDS);
      if (error || !data?.signedUrl) return null;
      signed.set(path, { url: data.signedUrl, until: Date.now() + (SIGN_SECONDS - 300) * 1000 });
      return data.signedUrl;
    } catch {
      return null;
    } finally {
      signing.delete(path);
    }
  })();
  signing.set(path, p);
  return p;
}
