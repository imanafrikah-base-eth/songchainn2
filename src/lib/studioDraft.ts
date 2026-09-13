/**
 * The release an artist is putting together in the Studio, kept on the phone
 * so a reload never costs it.
 *
 * Android often throws the page away while its file picker is open (13 Sep
 * 2026: N3M3SIS uploaded "wagwan" onto an EP, opened the picker for the next
 * track, and came back to a fresh app; she picked wagwan again and it went up
 * a second time). Nothing the page held survived that. Now the form is written
 * here as it changes, and the tracks whose files already landed are rebuilt
 * from their songs rows when the Studio opens again.
 *
 * Every storage touch is wrapped: a private window or a blocked webview simply
 * has no draft, and the Studio still works.
 */

import type { Featured } from '@/lib/songDetails';

export const DRAFT_VERSION = 1;
/** A draft older than this is somebody's abandoned afternoon, not work in progress. */
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const draftKey = (userId: string) => `songchainn_studio_draft:${userId}`;

export type DraftPhase = 'queued' | 'preparing' | 'uploading' | 'ready' | 'error';

export interface DraftTrack {
  songId: string | null;
  title: string;
  fileName: string;
  fileSize: number;
  phase: DraftPhase;
  /** It was already in the Studio before this release (the ?with= record, a waiting upload). */
  existing: boolean;
  trackNumber: number | null;
  genre: string | null;
  explicit: boolean;
  featured: Featured[];
}

export interface StudioDraft {
  v: number;
  at: number;
  releaseType: string;
  releaseTitle: string;
  releaseAbout: string;
  upc: string;
  genre: string;
  artistName: string;
  /** The shared artwork, only once it has landed. A picture still on the phone cannot be kept. */
  coverUrl: string | null;
  releaseId: string | null;
  tracks: DraftTrack[];
}

export function loadDraft(userId: string): StudioDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const d = JSON.parse(raw) as StudioDraft;
    if (!d || d.v !== DRAFT_VERSION || !Array.isArray(d.tracks) || typeof d.at !== 'number') return null;
    if (Date.now() - d.at > DRAFT_TTL_MS) {
      localStorage.removeItem(draftKey(userId));
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: Omit<StudioDraft, 'v' | 'at'>): void {
  try {
    if (!draft.tracks.length) {
      localStorage.removeItem(draftKey(userId));
      return;
    }
    localStorage.setItem(draftKey(userId), JSON.stringify({ ...draft, v: DRAFT_VERSION, at: Date.now() }));
  } catch {
    /* storage full or blocked: the rows on the server still hold the landed tracks */
  }
}

export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    /* nothing to clear */
  }
}

/* ------------------------------------------------------ the file picker --- */

const PICKER_KEY = 'songchainn_picker_open';
/** A picker left open longer than this was not what killed the page. */
const PICKER_TTL_MS = 20 * 60_000;

/** Right before the file picker opens: where to come back to if the page dies meanwhile. */
export function markPickerOpen(path: string): void {
  try {
    localStorage.setItem(PICKER_KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    /* no way back is written; the draft still restores inside the Studio */
  }
}

export function clearPickerOpen(): void {
  try {
    localStorage.removeItem(PICKER_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Once at boot, before the router reads the address. An installed app that
 * Android killed while the picker was open is started again at its start_url,
 * which is the home page, and the Studio is simply gone. When the note says a
 * picker was open a moment ago, put the person back where they were.
 *
 * Takes the location and history as arguments so it can be exercised outside
 * a browser.
 */
export function restoreStudioAfterPicker(
  loc: Pick<Location, 'pathname' | 'search'> = window.location,
  hist: Pick<History, 'replaceState'> = window.history,
  now: number = Date.now(),
): string | null {
  try {
    const raw = localStorage.getItem(PICKER_KEY);
    if (!raw) return null;
    localStorage.removeItem(PICKER_KEY);
    const { path, at } = JSON.parse(raw) as { path?: string; at?: number };
    if (!path || typeof at !== 'number' || now - at > PICKER_TTL_MS) return null;
    if (!path.startsWith('/studio')) return null;
    if (loc.pathname !== '/' && loc.pathname !== '') return null;
    hist.replaceState(null, '', path);
    return path;
  } catch {
    return null;
  }
}

/* --------------------------------------------- matching files to rows --- */

/** The same rule upload-url uses for the storage file name. Keep in step with slugify there. */
export function storageSlug(fileName: string): string {
  const s = fileName
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return s || 'track';
}

export interface UploadedRow {
  id: string;
  title: string | null;
  status: string;
  release_id: string | null;
  audio_url: string | null;
  storage_key: string | null;
  file_bytes: number | string | null;
  cover_art_url: string | null;
  genre: string | null;
  duration_seconds: number | string | null;
}

/** Is this picked file the one already sitting in this row? Same bytes, same file name. */
export function fileMatchesRow(file: { name: string; size: number }, row: Pick<UploadedRow, 'storage_key' | 'file_bytes'>): boolean {
  if (row.file_bytes === null || row.file_bytes === undefined) return false;
  if (Number(row.file_bytes) !== file.size) return false;
  const stored = (row.storage_key ?? '').split('/').pop() ?? '';
  return stored.replace(/\.[^.]+$/, '') === storageSlug(file.name);
}

/** What one draft track becomes when the Studio opens again. */
export type RestoredTrack =
  | { kind: 'uploaded'; track: DraftTrack; row: UploadedRow }
  | { kind: 'check'; track: DraftTrack; row: UploadedRow }
  | { kind: 'stopped'; track: DraftTrack };

/**
 * Decide, from the draft and the rows the server holds, what each track is.
 *
 *  uploaded  its file landed before the page went (phase 'ready', or it was
 *            already in the Studio), and the row is still waiting to be sent.
 *  check     a row was reserved but the page went mid-send; whether the bytes
 *            made it is checked by loading the file before it is trusted.
 *  stopped   nothing of it reached the server, or its row is gone or already
 *            out. It stays in its place and asks to be picked again.
 *
 * A row that has already gone to the judges or out is not brought back: it is
 * in the catalog below the form, where it belongs.
 */
export function planRestore(draft: StudioDraft, rows: UploadedRow[]): RestoredTrack[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const waiting = (r: UploadedRow | undefined) =>
    !!r && !!r.audio_url && (r.status === 'uploading' || r.status === 'workshop');
  const out: RestoredTrack[] = [];
  const seen = new Set<string>();
  for (const t of draft.tracks) {
    const row = t.songId ? byId.get(t.songId) : undefined;
    if (t.songId && seen.has(t.songId)) continue;
    if (t.songId) seen.add(t.songId);
    if (row && waiting(row)) {
      out.push(t.phase === 'ready' || t.existing ? { kind: 'uploaded', track: t, row } : { kind: 'check', track: t, row });
    } else if (t.songId && row && !waiting(row)) {
      // Sent, judged or published since: not part of this form any more.
      continue;
    } else if (t.existing) {
      // An already uploaded record whose row is gone: nothing to pick again from here.
      continue;
    } else {
      out.push({ kind: 'stopped', track: t });
    }
  }
  return out;
}
