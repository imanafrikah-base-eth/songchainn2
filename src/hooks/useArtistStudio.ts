import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { celebrateLive } from '@/components/studio/LiveCelebration';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { EMPTY_DETAILS, saveSongDetails, type Featured, type SongDetails } from '@/lib/songDetails';
import { landCover as landCoverFile, NO_COVER } from '@/lib/coverArt';
import { sendFile } from '@/lib/storageUpload';
import { GENRES } from '@/data/musicData';
import { insertRelease, type ReleaseKind } from '@/hooks/useReleases';
import { fileMatchesRow, type DraftTrack, type UploadedRow } from '@/lib/studioDraft';

/**
 * The artist side of SONGCHAINN: upload a track, have it auditioned, and see
 * everything you own at whatever stage it is at.
 *
 * An account is all it takes to upload. A wallet is only ever needed to coin a
 * track, never to release one.
 */

/** 'held': the artist stopped the release; hidden from everyone, still in their Studio. */
export type ReleaseStatus = 'uploading' | 'auditioning' | 'published' | 'workshop' | 'held';

/**
 * Which rung of the standard a released track landed on.
 *
 * The standard is a ladder, not a door. Almost everything publishes; the rung
 * decides what a track is eligible for, not whether it exists.
 *
 *   master   meets the full SONGCHAINN standard, the bar the founding catalog
 *            set. Carries the mark.
 *   release  clean professional delivery. Eligible for featured placement.
 *   raw      out and playable, but short of clean delivery. Not pushed into
 *            hero slots, editorial or coining until it is tightened.
 */
export type ReleaseTier = 'master' | 'release' | 'raw';

export const TIER_LABEL: Record<ReleaseTier, string> = {
  master: 'Mastered to standard',
  release: 'Release ready',
  raw: 'Room to tighten',
};

export interface AuditionNote {
  code: string;
  metric?: string;
  measured?: number;
  limit?: number;
  target?: string;
  plain: string;
}

export interface AuditionResult {
  ok: boolean;
  passed?: boolean;
  at?: string;
  stage?: string;
  plain?: string;
  tier?: ReleaseTier;
  tierLabel?: string;
  failures?: AuditionNote[];
  advisories?: AuditionNote[];
  /** Exactly what stands between this track and the rung above it. */
  shortfalls?: AuditionNote[];
  hikulu?: string | null;
  nakulu?: string | null;
  metrics?: Record<string, number | string | null>;
  /**
   * Things that did not stop the release but did not go to plan either: a
   * cover that failed to land, details that could not be written. The artist
   * is told, instead of finding out from a blank square a week later.
   */
  warnings?: string[];
}

export interface ArtistRelease {
  id: string;
  title: string | null;
  artist_name: string | null;
  genre: string | null;
  status: ReleaseStatus;
  audio_url: string | null;
  cover_art_url: string | null;
  duration_seconds: number | null;
  created_at: string;
  published_at: string | null;
  audition: AuditionResult | null;
  /** 'app' streams here only; 'onchain' also asks for a coin on Base. */
  distribution: 'app' | 'onchain';
  onchain_requested_at: string | null;
  /** A date ahead keeps a published record private until that day. */
  release_date: string | null;
  /** The moment, when a time was set as well. */
  release_at: string | null;
  release_id: string | null;
  track_number: number | null;
  isrc: string | null;
  explicit: boolean | null;
  storage_key: string | null;
  file_bytes: number | null;
}

/** A published record whose day has not come yet. */
export function isScheduled(r: Pick<ArtistRelease, 'status' | 'release_date'> & { release_at?: string | null }): boolean {
  if (r.status !== 'published') return false;
  if (r.release_at) return new Date(r.release_at).getTime() > Date.now();
  if (!r.release_date) return false;
  return r.release_date > new Date().toISOString().slice(0, 10);
}

/** How long the judges get before a stuck audition can be asked again. */
export const AUDITION_STALE_MS = 20 * 60 * 1000;

/**
 * Every track this artist owns, newest first, at any stage. Ownership is
 * either the row's owner_id or the artist page the account holds, so an
 * artist who claimed a seeded page sees and edits their own catalogue.
 */
export function useArtistReleases() {
  const { user, artistId } = useAuth();
  return useQuery({
    queryKey: ['artist_releases', user?.id, artistId],
    enabled: !!user?.id,
    queryFn: async (): Promise<ArtistRelease[]> => {
      let q = supabase
        .from('songs')
        .select('id, title, artist_name, genre, status, audio_url, cover_art_url, duration_seconds, created_at, published_at, audition, distribution, onchain_requested_at, release_date, release_at, release_id, track_number, isrc, explicit, storage_key, file_bytes');
      q = artistId
        ? q.or(`owner_id.eq.${user!.id},artist_id.eq.${artistId.replace(/,/g, '')}`)
        : q.eq('owner_id', user!.id);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ArtistRelease[];
    },
    staleTime: 15_000,
  });
}

/**
 * What an artist can do to a record after it exists: throw away one that
 * never published, or ask the judges again when an audition got stuck
 * because the tab closed on it.
 */
export function useReleaseActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['artist_releases'] });
    await queryClient.invalidateQueries({ queryKey: ['published-catalog'] });
  }, [queryClient]);

  /** Only a record that never went live can be deleted. Live ones are part of people's playlists. */
  const deleteRelease = useCallback(
    async (songId: string) => {
      if (!user) throw new Error('Sign in first.');
      const { error, count } = await supabase
        .from('songs')
        .delete({ count: 'exact' })
        .eq('id', songId)
        .eq('owner_id', user.id)
        .neq('status', 'published');
      if (error) throw error;
      if (!count) throw new Error('A live record cannot be deleted from here. Write to songchaindao@gmail.com for a takedown.');
      await refresh();
    },
    [user, refresh],
  );

  const reaudition = useCallback(
    async (songId: string): Promise<AuditionResult> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const res = await fetch('/api/audition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ songId }),
      });
      const result = await res.json();
      await refresh();
      if (!res.ok && !result?.status) throw new Error(result?.error || 'The audition could not finish.');
      return shapeResult(result);
    },
    [refresh],
  );

  /**
   * Stop a release (founder, 15 Sep 2026): scheduled or already live, the records
   * come off SONGCHAINN and wait in the Studio as held. The server refuses a
   * record somebody has bought or whose coin is minted.
   */
  const stopRelease = useCallback(
    async (songIds: string[]) => {
      const { data, error } = await supabase.rpc('stop_release' as never, { p_song_ids: songIds } as never);
      if (error) throw new Error(error.message);
      await refresh();
      return Number(data ?? 0);
    },
    [refresh],
  );

  /** Put held records back out: now, or at a moment ahead. */
  const releaseHeld = useCallback(
    async (songIds: string[], at: Date | null) => {
      const { data, error } = await supabase.rpc('release_held' as never, {
        p_song_ids: songIds,
        p_release_at: at ? at.toISOString() : null,
      } as never);
      if (error) throw new Error(error.message);
      await refresh();
      return Number(data ?? 0);
    },
    [refresh],
  );

  return { deleteRelease, reaudition, stopRelease, releaseHeld };
}

function shapeResult(result: Record<string, unknown>, warnings: string[] = []): AuditionResult {
  const tier = result.tier;
  return {
    ok: true,
    passed: result.passed === true,
    tier: tier === 'master' || tier === 'release' || tier === 'raw' ? tier : undefined,
    tierLabel: typeof result.tierLabel === 'string' ? result.tierLabel : undefined,
    failures: (result.failures as AuditionNote[] | undefined) ?? [],
    advisories: (result.advisories as AuditionNote[] | undefined) ?? [],
    shortfalls: (result.shortfalls as AuditionNote[] | undefined) ?? [],
    hikulu: (result.hikulu as string | null | undefined) ?? null,
    nakulu: (result.nakulu as string | null | undefined) ?? null,
    metrics: (result.metrics as AuditionResult['metrics']) ?? undefined,
    plain: typeof result.error === 'string' ? result.error : undefined,
    warnings,
  };
}

export type UploadPhase = 'queued' | 'preparing' | 'uploading' | 'ready' | 'auditioning' | 'done' | 'error';

/**
 * One record in the queue. The file and its title belong to the row; the
 * artist name, cover, genre and paperwork are shared by the whole batch, the
 * way an EP is sent to a distributor.
 */
export interface QueuedTrack {
  key: string;
  file: File;
  title: string;
  /** Position on the release, when one is chosen. Editable per row. */
  trackNumber: number | null;
  /** Read in the browser before anything is sent. Null until known or unreadable. */
  seconds: number | null;
  phase: UploadPhase;
  progress: number;
  error: string | null;
  result: AuditionResult | null;
  songId: string | null;
  /** This track's own genre, when it differs from the release. Null follows the release. */
  genre: string | null;
  explicit: boolean;
  /** Who is on this one track. Empty falls back to the batch's featured list. */
  featured: Featured[];
  /**
   * A record already in the Studio (audio landed, not out yet) brought onto
   * this release instead of a new file. Its row is reused, never uploaded
   * again, and taking it out of the queue never deletes it.
   */
  existing?: { coverUrl: string | null; storageKey?: string | null; fileBytes?: number | null };
  /**
   * The page closed before this file got in (a reload, Android dropping the
   * tab behind its file picker). The row keeps its place and title and asks
   * for the file again; the size is how the same file is recognised.
   */
  stopped?: { fileSize: number };
}

/** The row an existing record is brought onto a release from. */
export interface ExistingRecord {
  id: string;
  title: string | null;
  genre: string | null;
  cover_art_url: string | null;
  duration_seconds: number | string | null;
  storage_key: string | null;
  file_bytes?: number | string | null;
}

const okGenre = (g: string | null | undefined): g is string => !!g && (GENRES as string[]).includes(g);

/** A record whose file is already in, as a row on the tracklist. Sending it never uploads it again. */
export function trackFromRow(
  song: ExistingRecord,
  from?: Pick<DraftTrack, 'title' | 'trackNumber' | 'genre' | 'explicit' | 'featured'>,
): QueuedTrack {
  const name = (song.storage_key ?? '').split('/').pop() || `${song.title || 'track'}.mp3`;
  const seconds = song.duration_seconds === null || song.duration_seconds === undefined ? null : Number(song.duration_seconds);
  const bytes = song.file_bytes === null || song.file_bytes === undefined ? null : Number(song.file_bytes);
  return {
    key: nextKey(),
    file: new File([], name),
    title: from?.title?.trim() || (song.title ?? '').trim() || titleFromFileName(name),
    trackNumber: from?.trackNumber ?? null,
    seconds: seconds !== null && Number.isFinite(seconds) ? seconds : null,
    phase: 'ready',
    progress: 100,
    error: null,
    result: null,
    songId: song.id,
    genre: okGenre(from?.genre) ? from!.genre : okGenre(song.genre) ? song.genre : null,
    explicit: from?.explicit ?? false,
    featured: from?.featured ?? [],
    existing: { coverUrl: song.cover_art_url, storageKey: song.storage_key, fileBytes: bytes !== null && Number.isFinite(bytes) ? bytes : null },
  };
}

/** A track the page lost before its file got in: same place, same title, waiting for the file. */
export function stoppedTrack(d: DraftTrack): QueuedTrack {
  return {
    key: nextKey(),
    file: new File([], d.fileName || 'track'),
    title: d.title,
    trackNumber: d.trackNumber,
    seconds: null,
    phase: 'error',
    progress: 0,
    error: `This one stopped before it finished uploading. Pick ${d.fileName || 'the file'} again and it goes back in this place.`,
    result: null,
    songId: null,
    genre: okGenre(d.genre) ? d.genre : null,
    explicit: !!d.explicit,
    featured: d.featured ?? [],
    stopped: { fileSize: d.fileSize },
  };
}

/**
 * Does this audio file actually exist at that address? Loads only its
 * metadata through an audio element, which needs no CORS (the bucket sends no
 * Access-Control-Allow-Origin on HEAD, so the length cannot be read from a
 * fetch). A PUT into R2 is all or nothing, so a file that loads is whole.
 */
export function audioLoads(url: string, timeoutMs = 12_000): Promise<boolean> {
  return new Promise((resolve) => {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      a.removeAttribute('src');
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    a.onloadedmetadata = () => done(true);
    a.onerror = () => done(false);
    a.src = url;
  });
}

/**
 * The same file picked again after it already went up: the row that holds it,
 * so it is used instead of uploading a second copy (N3M3SIS sent "wagwan" twice
 * on 13 Sep 2026, identical bytes, after the page reset under her). 'queued'
 * means that row is already on the tracklist. Never throws; any doubt uploads.
 */
async function findLandedCopy(file: File, userId: string, queue: QueuedTrack[]): Promise<UploadedRow | 'queued' | null> {
  if (!file.size) return null;
  try {
    const { data, error } = await supabase
      .from('songs')
      .select('id, title, status, release_id, audio_url, storage_key, file_bytes, cover_art_url, genre, duration_seconds')
      .eq('owner_id', userId)
      .eq('status', 'uploading')
      .is('release_id', null)
      .eq('file_bytes', file.size)
      .order('created_at', { ascending: true })
      .limit(10);
    if (error || !data) return null;
    const rows = (data as unknown as UploadedRow[]).filter((r) => !!r.audio_url && fileMatchesRow(file, r));
    for (const r of rows) {
      if (!(await audioLoads(r.audio_url as string))) continue;
      return queue.some((t) => t.songId === r.id) ? 'queued' : r;
    }
    return null;
  } catch {
    return null;
  }
}

/** A new EP, album, mixtape or compilation made for this batch. */
export interface NewReleaseMeta {
  title: string;
  kind: ReleaseKind;
  release_date?: string | null;
  description?: string | null;
  upc?: string | null;
}

export interface BatchMeta {
  artistName: string;
  genre?: string;
  /** A cover file, landed at send time (the Mo$ha flow). */
  cover?: File | null;
  /** A cover already landing or landed in the background (the Studio). Wins over `cover`. */
  coverUrl?: string | Promise<string> | null;
  /** A track's own artwork, when it has one. Wins over the shared cover. */
  coverFor?: (key: string) => string | Promise<string> | null;
  /** Make one releases row for the whole batch; tracks are numbered in queue order. */
  release?: NewReleaseMeta | null;
  /** Credits, splits, paperwork, release and distribution, shared by every track. */
  details?: SongDetails;
}

/** The fields that belong to one record, never to a batch of them. */
const PER_TRACK_ONLY: Array<keyof SongDetails> = ['lyrics', 'description', 'isrc', 'iswc'];

let keySeq = 0;
const nextKey = () => `t${Date.now().toString(36)}${(keySeq++).toString(36)}`;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** "(Final)", "[Master]", "(v2)" and the like, which are notes to self, never part of a title. */
const JUNK_TAIL = /\s*[([]\s*(final|master(ed)?|mastered final|final master|mix ?down|wav|mp3|hq|320 ?(kbps)?|v\d+)\s*[)\]]\s*$/i;
/** "01 ", "01. ", "3 - ", "Track 04 - ". A bare "7 Rings" keeps its number. */
const LEADING_NUMBER = /^(?:(?:track|trk)\s*\d{1,3}\s*[-.)_]?\s*|0\d\s*[-.)_]?\s*|\d{1,3}\s*[-.)_]\s*)/i;

/**
 * A title from a file name, the way an artist would have typed it: the
 * extension, underscores, a leading track number, their own name in front
 * ("ARTIST - Song") or behind, and notes like "(Final)" all go.
 */
export function titleFromFileName(name: string, artistName?: string): string {
  let t = name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(LEADING_NUMBER, '');
  const artist = (artistName ?? '').trim();
  if (artist) {
    const a = escapeRe(artist);
    t = t.replace(new RegExp(`^${a}\\s*[-–:]\\s*`, 'i'), '').replace(new RegExp(`\\s*[-–]\\s*${a}$`, 'i'), '');
    t = t.replace(LEADING_NUMBER, '');
  }
  for (let i = 0; i < 2; i++) t = t.replace(JUNK_TAIL, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t || name.replace(/\.[^.]+$/, '') || name;
}

/** When every file in a pick shares one "Something - " prefix, that prefix is the artist, not the title. */
function stripSharedPrefix(titles: string[]): string[] {
  if (titles.length < 2) return titles;
  const prefixes = titles.map((t) => t.match(/^(.+?)\s+[-–]\s+(.+)$/)?.[1]?.toLowerCase() ?? null);
  if (!prefixes[0] || prefixes.some((p) => p !== prefixes[0])) return titles;
  return titles.map((t) => t.replace(/^(.+?)\s+[-–]\s+/, '').replace(LEADING_NUMBER, '').trim() || t);
}

/**
 * Send one record, or an EP's worth, in one go.
 *
 * The file starts going up the moment it is picked, before a title is typed
 * or a cover chosen, so by the time the artist presses Send the bytes are
 * already in and the rest is a second's work: names, cover, paperwork, then
 * the judges. Files go up one after another (one XHR keeps a slow connection
 * honest and the progress bar true); auditions run without waiting on each
 * other. Each row carries its own state, so a failed track can be sent again
 * without touching the ones that are already live.
 */
export function useBatchUpload() {
  const { user, artistId } = useAuth();
  const queryClient = useQueryClient();
  const [tracks, setTracks] = useState<QueuedTrack[]>([]);
  const tracksRef = useRef<QueuedTrack[]>([]);
  tracksRef.current = tracks;
  const [running, setRunning] = useState(false);
  // The cover lands once; every song row points at the same file.
  const coverUrlRef = useRef<string | null>(null);
  /** The release made for this batch, once, so a retry never makes a second one. */
  const releaseIdRef = useRef<string | null>(null);
  /** What a ticket is stamped with before the artist has typed anything. */
  const defaultsRef = useRef<{ artistName: string }>({ artistName: '' });
  /** One file at a time: the landing chain. */
  const landingRef = useRef<Promise<void>>(Promise.resolve());
  /** Per track, the promise that resolves once its file has landed (or failed). */
  const landedRef = useRef<Map<string, Promise<void>>>(new Map());
  /** Titles the judges passed since the last celebration. */
  const passedRef = useRef<string[]>([]);

  const patch = useCallback((key: string, p: Partial<QueuedTrack> | ((t: QueuedTrack) => Partial<QueuedTrack>)) => {
    setTracks((list) => list.map((t) => (t.key === key ? { ...t, ...(typeof p === 'function' ? p(t) : p) } : t)));
  }, []);

  /**
   * Queue files. The same file twice is ignored, and so is a file that is
   * already on the list as an uploaded record. A file the page lost goes back
   * into its own place. Each one's length is read as it lands in the list.
   * Returns the names that were already there, so the form can say so.
   */
  const add = useCallback((files: File[], opts?: { onRelease: boolean }): { added: number; already: string[] } => {
    const list = tracksRef.current;
    const already: string[] = [];
    const taken = new Set(list.filter((t) => !t.stopped && !t.existing).map((t) => `${t.file.name}:${t.file.size}`));
    const unique = files.filter((f) => {
      const k = `${f.name}:${f.size}`;
      const onList =
        taken.has(k) ||
        list.some((t) => t.existing && fileMatchesRow(f, { storage_key: t.existing.storageKey ?? null, file_bytes: t.existing.fileBytes ?? null }));
      if (onList) {
        already.push(f.name);
        return false;
      }
      taken.add(k);
      return true;
    });
    const refilled: Array<{ key: string; file: File }> = [];
    const fresh = unique.filter((f) => {
      const slot = list.find((t) => t.stopped && t.file.name === f.name && t.stopped.fileSize === f.size && !refilled.some((r) => r.key === t.key));
      if (!slot) return true;
      refilled.push({ key: slot.key, file: f });
      return false;
    });
    const highest = list.reduce((m, t) => Math.max(m, t.trackNumber ?? 0), 0);
    const titles = stripSharedPrefix(fresh.map((f) => titleFromFileName(f.name, defaultsRef.current.artistName)));
    const entries: QueuedTrack[] = fresh.map((file, i) => ({
      key: nextKey(),
      file,
      title: titles[i],
      trackNumber: opts?.onRelease ? highest + i + 1 : null,
      seconds: null,
      phase: 'queued',
      progress: 0,
      error: null,
      result: null,
      songId: null,
      genre: null,
      explicit: false,
      featured: [],
    }));
    if (!entries.length && !refilled.length) return { added: 0, already };
    const refill = (t: QueuedTrack, file: File): QueuedTrack => ({ ...t, file, stopped: undefined, phase: 'queued', progress: 0, error: null });
    setTracks((cur) => [
      ...cur.map((t) => {
        const r = refilled.find((x) => x.key === t.key);
        return r ? refill(t, r.file) : t;
      }),
      ...entries,
    ]);
    for (const r of refilled) {
      const slot = list.find((t) => t.key === r.key);
      if (!slot) continue;
      void readDuration(r.file).then((seconds) => patch(r.key, { seconds }));
      queueLanding(refill(slot, r.file));
    }
    for (const e of entries) {
      void readDuration(e.file).then((seconds) => patch(e.key, { seconds }));
      queueLanding(e);
    }
    return { added: entries.length + refilled.length, already };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch]);

  const setDefaults = useCallback((d: { artistName: string }) => { defaultsRef.current = d; }, []);

  /**
   * Put a record that is already uploaded on the tracklist, at the top by
   * default. The file is in, so the row is 'ready' straight away and Send only
   * writes the names, the release and the track number onto it before the judges.
   */
  const attachExisting = useCallback((song: ExistingRecord, opts?: { atEnd?: boolean }) => {
    const entry = trackFromRow(song);
    setTracks((cur) => {
      // Checked inside the update, so two callers in the same moment cannot both add it.
      if (cur.some((t) => t.songId === song.id)) return cur;
      const next = opts?.atEnd ? [...cur, entry] : [entry, ...cur];
      return next.some((t) => t.trackNumber) ? next.map((t, i) => ({ ...t, trackNumber: i + 1 })) : next;
    });
  }, []);

  /** A tracklist rebuilt after a reload goes in first, in its saved order; anything picked since stays after it. */
  const restoreTracks = useCallback((list: QueuedTrack[]) => {
    setTracks((cur) => {
      const ids = new Set(list.map((t) => t.songId).filter(Boolean));
      return [...list, ...cur.filter((t) => !t.songId || !ids.has(t.songId))];
    });
  }, []);

  /** The release made for this batch survives a reload too, so Send never makes a second one. */
  const getReleaseId = useCallback(() => releaseIdRef.current, []);
  const setReleaseId = useCallback((id: string | null) => { releaseIdRef.current = id; }, []);

  /** Take a track out. A row already reserved for it goes too, unless it is live or was already in the Studio. */
  const remove = useCallback((key: string) => {
    const t = tracksRef.current.find((x) => x.key === key);
    setTracks((list) => list.filter((x) => x.key !== key));
    if (t?.songId && user && t.phase !== 'done' && !t.existing) {
      void supabase.from('songs').delete().eq('id', t.songId).eq('owner_id', user.id).neq('status', 'published').then(() => {
        void queryClient.invalidateQueries({ queryKey: ['artist_releases'] });
      });
    }
  }, [user, queryClient]);

  const setSeconds = useCallback((key: string, seconds: number | null) => patch(key, { seconds }), [patch]);
  const setTitle = useCallback((key: string, title: string) => patch(key, { title }), [patch]);
  const setTrackNumber = useCallback((key: string, trackNumber: number | null) => patch(key, { trackNumber }), [patch]);
  /** A track's own genre, explicit flag and featured artists. */
  const setExtras = useCallback(
    (key: string, p: Partial<Pick<QueuedTrack, 'genre' | 'explicit' | 'featured'>>) => patch(key, p),
    [patch],
  );

  /** Move a track to another place in the running order. */
  const moveTo = useCallback((from: number, to: number) => {
    setTracks((list) => {
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      // A numbered queue keeps its numbers in running order.
      return next.some((t) => t.trackNumber) ? next.map((t, i) => ({ ...t, trackNumber: i + 1 })) : next;
    });
  }, []);
  const move = useCallback((key: string, delta: number) => {
    const i = tracksRef.current.findIndex((t) => t.key === key);
    if (i >= 0) moveTo(i, i + delta);
  }, [moveTo]);

  /** Number every queued track 1..n in queue order, or clear the numbers. */
  const numberAll = useCallback((on: boolean) => {
    setTracks((list) => list.map((t, i) => ({ ...t, trackNumber: on ? i + 1 : null })));
  }, []);

  const reset = useCallback(() => {
    setTracks([]);
    coverUrlRef.current = null;
    releaseIdRef.current = null;
    landedRef.current = new Map();
  }, []);

  /** The judges, for one record whose file is already in. Never throws. */
  const runAudition = useCallback(
    async (key: string, songId: string, warnings: string[]) => {
      patch(key, { phase: 'auditioning', progress: 100, error: null });
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        const res = await fetch('/api/audition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ songId }),
        });
        const result = await res.json();
        if (!res.ok && !result?.status) throw new Error(result?.error || 'The audition could not finish.');
        patch(key, { phase: 'done', progress: 100, error: null, result: shapeResult(result, warnings) });
        // Live now, not the workshop and not a later release day.
        if (result?.passed === true && (typeof result?.status !== 'string' || result.status === 'published')) {
          passedRef.current.push(tracksRef.current.find((x) => x.key === key)?.title?.trim() || 'Your song');
        }
      } catch (err) {
        // The file is in and the row exists: this is a stuck audition, not a
        // lost record. The row offers to ask again.
        patch(key, {
          phase: 'error',
          error: `${err instanceof Error ? err.message : 'The audition could not finish.'} The file is in; ask the judges again.`,
        });
      } finally {
        await queryClient.invalidateQueries({ queryKey: ['artist_releases'] });
        await queryClient.invalidateQueries({ queryKey: ['published_catalog'] });
      }
    },
    [patch, queryClient],
  );

  /**
   * Get one file into the bucket: reserve the row, PUT the bytes, mark the
   * row ready. Runs the moment a file is picked. The title on the ticket is
   * the file name and the artist name is whatever the form knows so far;
   * both are rewritten at send time.
   */
  const landOne = useCallback(
    async (track: QueuedTrack) => {
      if (!user) { patch(track.key, { phase: 'error', error: 'Sign in to upload.' }); return; }
      const { key, file } = track;
      patch(key, { phase: 'preparing', progress: 0, error: null, result: null });
      let reservedSongId: string | null = null;
      try {
        // Already up once (the page reset after it landed, and the artist
        // picked it again): use that row, never send a second copy.
        const copy = await findLandedCopy(file, user.id, tracksRef.current);
        if (copy === 'queued') {
          setTracks((list) => list.filter((t) => t.key !== key));
          return;
        }
        if (copy) {
          patch(key, {
            songId: copy.id,
            phase: 'ready',
            progress: 100,
            existing: { coverUrl: copy.cover_art_url, storageKey: copy.storage_key, fileBytes: file.size },
          });
          return;
        }

        const { data: ticket, error: ticketError } = await supabase.functions.invoke('upload-url', {
          body: {
            title: (tracksRef.current.find((t) => t.key === key)?.title ?? track.title).trim() || titleFromFileName(file.name),
            artistName: defaultsRef.current.artistName || 'Artist',
            genre: null,
            fileName: file.name,
            contentType: file.type,
            fileBytes: file.size,
          },
        });
        if (ticketError || !ticket?.uploadUrl) {
          const message =
            (ticketError as { context?: { body?: string } })?.context?.body ||
            ticket?.error ||
            ticketError?.message ||
            'Could not start the upload.';
          throw new Error(typeof message === 'string' ? safeMessage(message) : 'Could not start the upload.');
        }
        reservedSongId = typeof ticket.songId === 'string' ? ticket.songId : null;
        patch(key, { songId: ticket.songId, phase: 'uploading', progress: 0 });
        await sendFile(ticket.uploadUrl, file, { kind: 'song', id: ticket.songId }, (progress) =>
          patch(key, (t) => (t.phase === 'uploading' ? { progress } : {})),
        );
        patch(key, { phase: 'ready', progress: 100 });
      } catch (err) {
        if (reservedSongId) {
          const orphan = reservedSongId;
          // .then, or the lazy builder never sends and the empty record stays stuck at uploading.
          void supabase.from('songs').delete().eq('id', orphan).eq('owner_id', user.id).neq('status', 'published').then(() => undefined);
        }
        patch(key, { phase: 'error', progress: 0, songId: null, error: err instanceof Error ? err.message : 'Something went wrong.', result: null });
      }
    },
    [user, patch],
  );

  const queueLanding = useCallback(
    (track: QueuedTrack) => {
      const p = landingRef.current.then(() => landOne(track));
      landingRef.current = p.catch(() => undefined);
      landedRef.current.set(track.key, p.catch(() => undefined));
    },
    [landOne],
  );

  /** The cover, once, through the visual upload door; every row points at it. Throws when it does not land. */
  const landCover = useCallback(
    async (cover: File): Promise<string> => {
      if (coverUrlRef.current) return coverUrlRef.current;
      const url = await landCoverFile(cover);
      coverUrlRef.current = url;
      return url;
    },
    [],
  );

  /**
   * One record, start to finish. Resolves once the file is in the bucket and
   * the audition has been asked for; the audition itself is returned as a
   * promise so the caller can move on to the next file while the judges work.
   */
  const sendOne = useCallback(
    async (
      track: QueuedTrack,
      meta: BatchMeta,
      batchSize: number,
      coverUrl: string | null,
      release: { id: string; trackNumber: number } | null,
    ): Promise<{ audition: Promise<void> }> => {
      if (!user) throw new Error('Sign in to upload.');
      const { key } = track;
      // Still landing, or failed before it landed: get it in first.
      let cur = tracksRef.current.find((t) => t.key === key) ?? track;
      if (cur.phase === 'queued' || (cur.phase === 'error' && !cur.songId)) queueLanding(cur);
      const landed = landedRef.current.get(key);
      if (landed) await landed;
      cur = tracksRef.current.find((t) => t.key === key) ?? cur;
      if (cur.phase !== 'ready' || !cur.songId) return { audition: Promise.resolve() };
      const songId = cur.songId;
      const warnings: string[] = [];

      const base = meta.details ?? (release ? EMPTY_DETAILS : undefined);
      const details: SongDetails | undefined = base
        ? {
            ...base,
            ...(batchSize > 1 ? (Object.fromEntries(PER_TRACK_ONLY.map((k) => [k, null])) as Partial<SongDetails>) : {}),
            ...(release
              ? { release_id: release.id, track_number: release.trackNumber }
              : { track_number: base.release_id ? cur.trackNumber : null }),
            featured: cur.featured?.length ? cur.featured : base.featured,
            explicit: Boolean(cur.explicit) || base.explicit,
          }
        : undefined;

      // The names the artist typed, and the cover, onto the row that already
      // holds the file. The cover landed before this was called (start does
      // it once for the batch); with no cover nothing goes live, so nothing is sent.
      if (!coverUrl) {
        // This used to return quietly. The audio was already in the bucket by
        // then, so the row sat at 'uploading' for ever: no cover, no audition,
        // and nothing on screen saying why. One artist stranded eleven records
        // that way and sent the same song three times trying to get through.
        patch(key, { phase: 'error', error: NO_COVER });
        return { audition: Promise.resolve() };
      }
      await supabase
        .from('songs')
        .update({
          title: cur.title.trim() || titleFromFileName(cur.file.name),
          artist_name: meta.artistName,
          genre: cur.genre || meta.genre || null,
          cover_art_url: coverUrl,
        } as never)
        .eq('id', songId);

      if (details) {
        try {
          await saveSongDetails(songId, {
            ...details,
            onchain_requested_at: details.distribution === 'onchain' ? new Date().toISOString() : null,
          });
          if (details.distribution === 'onchain') {
            await supabase.from('songs').update({ onchain_requested_at: new Date().toISOString() } as never).eq('id', songId);
          }
        } catch (detailsErr) {
          console.error('Song details could not be saved at upload, continuing', detailsErr);
          warnings.push('The credits and paperwork could not be saved. Open Edit details on the record and add them again.');
        }
      }

      return { audition: runAudition(key, songId, warnings) };
    },
    [user, queueLanding, runAudition, patch],
  );

  /** A track whose file landed but whose audition fell over: ask once more. */
  const askAgain = useCallback(
    async (key: string) => {
      const t = tracksRef.current.find((x) => x.key === key);
      if (!t || t.phase !== 'error' || !t.songId) return;
      await runAudition(key, t.songId, t.result?.warnings ?? []);
      const wentLive = passedRef.current.splice(0);
      if (wentLive.length) celebrateLive({ titles: wentLive });
    },
    [runAudition],
  );

  /**
   * Send every track that has not gone yet (queued, or failed before its file
   * landed). Tracks already live or with the judges are left alone, so this
   * doubles as "retry what failed". Pass a key to send just that one.
   */
  const start = useCallback(
    async (meta: BatchMeta, only?: string) => {
      if (running) return;
      const todo = tracks.filter((t) =>
        (only ? t.key === only : true)
        && !t.stopped
        && (t.phase === 'queued' || t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || (t.phase === 'error' && !t.songId)),
      );
      if (!todo.length) return;
      // A record always files under a genre, its own or the release's. The
      // form enforces it; this stops any other caller sending one without.
      const genreOk = (g: string | null | undefined) => !!g && (GENRES as string[]).includes(g);
      if (todo.some((t) => !genreOk(t.genre) && !genreOk(meta.genre))) {
        throw new Error('Pick a genre before you send. Every record files under one.');
      }
      // Nothing goes live without artwork, so nothing is sent without it:
      // every track needs its own or the shared one.
      const hasShared = !!meta.coverUrl || !!meta.cover;
      if (!hasShared && todo.some((t) => !meta.coverFor?.(t.key) && !t.existing?.coverUrl)) throw new Error(NO_COVER);
      setRunning(true);
      const auditions: Promise<void>[] = [];
      /** The artwork failing never costs the audio: the files stay in and the send can be pressed again. */
      const artwork = async (p: string | Promise<string>): Promise<string> => {
        try {
          return await p;
        } catch (err) {
          throw new Error(`${(err as Error)?.message || 'The artwork did not upload.'} Your audio is safe. Add the artwork again and send.`);
        }
      };
      try {
        const shared = meta.coverUrl
          ? await artwork(meta.coverUrl)
          : meta.cover ? await artwork(landCover(meta.cover)) : null;

        // One releases row for an EP, album, mixtape or compilation, made
        // once. The running order is the order of the queue.
        let release: { id: string } | null = null;
        if (meta.release) {
          if (!releaseIdRef.current) {
            if (!user || !artistId) {
              throw new Error('This account is not linked to an artist page yet, so the release cannot be made. Send the tracks as a catalog, or claim your page first.');
            }
            const made = await insertRelease({
              artistId,
              ownerId: user.id,
              title: meta.release.title,
              kind: meta.release.kind,
              release_date: meta.release.release_date ?? null,
              description: meta.release.description ?? null,
              upc: meta.release.upc ?? null,
              cover_art_url: shared,
            });
            releaseIdRef.current = made.id;
            await queryClient.invalidateQueries({ queryKey: ['release-groups'] });
          }
          release = { id: releaseIdRef.current };
        }

        let firstCover: string | null = shared;
        for (const t of todo) {
          const own = meta.coverFor?.(t.key);
          // A record already in the Studio keeps the artwork it has when nothing else is given.
          const cover = own ? await artwork(own) : (shared ?? t.existing?.coverUrl ?? null);
          firstCover = firstCover ?? cover;
          const position = tracksRef.current.findIndex((x) => x.key === t.key) + 1;
          const slot = release ? { id: release.id, trackNumber: Math.max(1, position) } : null;
          auditions.push((await sendOne(t, meta, tracks.length, cover, slot)).audition);
        }
        await Promise.all(auditions);
        // Once for the whole send: the notes and "Your EP is live".
        const wentLive = passedRef.current.splice(0);
        if (wentLive.length) celebrateLive({ titles: wentLive, releaseTitle: meta.release?.title ?? null, kind: meta.release?.kind ?? null });
        // The release gets the batch's cover if it has none of its own.
        const releaseId = release?.id ?? meta.details?.release_id ?? null;
        if (releaseId && firstCover) {
          await supabase
            .from('releases' as never)
            .update({ cover_art_url: firstCover } as never)
            .eq('id', releaseId)
            .is('cover_art_url', null);
          await queryClient.invalidateQueries({ queryKey: ['release-groups'] });
        }
      } finally {
        setRunning(false);
      }
    },
    [running, tracks, sendOne, landCover, queryClient, user, artistId],
  );

  /** Something is with the judges or the send is running. Files landing on their own do not block the form. */
  const busy = running || tracks.some((t) => t.phase === 'auditioning');
  /** Files still on their way up. */
  const landing = tracks.some((t) => t.phase === 'preparing' || t.phase === 'uploading');
  /** Every track has had its go: live, in the workshop, or stuck with a file in. Nothing left to send. */
  const finished = tracks.length > 0 && !busy && tracks.every((t) => t.phase === 'done' || (t.phase === 'error' && !!t.songId));

  /**
   * Two soft notes, once each per batch: one when the music starts going up,
   * one when every file in the batch is in. Files go up one after another, so
   * "landing" blinks off between two of them; the success note waits a moment
   * to be sure the next file is not about to start.
   */
  const announcedRef = useRef(false);
  const doneTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (doneTimerRef.current !== null) {
      window.clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
    if (landing) {
      if (!announcedRef.current) {
        announcedRef.current = true;
        toast('Upload in progress', { id: 'music-upload', description: 'Your music is going up. Keep filling in the details.', duration: 3500 });
      }
      return;
    }
    if (!announcedRef.current) return;
    doneTimerRef.current = window.setTimeout(() => {
      doneTimerRef.current = null;
      announcedRef.current = false;
      const list = tracksRef.current;
      if (list.some((t) => t.phase === 'queued' && !t.stopped)) return;
      const failed = list.some((t) => t.phase === 'error' && !t.songId && !t.stopped);
      if (failed) return;
      if (list.some((t) => !!t.songId)) {
        toast.success('Upload successful', { id: 'music-upload', description: 'Your files are in.', duration: 3500 });
      }
    }, 900);
  }, [landing]);
  useEffect(() => () => { if (doneTimerRef.current !== null) window.clearTimeout(doneTimerRef.current); }, []);

  return { tracks, busy, landing, finished, add, attachExisting, restoreTracks, getReleaseId, setReleaseId, remove, setSeconds, setTitle, setTrackNumber, setExtras, move, moveTo, numberAll, start, askAgain, reset, setDefaults };
}

/**
 * How long the audio runs, read in the browser before anything is sent.
 * Metadata only, through an object URL: the file is never read into memory,
 * and the URL is let go as soon as the answer (or a timeout) comes.
 */
export function readDuration(file: File): Promise<number | null> {
  if (!file.size) return Promise.resolve(null);
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    let settled = false;
    const done = (v: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      a.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(v);
    };
    // Some webviews never answer for a WAV; the URL must not be held for ever.
    const timer = setTimeout(() => done(null), 15_000);
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : null);
    a.onerror = () => done(null);
    a.src = url;
  });
}

/** Edge functions return their error as a JSON body; unwrap it when we can. */
function safeMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.error === 'string') return parsed.error;
  } catch {
    /* not JSON, use it as-is */
  }
  // supabase-js says this when the function could not be reached at all.
  if (/Failed to send a request to the Edge Function/i.test(raw)) {
    return 'Could not reach the upload door. Check your connection and try again.';
  }
  return raw;
}

