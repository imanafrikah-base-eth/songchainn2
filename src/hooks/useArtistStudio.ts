import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { saveSongDetails, type SongDetails } from '@/lib/songDetails';
import { landCover as landCoverFile, NO_COVER } from '@/lib/coverArt';

/**
 * The artist side of SONGCHAINN: upload a track, have it auditioned, and see
 * everything you own at whatever stage it is at.
 *
 * An account is all it takes to upload. A wallet is only ever needed to coin a
 * track, never to release one.
 */

export type ReleaseStatus = 'uploading' | 'auditioning' | 'published' | 'workshop';

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
        .select('id, title, artist_name, genre, status, audio_url, cover_art_url, duration_seconds, created_at, published_at, audition, distribution, onchain_requested_at, release_date, release_at, release_id, track_number, isrc, explicit');
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

  return { deleteRelease, reaudition };
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
}

export interface BatchMeta {
  artistName: string;
  genre?: string;
  cover?: File | null;
  /** Credits, splits, paperwork, release and distribution, shared by every track. */
  details?: SongDetails;
}

/** The daily cap in upload-url. Keep in step with UPLOADS_PER_DAY there. */
export const UPLOADS_PER_DAY = 10;

/** The fields that belong to one record, never to a batch of them. */
const PER_TRACK_ONLY: Array<keyof SongDetails> = ['lyrics', 'description', 'isrc', 'iswc'];

let keySeq = 0;
const nextKey = () => `t${Date.now().toString(36)}${(keySeq++).toString(36)}`;

/** A title from a file name: the extension and any leading track number go. */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]+/, '').trim() || name;
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tracks, setTracks] = useState<QueuedTrack[]>([]);
  const tracksRef = useRef<QueuedTrack[]>([]);
  tracksRef.current = tracks;
  const [running, setRunning] = useState(false);
  // The cover lands once; every song row points at the same file.
  const coverUrlRef = useRef<string | null>(null);
  /** What a ticket is stamped with before the artist has typed anything. */
  const defaultsRef = useRef<{ artistName: string }>({ artistName: '' });
  /** One file at a time: the landing chain. */
  const landingRef = useRef<Promise<void>>(Promise.resolve());
  /** Per track, the promise that resolves once its file has landed (or failed). */
  const landedRef = useRef<Map<string, Promise<void>>>(new Map());

  const patch = useCallback((key: string, p: Partial<QueuedTrack> | ((t: QueuedTrack) => Partial<QueuedTrack>)) => {
    setTracks((list) => list.map((t) => (t.key === key ? { ...t, ...(typeof p === 'function' ? p(t) : p) } : t)));
  }, []);

  /** Queue files. The same file twice is ignored; each one's length is read as it lands in the list. */
  const add = useCallback((files: File[], opts?: { onRelease: boolean }) => {
    const list = tracksRef.current;
    const taken = new Set(list.map((t) => `${t.file.name}:${t.file.size}`));
    const fresh = files.filter((f) => !taken.has(`${f.name}:${f.size}`));
    const highest = list.reduce((m, t) => Math.max(m, t.trackNumber ?? 0), 0);
    const entries: QueuedTrack[] = fresh.map((file, i) => ({
      key: nextKey(),
      file,
      title: titleFromFileName(file.name),
      trackNumber: opts?.onRelease ? highest + i + 1 : null,
      seconds: null,
      phase: 'queued',
      progress: 0,
      error: null,
      result: null,
      songId: null,
    }));
    if (!entries.length) return;
    setTracks((cur) => [...cur, ...entries]);
    for (const e of entries) {
      void readDuration(e.file).then((seconds) => patch(e.key, { seconds }));
      queueLanding(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch]);

  const setDefaults = useCallback((d: { artistName: string }) => { defaultsRef.current = d; }, []);

  /** Take a track out. A row already reserved for it goes too, unless it is live. */
  const remove = useCallback((key: string) => {
    const t = tracksRef.current.find((x) => x.key === key);
    setTracks((list) => list.filter((x) => x.key !== key));
    if (t?.songId && user && t.phase !== 'done') {
      void supabase.from('songs').delete().eq('id', t.songId).eq('owner_id', user.id).neq('status', 'published').then(() => {
        void queryClient.invalidateQueries({ queryKey: ['artist_releases'] });
      });
    }
  }, [user, queryClient]);

  const setSeconds = useCallback((key: string, seconds: number | null) => patch(key, { seconds }), [patch]);
  const setTitle = useCallback((key: string, title: string) => patch(key, { title }), [patch]);
  const setTrackNumber = useCallback((key: string, trackNumber: number | null) => patch(key, { trackNumber }), [patch]);

  /** Number every queued track 1..n in queue order, or clear the numbers. */
  const numberAll = useCallback((on: boolean) => {
    setTracks((list) => list.map((t, i) => ({ ...t, trackNumber: on ? i + 1 : null })));
  }, []);

  const reset = useCallback(() => {
    setTracks([]);
    coverUrlRef.current = null;
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
        await putWithProgress(ticket.uploadUrl, file, (progress) =>
          patch(key, (t) => (t.phase === 'uploading' ? { progress } : {})),
        );
        patch(key, { phase: 'ready', progress: 100 });
      } catch (err) {
        if (reservedSongId) {
          const orphan = reservedSongId;
          void supabase.from('songs').delete().eq('id', orphan).eq('owner_id', user.id).neq('status', 'published');
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
    async (track: QueuedTrack, meta: BatchMeta, batchSize: number): Promise<{ audition: Promise<void> }> => {
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

      const details: SongDetails | undefined = meta.details
        ? {
            ...meta.details,
            ...(batchSize > 1 ? (Object.fromEntries(PER_TRACK_ONLY.map((k) => [k, null])) as Partial<SongDetails>) : {}),
            track_number: meta.details.release_id ? cur.trackNumber : null,
          }
        : undefined;

      // The names the artist typed, and the cover, onto the row that already
      // holds the file. The cover landed before this was called (start does
      // it once for the batch); with no cover nothing goes live, so nothing is sent.
      const coverUrl = coverUrlRef.current;
      if (!coverUrl) return { audition: Promise.resolve() };
      await supabase
        .from('songs')
        .update({
          title: cur.title.trim() || titleFromFileName(cur.file.name),
          artist_name: meta.artistName,
          genre: meta.genre || null,
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
    [user, queueLanding, runAudition],
  );

  /** A track whose file landed but whose audition fell over: ask once more. */
  const askAgain = useCallback(
    async (key: string) => {
      const t = tracksRef.current.find((x) => x.key === key);
      if (!t || t.phase !== 'error' || !t.songId) return;
      await runAudition(key, t.songId, t.result?.warnings ?? []);
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
        && (t.phase === 'queued' || t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || (t.phase === 'error' && !t.songId)),
      );
      if (!todo.length) return;
      setRunning(true);
      const auditions: Promise<void>[] = [];
      try {
        // The cover, once for the whole batch, before a single record is
        // sent. Nothing goes live without it, so nothing is sent without it.
        if (!meta.cover) throw new Error(NO_COVER);
        await landCover(meta.cover);
        for (const t of todo) {
          auditions.push((await sendOne(t, meta, tracks.length)).audition);
        }
        await Promise.all(auditions);
        // The release gets the batch's cover if it has none of its own.
        if (meta.details?.release_id && coverUrlRef.current) {
          await supabase
            .from('releases' as never)
            .update({ cover_art_url: coverUrlRef.current } as never)
            .eq('id', meta.details.release_id)
            .is('cover_art_url', null);
          await queryClient.invalidateQueries({ queryKey: ['release-groups'] });
        }
      } finally {
        setRunning(false);
      }
    },
    [running, tracks, sendOne, landCover, queryClient],
  );

  /** Something is with the judges or the send is running. Files landing on their own do not block the form. */
  const busy = running || tracks.some((t) => t.phase === 'auditioning');
  /** Files still on their way up. */
  const landing = tracks.some((t) => t.phase === 'preparing' || t.phase === 'uploading');
  /** Every track has had its go: live, in the workshop, or stuck with a file in. Nothing left to send. */
  const finished = tracks.length > 0 && !busy && tracks.every((t) => t.phase === 'done' || (t.phase === 'error' && !!t.songId));

  return { tracks, busy, landing, finished, add, remove, setSeconds, setTitle, setTrackNumber, numberAll, start, askAgain, reset, setDefaults };
}

/** How long the audio runs, read in the browser before anything is sent. */
export function readDuration(file: File): Promise<number | null> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
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

/**
 * XHR rather than fetch: a real progress bar matters when the connection is
 * slow, and plenty of the artists this is built for are on slow connections.
 */
function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}). Check your connection and try again.`));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Try again on a stronger connection.'));
    xhr.send(file);
  });
}
