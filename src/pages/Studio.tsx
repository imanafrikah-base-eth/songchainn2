import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, UploadCloud, Loader2, CheckCircle2, Wrench, Music4, Wallet, Coins, AlertCircle,
  Image as ImageIcon, Globe2, Trash2, RefreshCw, CalendarClock, ListMusic,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GENRES } from '@/data/musicData';
import { Navigation } from '@/components/Navigation';
import { ConsentNotice } from '@/components/ConsentNotice';
import { useCompliance } from '@/hooks/useCompliance';
import { MediaManager } from '@/components/gallery/MediaManager';
import { AudioPlayer } from '@/components/AudioPlayer';
import { useAuth } from '@/context/AuthContext';
import { useBecomeArtist } from '@/hooks/useBecomeArtist';
import { WORLD_BUILDER_ENABLED } from '@/lib/features';
import { useHasWorld } from '@/worlds/builder/useHasWorld';
import { supabase } from '@/integrations/supabase/client';
import {
  useArtistReleases, useBatchUpload, useReleaseActions, isScheduled, AUDITION_STALE_MS,
  TIER_LABEL, type ArtistRelease, type ReleaseTier, type QueuedTrack, type BatchMeta, type ExistingRecord,
} from '@/hooks/useArtistStudio';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Pencil } from 'lucide-react';
import { SongDetailsFields, DistributionChoice } from '@/components/studio/SongDetailsFields';
import { SongDetailsDialog } from '@/components/studio/SongDetailsDialog';
import { ActivityBoard } from '@/components/studio/ActivityBoard';
import { VerificationCard } from '@/components/studio/VerificationCard';
import { EMPTY_DETAILS, detailProblems, requestOnchain, type SongDetails } from '@/lib/songDetails';
import { useCoverLanding, type CoverStatus } from '@/hooks/useCoverLanding';
import { ArtworkField } from '@/components/studio/ArtworkField';
import { ReleaseTypePicker, RELEASE_TYPES, countAdvice, isCollection, releaseKindOf, typeLabel, type ReleaseType } from '@/components/studio/ReleaseType';
import { TracklistRow } from '@/components/studio/TracklistRow';
import { useSongCoin } from '@/hooks/useSongCoins';
import { audioLoads, stoppedTrack, trackFromRow } from '@/hooks/useArtistStudio';
import { clearDraft, clearPickerOpen, loadDraft, markPickerOpen, planRestore, saveDraft, type DraftTrack, type UploadedRow } from '@/lib/studioDraft';
import { setAppBusy } from '@/lib/appBusy';

const FIELD_LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground';
const FIELD_INPUT =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none disabled:opacity-60';

/** datetime-local speaks the artist's own clock; the row keeps UTC. */
function localInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// A WAV master runs about 10.6 MB a minute, so this has to be generous enough
// that a full lossless record fits. Keep in step with MAX_BYTES in upload-url.
const MAX_MB = 100;

// Under this the judges send it to the workshop anyway (a snippet), so say
// so before a 90 MB upload rather than after it.
const MIN_SECONDS = 30;

// A record goes up once. The same song again is only a record when it is
// genuinely another version, and the title has to say which one, so the
// catalogue never shows the same song twice with nothing to tell them apart.
const EDITION_WORDS =
  /\b(remix|rmx|live|acoustic|unplugged|instrumental|edit|version|edition|remaster(ed)?|demo|radio|extended|slowed|sped|vip|dub|freestyle|reprise)\b/i;

const TIER_CHIP: Record<ReleaseTier, string> = {
  master: 'bg-primary/15 text-primary',
  release: 'bg-emerald-500/15 text-emerald-500',
  raw: 'bg-muted text-muted-foreground',
};

const STATUS_LABEL: Record<string, string> = {
  uploading: 'Upload started',
  auditioning: 'With the judges',
  published: 'Live',
  workshop: 'In the workshop',
  scheduled: 'Scheduled',
};

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function useMyProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['studio_profile', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('audience_profiles')
        .select('display_name, username, wallet_address, avatar_url')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data ?? null;
    },
    staleTime: 60_000,
  });
}

const Studio = () => {
  const { user, isArtist, artistId, rolesReady } = useAuth();
  const { becomeArtist, pending: becoming } = useBecomeArtist();
  const { data: profile } = useMyProfile();
  const { data: releases = [], isLoading } = useArtistReleases();
  const { tracks, busy, landing, finished, add, attachExisting, restoreTracks, getReleaseId, setReleaseId, remove, setTitle, setTrackNumber, setExtras, move, moveTo, numberAll, start, askAgain, reset, setDefaults } = useBatchUpload();
  const { cannotUpload } = useCompliance();

  const fileRef = useRef<HTMLInputElement>(null);
  /** Asked first, the way every distributor asks it. */
  const [releaseType, setReleaseType] = useState<ReleaseType>('single');
  const collection = isCollection(releaseType);
  const [releaseTitle, setReleaseTitle] = useState('');
  const [releaseAbout, setReleaseAbout] = useState('');
  const [upc, setUpc] = useState('');
  const [artistName, setArtistName] = useState('');
  const [genre, setGenre] = useState('');
  /** The shared artwork (the single's, the release's, or the catalog default). It uploads the moment it is picked. */
  const cover = useCoverLanding();
  /** Artwork a track carries of its own, reported up from its row. */
  const trackCoverGet = useRef(new Map<string, () => Promise<string> | null>());
  const [trackCoverStatus, setTrackCoverStatus] = useState<Record<string, CoverStatus>>({});
  const onTrackCover = useCallback((key: string, status: CoverStatus, get: () => Promise<string> | null) => {
    trackCoverGet.current.set(key, get);
    setTrackCoverStatus((s) => (s[key] === status ? s : { ...s, [key]: status }));
  }, []);
  /** Credits, paperwork, the release and where the records live. Shared by the batch. All optional. */
  const [details, setDetails] = useState<SongDetails>(EMPTY_DETAILS);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!artistName && profile) {
      setArtistName(profile.display_name || profile.username || '');
    }
  }, [profile, artistName]);

  const hasWallet = !!profile?.wallet_address;

  /**
   * A release in progress comes back after a reload. Android drops a page
   * behind its file picker, and N3M3SIS lost an EP that way on 13 Sep 2026:
   * wagwan uploaded, she opened the picker for the next track, and the app
   * started over. The form is kept on the phone as it changes (below); the
   * tracks whose files landed are rebuilt from their songs rows, and one that
   * never got in keeps its place and asks to be picked again.
   */
  const [restored, setRestored] = useState(false);
  const restoreRan = useRef(false);
  const { fromLandedUrl: coverFromLanded } = cover;
  useEffect(() => {
    if (!user?.id || !rolesReady || restoreRan.current) return;
    restoreRan.current = true;
    const draft = isArtist ? loadDraft(user.id) : null;
    if (!draft) {
      setRestored(true);
      return;
    }
    const userId = user.id;
    void (async () => {
      try {
        const ids = draft.tracks.map((t) => t.songId).filter((id): id is string => !!id);
        let rows: UploadedRow[] = [];
        if (ids.length) {
          const { data } = await supabase
            .from('songs')
            .select('id, title, status, release_id, audio_url, storage_key, file_bytes, cover_art_url, genre, duration_seconds')
            .in('id', ids)
            .eq('owner_id', userId);
          rows = (data ?? []) as unknown as UploadedRow[];
        }
        const list: QueuedTrack[] = [];
        for (const p of planRestore(draft, rows)) {
          if (p.kind === 'uploaded') list.push(trackFromRow(p.row, p.track));
          else if (p.kind === 'check' && p.row.audio_url && (await audioLoads(p.row.audio_url))) list.push(trackFromRow(p.row, p.track));
          else list.push(stoppedTrack(p.track));
        }
        const type = RELEASE_TYPES.find((r) => r.value === draft.releaseType)?.value;
        if (type) setReleaseType(type);
        setReleaseTitle(draft.releaseTitle ?? '');
        setReleaseAbout(draft.releaseAbout ?? '');
        setUpc(draft.upc ?? '');
        if (draft.genre && (GENRES as string[]).includes(draft.genre)) setGenre(draft.genre);
        if (draft.artistName) setArtistName(draft.artistName);
        if (draft.coverUrl) coverFromLanded(draft.coverUrl);
        if (draft.releaseId) setReleaseId(draft.releaseId);
        if (list.length) {
          restoreTracks(list);
          const lost = list.filter((t) => t.stopped).length;
          toast('Your release is back where you left it', {
            description: lost
              ? `${lost === 1 ? 'One track' : `${lost} tracks`} stopped before finishing the upload. Pick ${lost === 1 ? 'it' : 'them'} again; everything else is still in.`
              : 'Every track that uploaded is still here.',
          });
        }
      } catch {
        // An unreadable draft costs nothing: uploaded rows still show under
        // "Already uploaded, not sent yet".
      } finally {
        setRestored(true);
      }
    })();
  }, [user?.id, rolesReady, isArtist, coverFromLanded, restoreTracks, setReleaseId]);

  const coverStatusRef = useRef(cover.status);
  coverStatusRef.current = cover.status;

  /**
   * /studio?release=ep&with=<song id>: open the upload with a record that is
   * already in the Studio as track one, waiting for the rest of the release.
   * Only its owner gets it, and only while it is not out (uploading or in the
   * workshop). Anyone else, or an id that is not theirs, gets the Studio as usual.
   */
  const [searchParams] = useSearchParams();
  const withSongId = searchParams.get('with');
  const releaseParam = searchParams.get('release');
  const attachedRef = useRef<string | null>(null);
  const { fromProfileUrl: coverFromUrl } = cover;
  useEffect(() => {
    // After the restore, so a reloaded release keeps its own order and artwork.
    if (!restored || !user?.id || !isArtist || !withSongId || attachedRef.current === withSongId) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(withSongId)) return;
    attachedRef.current = withSongId;
    void (async () => {
      const { data } = await supabase
        .from('songs')
        .select('id, title, genre, cover_art_url, duration_seconds, storage_key, file_bytes, audio_url, status')
        .eq('id', withSongId)
        .eq('owner_id', user.id)
        .maybeSingle();
      const song = data as unknown as (ExistingRecord & { audio_url: string | null; status: string }) | null;
      if (!song?.audio_url || (song.status !== 'uploading' && song.status !== 'workshop')) return;
      const wanted = RELEASE_TYPES.find((r) => r.value === releaseParam)?.value ?? 'ep';
      setReleaseType(wanted);
      if (wanted !== 'single' && wanted !== 'catalog') setDetails((d) => ({ ...d, release_id: null, track_number: null }));
      const songGenre = song.genre;
      if (songGenre && (GENRES as string[]).includes(songGenre)) setGenre((g) => g || songGenre);
      // Its artwork starts as the release artwork; picking another replaces it.
      if (song.cover_art_url && coverStatusRef.current === 'idle') coverFromUrl(song.cover_art_url);
      attachExisting(song);
    })();
  }, [restored, user?.id, isArtist, withSongId, releaseParam, attachExisting, coverFromUrl]);

  // What a ticket carries before the artist has typed anything.
  useEffect(() => {
    setDefaults({ artistName: artistName.trim() || profile?.display_name || profile?.username || '' });
  }, [artistName, profile, setDefaults]);

  const { live, workshop, pending, scheduled } = useMemo(() => ({
    live: releases.filter((r) => r.status === 'published' && !isScheduled(r)),
    scheduled: releases.filter((r) => isScheduled(r)),
    workshop: releases.filter((r) => r.status === 'workshop'),
    pending: releases.filter((r) => r.status === 'uploading' || r.status === 'auditioning'),
  }), [releases]);

  // One world per artist: the world card says "your world", never "build one", once they have it.
  const { hasWorld, worldPath: myWorldPath } = useHasWorld();

  /**
   * What is kept on the phone: everything needed to rebuild the form. Upload
   * progress is left out on purpose, so a moving progress bar does not write
   * to storage on every percent.
   */
  const draftJson = useMemo(() => {
    const unsentTracks = tracks.filter(
      (t) => !!t.stopped || t.phase === 'queued' || t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || (t.phase === 'error' && !t.songId),
    );
    const list: DraftTrack[] = unsentTracks.map((t) => ({
      songId: t.songId,
      title: t.title,
      fileName: t.file.name,
      fileSize: t.stopped ? t.stopped.fileSize : t.file.size,
      phase: t.stopped ? 'error' : (t.phase as DraftTrack['phase']),
      existing: !!t.existing,
      trackNumber: t.trackNumber,
      genre: t.genre,
      explicit: t.explicit,
      featured: t.featured,
    }));
    return JSON.stringify({
      releaseType,
      releaseTitle,
      releaseAbout,
      upc,
      genre,
      artistName,
      coverUrl: cover.status === 'ready' ? cover.url : null,
      tracks: list,
    });
  }, [tracks, releaseType, releaseTitle, releaseAbout, upc, genre, artistName, cover.status, cover.url]);

  useEffect(() => {
    if (!user?.id || !restored || !isArtist) return;
    if (finished) {
      clearDraft(user.id);
      return;
    }
    saveDraft(user.id, { ...JSON.parse(draftJson), releaseId: getReleaseId() });
  }, [user?.id, restored, isArtist, finished, draftJson, getReleaseId]);

  // Nothing reloads the page while a file is on its way up or tracks are
  // waiting to be sent: no service worker takeover, no stale-build recovery,
  // no update banner over the form. See src/lib/appBusy.ts.
  const unsent = tracks.some(
    (t) => !!t.stopped || t.phase === 'queued' || t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || t.phase === 'auditioning',
  );
  useEffect(() => {
    setAppBusy('studio', unsent || busy);
  }, [unsent, busy]);
  useEffect(() => () => setAppBusy('studio', false), []);

  // Back from the picker with the page alive: the way-back note is not needed.
  useEffect(() => {
    const onFocus = () => window.setTimeout(clearPickerOpen, 2000);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  /** Records whose files are in but were never sent, and are not on the tracklist. */
  const waitingUploads = releases.filter(
    (r) => r.status === 'uploading' && !r.release_id && !!r.audio_url && !tracks.some((t) => t.songId === r.id),
  );

  // No daily track limit (founder, 13 Sep 2026): an artist sends as many
  // records as they like, whenever they like, so nothing here counts "today".
  const queued = tracks.filter((t) => t.phase === 'queued' || t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || (t.phase === 'error' && !t.songId));

  const detailProblem = detailProblems({ ...details, track_number: null })[0] ?? null;
  /** Placing a single or a catalog onto a release that already exists, from the details. */
  const onRelease = !collection && !!details.release_id;
  /** A single's artwork is the release artwork; every other type lets a track carry its own. */
  const ownArtwork = releaseType !== 'single';
  const validGenre = (g: string | null | undefined) => !!g && (GENRES as string[]).includes(g);

  /**
   * The records a queued title may not repeat. A file lands the moment it is
   * picked, which reserves a songs row under the same title; the next refetch
   * of this list used to hand that row back as "You already have a record
   * called this", so Send was blocked by the track's own upload. N3M3SIS sat
   * on that twice with APE SHITT (13 Sep 2026). A row still at 'uploading' is
   * not a record yet, and the rows this queue reserved are the same tracks.
   */
  const reservedHere = new Set(tracks.map((t) => t.songId).filter(Boolean) as string[]);
  const existingRecords = releases.filter((r) => r.status !== 'uploading' && !reservedHere.has(r.id));

  /** What stops this one row from being sent, in the artist's words. */
  const trackProblem = (t: QueuedTrack): string | null => {
    if (t.stopped) return 'This one did not finish uploading. Pick the same file again, or remove it.';
    if (t.file.size > MAX_MB * 1024 * 1024) return `That file is ${(t.file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${MAX_MB} MB.`;
    if (t.seconds !== null && t.seconds < MIN_SECONDS) return `That runs ${Math.round(t.seconds)} seconds. A record has to be at least ${MIN_SECONDS}; anything shorter goes straight to the workshop as a snippet.`;
    if (!t.title.trim()) return 'Give it a title.';
    if (onRelease && (!t.trackNumber || t.trackNumber < 1)) return 'Give it a track number on the release.';
    // The same record twice is not allowed. Another version is, and the title
    // is where it says so.
    const title = t.title.trim();
    if (title && !EDITION_WORDS.test(title)) {
      if (tracks.some((o) => o.key !== t.key && o.title.trim().toLowerCase() === title.toLowerCase())) {
        return `Two tracks here are both called this. Name the other one as its own version, like "${title} (Remix)".`;
      }
      if (existingRecords.some((r) => (r.title ?? '').trim().toLowerCase() === title.toLowerCase())) {
        return `You already have a record called this. Send it again only as another version, and say so in the title, like "${title} (Remix)".`;
      }
    }
    return null;
  };
  /** The allowed case of a shared name: the title marks this one as its own version. */
  const trackNote = (t: QueuedTrack): string | null => {
    const title = t.title.trim().toLowerCase();
    if (!title) return null;
    if (tracks.some((o) => o.key !== t.key && o.title.trim().toLowerCase() === title)) {
      return 'Another track here shares this name, and this one is marked as its own version.';
    }
    const same = existingRecords.find((r) => (r.title ?? '').trim().toLowerCase() === title);
    return same ? `You already have a record called this (${STATUS_LABEL[same.status] ?? same.status}). This goes up beside it as its own version.` : null;
  };

  // Every record files under a genre. No default: the artist picks one.
  const genreMissing = !validGenre(genre);
  const trackGenreMissing = (t: QueuedTrack) => !validGenre(t.genre) && genreMissing;
  const sharedCoverOk = cover.status !== 'idle' && cover.status !== 'error';
  const trackCoverState = (t: QueuedTrack): CoverStatus => (ownArtwork ? trackCoverStatus[t.key] ?? 'idle' : 'idle');
  const trackCoverOk = (t: QueuedTrack) => {
    const own = trackCoverState(t);
    return own !== 'idle' ? own !== 'error' : sharedCoverOk || !!t.existing?.coverUrl;
  };

  const kindLabel = typeLabel(releaseType);
  const releaseProblem = !collection
    ? null
    : !releaseTitle.trim()
      ? `Give the ${kindLabel} a title.`
      : upc.trim() && !/^\d{12,13}$/.test(upc.replace(/[\s-]/g, ''))
        ? 'A UPC is 12 or 13 digits. Leave it empty if you do not have one.'
        : null;
  const advice = countAdvice(releaseType, tracks.length);
  const today = new Date().toISOString().slice(0, 10);
  const scheduledAhead = Boolean((details.release_at && new Date(details.release_at).getTime() > Date.now()) || (!details.release_at && details.release_date && details.release_date > today));

  /** The one thing standing between the artist and Send, in their words. */
  const blocker: string | null = (() => {
    if (cannotUpload || !queued.length) return null;
    if (releaseProblem) return releaseProblem;
    if (queued.some((t) => !trackCoverOk(t))) {
      const own = queued.find((t) => trackCoverState(t) === 'error');
      if (own) return `The artwork for "${own.title || own.file.name}" did not work. Pick it again, or remove it to use the shared artwork.`;
      if (cover.status === 'error') return 'The artwork did not work. Pick it again; your audio stays right where it is.';
      return ownArtwork
        ? 'Add artwork: shared artwork above, or its own in each track\'s details. Nothing goes live without it.'
        : 'Add the artwork. Nothing goes live without it.';
    }
    if (queued.some(trackGenreMissing)) return 'Pick a genre. A record cannot go out without one.';
    if (!artistName.trim()) return 'Add the artist name.';
    const bad = queued.find((t) => trackProblem(t));
    if (bad) return `Track ${tracks.indexOf(bad) + 1}: ${trackProblem(bad)}`;
    if (detailProblem) return detailProblem;
    return null;
  })();

  const canSubmit = queued.length > 0 && !blocker && !busy && !cannotUpload;

  const meta = (): BatchMeta => ({
    artistName: artistName.trim(),
    genre: genreMissing ? undefined : genre,
    coverUrl: sharedCoverOk ? cover.whenReady() : null,
    coverFor: ownArtwork
      ? (key) => {
          const st = trackCoverStatus[key];
          if (!st || st === 'idle' || st === 'error') return null;
          return trackCoverGet.current.get(key)?.() ?? null;
        }
      : undefined,
    release: collection
      ? {
          title: releaseTitle.trim(),
          kind: releaseKindOf(releaseType)!,
          release_date: details.release_date,
          description: releaseAbout.trim() || null,
          upc: upc.replace(/[\s-]/g, '') || null,
        }
      : null,
    details: collection ? { ...details, release_id: null, track_number: null } : details,
  });

  const addFiles = (incoming: FileList | File[] | null) => {
    const all = Array.from(incoming ?? []);
    const files = all.filter(
      (f) => /\.(wav|mp3)$/i.test(f.name) || /^audio\/(wav|x-wav|wave|vnd\.wave|mpeg|mp3)$/.test(f.type),
    );
    // A picture dropped with the audio is the artwork.
    const image = all.find((f) => f.type.startsWith('image/'));
    if (image && cover.status === 'idle') cover.pick(image);
    if (!files.length) {
      if (!image && all.length) toast('Only WAV and MP3 files can be sent', { description: 'Export the track as WAV or MP3 and pick it again.' });
      return;
    }
    const { already } = add(files, { onRelease });
    if (already.length) {
      toast(already.length === 1 ? `${already[0]} is already on the tracklist` : `${already.length} of those are already on the tracklist`, {
        description: 'It uploaded once already, so it was not sent a second time.',
      });
    }
  };

  /** The file picker, with a note of where to come back to if the phone drops the page meanwhile. */
  const openPicker = () => {
    markPickerOpen(`${window.location.pathname}${window.location.search}`);
    fileRef.current?.click();
  };

  /** An EP, album, mixtape or compilation is made here, so an existing release picked in the details is let go. */
  const changeReleaseType = (next: ReleaseType) => {
    if (isCollection(next) && details.release_id) {
      setDetails((d) => ({ ...d, release_id: null, track_number: null }));
      numberAll(false);
    }
    setReleaseType(next);
  };

  /** Turning a release on numbers the queue in order; turning it off clears the numbers. */
  const changeDetails = (next: SongDetails) => {
    if (!!next.release_id !== !!details.release_id) numberAll(!!next.release_id);
    setDetails(next);
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await start(meta());
    } catch (err) {
      toast.error((err as Error)?.message || 'That did not go through. Try again.');
    }
  };

  const dropAt = (index: number) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragOverIndex(null);
    if (from !== null && from !== index) moveTo(from, index);
  };

  const startOver = () => {
    if (user?.id) clearDraft(user.id);
    reset();
    setGenre('');
    setDetails(EMPTY_DETAILS);
    setMoreOpen(false);
    cover.clear();
    setReleaseTitle('');
    setReleaseAbout('');
    setUpc('');
    setTrackCoverStatus({});
    trackCoverGet.current.clear();
    if (fileRef.current) fileRef.current.value = '';
  };

  const doneCount = tracks.filter((t) => t.phase === 'done' && t.result?.passed).length;
  const workshopCount = tracks.filter((t) => t.phase === 'done' && !t.result?.passed).length;
  const stuckCount = tracks.filter((t) => t.phase === 'error' && !!t.songId).length;
  const sentCount = tracks.filter((t) => t.phase === 'done' || t.phase === 'error' || t.phase === 'auditioning').length;

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <Navigation />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <Music4 className="mx-auto h-10 w-10 text-primary mb-4" />
          <h1 className="font-heading text-2xl font-bold mb-2">Release here first, then everywhere</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Keep your distributor for the stores. This is the place your fans can hold your records, walk into your world and pay you directly. Make an account and a record is out today: no wallet needed to release, no fee, no waiting on anybody's approval.
          </p>
          <Link to="/auth" className="inline-flex items-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">
            Create an account
          </Link>
        </div>
        <AudioPlayer />
      </div>
    );
  }

  // Whether this account is an artist is not known yet. Reading "not an
  // artist" here used to swap the upload form out for the listener's door on
  // every reload and every return to the tab.
  if (!rolesReady) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <Navigation />
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Opening your Studio" />
        </div>
      </div>
    );
  }

  // The Studio is an artist's room. A listener never sees the upload form,
  // the same way they never see the launcher: an artist account is granted
  // (Admin > Claims), not earned by pressing Upload. The server refuses the
  // upload too; this is the honest sign on the door.
  if (!isArtist) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <Navigation />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <Music4 className="mx-auto h-10 w-10 text-primary mb-4" />
          <h1 className="font-heading text-2xl font-bold mb-2">The Studio is for artist accounts</h1>
          <p className="text-sm text-muted-foreground mb-6 max-w-prose mx-auto">
            Make music? One tap and this account is your artist account. Already on here? Claim your page.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void becomeArtist()} disabled={becoming} className="gap-1.5">
              {becoming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music4 className="h-4 w-4" />} I make music, open my Studio
            </Button>
            <Button asChild variant="outline"><Link to="/claim">This is my page already</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <Navigation />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <UploadCloud className="h-7 w-7 text-primary" />
          <h1 className="font-heading text-3xl font-bold text-foreground">Studio</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          Send a finished record. The judges listen, and it is live the same minute. A single, an EP, an album, or your whole back catalogue at once.
        </p>

        {/* ------------------------------------------------------- world --- */}

        {WORLD_BUILDER_ENABLED && isArtist && hasWorld && myWorldPath && (
          <Link
            to={myWorldPath}
            className="mb-8 flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
          >
            <Globe2 className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
            <div>
              <h2 className="font-heading text-lg font-bold text-foreground">Your world</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                It is standing. Walk it to see what visitors find, or ask Mo$ha to change the
                streets, what is on them, or who gets through each door.
              </p>
              <span className="mt-2 inline-block text-sm font-semibold text-primary">Walk into your world</span>
            </div>
          </Link>
        )}

        {WORLD_BUILDER_ENABLED && isArtist && !hasWorld && (
          <Link
            to="/world-builder"
            className="mb-8 flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
          >
            <Globe2 className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
            <div>
              <h2 className="font-heading text-lg font-bold text-foreground">Build your world</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A profile shows people your music. A world lets you decide who gets in, what they
                find when they do, and what it takes to reach the room behind the last door. Six
                screens, and you can walk it as a stranger before anyone else sees it.
              </p>
              <span className="mt-2 inline-block text-sm font-semibold text-primary">Start building</span>
            </div>
          </Link>
        )}

        {/* ------------------------------------------------------ upload --- */}

        {!finished && (
          <div className="mb-8 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <ReleaseTypePicker value={releaseType} onChange={changeReleaseType} disabled={busy} />

            {/* -------------------------------------------- the release --- */}
            <div className="mt-5 space-y-4">
              {collection && (
                <label className="block">
                  <span className={FIELD_LABEL}>{kindLabel} title</span>
                  <input
                    value={releaseTitle}
                    onChange={(e) => setReleaseTitle(e.target.value)}
                    disabled={busy}
                    maxLength={120}
                    placeholder={`The name of the ${kindLabel}`}
                    aria-invalid={tracks.length > 0 && !releaseTitle.trim()}
                    className={`${FIELD_INPUT} h-11`}
                  />
                </label>
              )}

              <ArtworkField
                cover={cover}
                disabled={busy}
                listenPaste
                profileUrl={profile?.avatar_url ?? null}
                label={collection ? `${kindLabel} artwork` : releaseType === 'catalog' ? 'Shared artwork (optional)' : 'Artwork'}
                hint={
                  collection
                    ? 'Any photo, squared for you. It goes on every track; a track can have its own in Track details.'
                    : releaseType === 'catalog'
                      ? 'Goes on every song without its own. Each song can have its own in Track details.'
                      : 'Any photo, squared for you. Nothing goes live without artwork.'
                }
              />

              <label className="block">
                <span className={FIELD_LABEL}>{releaseType === 'catalog' ? 'Default genre' : 'Genre'}</span>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  disabled={busy}
                  required
                  aria-required="true"
                  aria-invalid={queued.some(trackGenreMissing)}
                  className={`${FIELD_INPUT} h-11 ${queued.some(trackGenreMissing) ? 'border-amber-500/60' : ''}`}
                >
                  <option value="" disabled>Pick the closest one</option>
                  {GENRES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {queued.some(trackGenreMissing) ? (
                  <span className="mt-1 block text-xs text-amber-500">
                    Pick a genre. A record cannot go out without one.
                  </span>
                ) : (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {releaseType === 'single'
                      ? 'This is where the record files in Discover. Pick the nearest fit; you can change it later.'
                      : 'Every track files here unless you pick another in its Track details.'}
                  </span>
                )}
              </label>

              {collection && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={FIELD_LABEL}>Release date and time</span>
                    <input
                      type="datetime-local"
                      value={localInput(details.release_at) || (details.release_date ? `${details.release_date}T00:00` : '')}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) { setDetails((d) => ({ ...d, release_at: null, release_date: null })); return; }
                        const d = new Date(v);
                        if (Number.isNaN(d.getTime())) return;
                        setDetails((cur) => ({ ...cur, release_at: d.toISOString(), release_date: d.toISOString().slice(0, 10) }));
                      }}
                      className={`${FIELD_INPUT} h-11`}
                    />
                    <span className={`mt-1 block text-xs ${scheduledAhead ? 'text-primary' : 'text-muted-foreground'}`}>
                      {scheduledAhead
                        ? 'Scheduled. It stays yours alone until that moment, then goes public and your followers are told.'
                        : 'Blank means out the minute the judges are done. A time ahead schedules it.'}
                    </span>
                  </label>
                  <label className="block">
                    <span className={FIELD_LABEL}>UPC <span className="normal-case font-normal">(optional)</span></span>
                    <input
                      value={upc}
                      onChange={(e) => setUpc(e.target.value)}
                      disabled={busy}
                      inputMode="numeric"
                      maxLength={16}
                      placeholder="12 or 13 digits"
                      className={`${FIELD_INPUT} h-11 font-mono`}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className={FIELD_LABEL}>About the {kindLabel} <span className="normal-case font-normal">(optional)</span></span>
                    <textarea
                      value={releaseAbout}
                      onChange={(e) => setReleaseAbout(e.target.value)}
                      disabled={busy}
                      rows={3}
                      maxLength={2000}
                      placeholder="What it is, where it was made, who was in the room."
                      className={`${FIELD_INPUT} resize-y`}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* ----------------------------------------------- the audio --- */}
            <div
              onDragOver={(e) => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); if (!busy) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDragging(false); if (!busy) addFiles(e.dataTransfer.files); }}
              className={`mt-5 rounded-xl border border-dashed p-3 transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <span className={FIELD_LABEL}>
                {collection ? 'Tracklist' : releaseType === 'catalog' ? 'Songs' : 'Audio'}
              </span>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".wav,.mp3,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave,audio/mpeg,audio/mp3"
                disabled={busy}
                className="hidden"
                onChange={(e) => {
                  clearPickerOpen();
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={openPicker}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary/15 px-4 text-sm font-semibold text-primary hover:bg-primary/25 disabled:opacity-60"
              >
                <UploadCloud className="h-4 w-4" />
                {tracks.length > 0 ? 'Add more audio' : collection ? 'Add the tracks' : releaseType === 'catalog' ? 'Add songs' : 'Add the audio'}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                WAV or MP3, up to {MAX_MB} MB each.{' '}
                {collection
                  ? 'Pick them all at once. They start uploading straight away and you set the order below.'
                  : releaseType === 'catalog'
                    ? 'Pick as many as you like. Each one goes out as its own single.'
                    : 'It starts uploading the moment you pick it.'}
                <span className="hidden sm:inline"> Or drop the files here.</span>
              </p>
            </div>

            {advice && (
              <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-foreground">{advice}</p>
            )}
            {releaseType === 'single' && tracks.length > 1 && !busy && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => changeReleaseType(tracks.length > 6 ? 'album' : 'ep')}
                  className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Make it {tracks.length > 6 ? 'an album' : 'an EP'}
                </button>
                <button
                  type="button"
                  onClick={() => changeReleaseType('catalog')}
                  className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Send as a catalog
                </button>
              </div>
            )}

            {tracks.length > 0 && (
              <ul className="mt-4 space-y-2" aria-label={collection ? 'Tracklist' : 'Tracks to send'}>
                {tracks.map((t, i) => (
                  <TracklistRow
                    key={t.key}
                    track={t}
                    index={i}
                    count={tracks.length}
                    position={collection}
                    manualNumber={onRelease}
                    problem={trackProblem(t)}
                    note={trackNote(t)}
                    busy={busy}
                    retryReady={!trackProblem(t) && trackCoverOk(t) && !trackGenreMissing(t) && !releaseProblem && !detailProblem && artistName.trim().length > 0 && !cannotUpload}
                    ownArtwork={ownArtwork}
                    sharedGenre={genreMissing ? '' : genre}
                    sharedCoverPreview={sharedCoverOk ? cover.preview : null}
                    artistId={artistId}
                    dragOver={dragOverIndex === i}
                    onTitle={(v) => setTitle(t.key, v)}
                    onNumber={(v) => setTrackNumber(t.key, v)}
                    onRemove={() => remove(t.key)}
                    onRetry={() => void start(meta(), t.key).catch((err) => toast.error((err as Error)?.message || 'That did not go through. Try again.'))}
                    onAskAgain={() => void askAgain(t.key)}
                    onPickAgain={openPicker}
                    onMove={(delta) => move(t.key, delta)}
                    onExtras={(p) => setExtras(t.key, p)}
                    onCover={onTrackCover}
                    onDragStart={() => { dragFrom.current = i; }}
                    onDragEnter={() => setDragOverIndex(i)}
                    onDrop={() => dropAt(i)}
                    onDragEnd={() => { dragFrom.current = null; setDragOverIndex(null); }}
                  />
                ))}
              </ul>
            )}
            {restored && waitingUploads.length > 0 && (
              <div className="mt-4 rounded-xl border border-border p-3">
                <p className="text-sm font-semibold text-foreground">Already uploaded, not sent yet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  These files are safely in. Add one here instead of uploading it again.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {waitingUploads.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {r.title || 'Untitled'}{' '}
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          attachExisting(
                            { id: r.id, title: r.title, genre: r.genre, cover_art_url: r.cover_art_url, duration_seconds: r.duration_seconds, storage_key: r.storage_key, file_bytes: r.file_bytes },
                            { atEnd: true },
                          )
                        }
                        className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                      >
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tracks.length > 1 && !busy && (
              <p className="mt-2 text-xs text-muted-foreground">
                They go up one after the other and each one is judged the moment it lands. Titles come from the file names; fix any that look wrong before you send.
                {collection ? ' The arrows set the running order.' : ''}
              </p>
            )}

            <div className="mt-5 grid gap-4">
              <label className="block">
                <span className={FIELD_LABEL}>Artist name</span>
                <input
                  value={artistName}
                  onChange={(e) => setArtistName(e.target.value)}
                  disabled={busy}
                  maxLength={120}
                  placeholder="How it should appear"
                  className={`${FIELD_INPUT} h-11`}
                />
              </label>

              <DistributionChoice
                value={details.distribution}
                onChange={(v) => setDetails((d) => ({ ...d, distribution: v }))}
                hasWallet={hasWallet}
                disabled={busy}
              />

              <div className="rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {tracks.length > 1 || collection ? 'Credits, splits and paperwork' : 'Lyrics, credits and paperwork'}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {collection
                        ? 'Shared by every track on the release. Optional now, editable any time.'
                        : tracks.length > 1
                          ? 'Shared by every song in this batch. Optional now, editable any time.'
                          : 'Optional now, editable any time from your catalog.'}
                    </span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                </button>
                {moreOpen && (
                  <div className="border-t border-border p-3">
                    <SongDetailsFields
                      value={details}
                      onChange={changeDetails}
                      disabled={busy}
                      artistId={artistId}
                      shared={tracks.length > 1 || collection}
                      hideRelease={collection}
                      hideReleaseDate={collection}
                      hideFeatured
                      hideExplicit
                    />
                  </div>
                )}
              </div>
            </div>

            {!busy && blocker && (
              <p className="mt-4 text-xs text-amber-500" aria-live="polite">{blocker}</p>
            )}

            {busy && tracks.length > 1 && (
              <div className="mt-5 flex items-center gap-2 text-sm text-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                {sentCount} of {tracks.length} sent. Keep this page open until the last one is with the judges; after that they finish without you.
              </div>
            )}

            {/* The enforcement ladder was computed on every load and read by
                nobody, so a no_upload restriction existed in the database and
                stopped nothing. Now it stops the thing it names, and says why
                rather than failing quietly at the server. */}
            {cannotUpload && (
              <p className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs leading-relaxed text-foreground">
                Uploading is paused on your account. If you think that is wrong, you can appeal it
                from your profile.
              </p>
            )}

            <ConsentNotice which="upload_rights" className="mt-6" />

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {busy
                ? 'Working'
                : landing
                  ? (queued.length > 1 ? `Finish and send all ${queued.length}` : 'Finish and send')
                  : collection
                    ? `Send the ${kindLabel} in`
                    : queued.length > 1 ? `Send all ${queued.length} in` : 'Send it in'}
            </button>
          </div>
        )}

        {/* ------------------------------------------------------ result --- */}

        {finished && (
          <div className="mb-8 space-y-4">
            {tracks.length > 1 && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2">
                  <ListMusic className="h-5 w-5 text-primary" />
                  <h2 className="font-heading text-lg font-bold text-foreground">
                    {doneCount === tracks.length ? `All ${tracks.length} are in` : `${sentCount} of ${tracks.length} sent`}
                  </h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[
                    doneCount ? `${doneCount} live` : null,
                    workshopCount ? `${workshopCount} in the workshop` : null,
                    stuckCount ? `${stuckCount} waiting on the judges` : null,
                  ].filter(Boolean).join(', ')}.
                  {details.release_id || collection ? ' They sit together on the release, in track order.' : ''}
                </p>
              </div>
            )}
            {tracks.map((t) => (
              <ResultCard key={t.key} track={t} many={tracks.length > 1} releaseDate={details.release_date} releaseAt={details.release_at} onAskAgain={() => void askAgain(t.key)} />
            ))}
            <button
              type="button"
              onClick={startOver}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              {tracks.length > 1 ? 'Send more' : 'Send another'}
            </button>
          </div>
        )}

        {/* ------------------------------------------------------ wallet --- */}

        {!hasWallet && live.length > 0 && (
          <div className="mb-8 flex gap-3 rounded-2xl border border-border bg-card p-4">
            <Wallet className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Your music is out. Your wallet is not connected.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You never need a wallet to release on SONGCHAINN. You need one to coin a track, so the earnings land somewhere that belongs to you and nobody else.
              </p>
              <Link to="/profile?settings=1" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                <Coins className="h-4 w-4" /> Connect a wallet
              </Link>
            </div>
          </div>
        )}

        {/* --------------------------------------------------- launcher --- */}

        <Link
          to="/launch"
          className="mb-8 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
        >
          <Coins className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              Put something on chain
            </span>
            <span className="block text-sm text-muted-foreground">
              Your own token, deployed to a wallet you choose, through the SONGCHAINN launcher.
            </span>
          </span>
          <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>

        {/* ----------------------------------------------- verification --- */}

        <VerificationCard />

        {/* ------------------------------------------------ visual work --- */}

        <div className="mb-10 border-t border-border pt-8">
          <MediaManager walletAddress={profile?.wallet_address ?? null} />
        </div>

        {/* ---------------------------------------------------- releases --- */}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your catalog.</p>
        ) : releases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing here yet. The first one you send will show up right here.
          </p>
        ) : (
          <div className="space-y-8">
            {pending.length > 0 && <ReleaseGroup title="In progress" items={pending} hasWallet={hasWallet} artistId={artistId} />}
            {scheduled.length > 0 && (
              <ReleaseGroup
                title="Scheduled"
                note="Only you can see these until their day. They go public at midnight and your followers hear about it then."
                items={scheduled}
                hasWallet={hasWallet}
                artistId={artistId}
              />
            )}
            {live.length > 0 && <ReleaseGroup title="Live on SONGCHAINN" items={live} hasWallet={hasWallet} artistId={artistId} />}
            {workshop.length > 0 && (
              <ReleaseGroup
                title="Your workshop"
                note="Only you can see this. Nothing lands here unless something on the file is actually broken, and there is no limit on sending a track back once you have fixed it."
                items={workshop}
                hasWallet={hasWallet}
                artistId={artistId}
              />
            )}
          </div>
        )}

        {/* ---------------------------------------------------- activity --- */}

        {artistId && (
          <div className="mt-10 border-t border-border pt-8">
            <ActivityBoard artistId={artistId} />
          </div>
        )}
      </div>
      <AudioPlayer />
    </div>
  );
};

/** What the judges said about one record, once the batch is through. */
function ResultCard({ track: t, many, releaseDate, releaseAt, onAskAgain }: { track: QueuedTrack; many: boolean; releaseDate: string | null; releaseAt?: string | null; onAskAgain: () => void }) {
  const result = t.result;
  if (t.phase === 'error' || !result) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
          <h2 className="font-heading text-lg font-bold text-foreground">{t.title}: the file is in, the judges are not done</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t.error || 'The audition did not finish.'}</p>
        <button
          type="button"
          onClick={onAskAgain}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground min-h-10"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Ask the judges again
        </button>
      </div>
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const heading = result.passed
    ? (releaseAt && new Date(releaseAt).getTime() > Date.now()
        ? `It is in. It goes public ${new Date(releaseAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
        : releaseDate && releaseDate > today ? `It is in. It goes public on ${prettyDate(releaseDate)}` : 'It is live')
    : 'One more pass in the studio';
  return (
    <div className={`rounded-2xl border p-5 ${result.passed ? 'border-primary/40 bg-primary/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
      <div className="mb-4 flex items-center gap-2">
        {result.passed
          ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
          : <Wrench className="h-5 w-5 shrink-0 text-amber-500" />}
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold text-foreground">
            {many ? `${t.title}: ${heading.charAt(0).toLowerCase()}${heading.slice(1)}` : heading}
          </h2>
          {result.passed && result.tier && (
            <p className="text-xs text-muted-foreground">
              {result.tier === 'master'
                ? 'It meets the full SONGCHAINN standard. That is the top rung and it is rare.'
                : result.tier === 'release'
                  ? 'Clean delivery. It is out and it is eligible for featured placement.'
                  : 'It is out and people can play it now. Tighten the notes below and it climbs.'}
            </p>
          )}
        </div>
      </div>

      {result.hikulu && (
        <div className="mb-3 rounded-xl border border-accent/30 bg-accent/5 p-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-accent">$HIKULU</p>
          <p className="text-sm text-foreground">{result.hikulu}</p>
        </div>
      )}
      {result.nakulu && (
        <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-400/5 p-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-rose-400">NAKULU</p>
          <p className="text-sm text-foreground">{result.nakulu}</p>
        </div>
      )}

      <AuditionDetail
        failures={result.failures}
        advisories={result.advisories}
        shortfalls={result.shortfalls}
        published={result.passed}
      />

      {result.warnings && result.warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          {result.warnings.map((w) => (
            <li key={w} className="flex gap-2 text-sm text-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReleaseGroup({ title, note, items, hasWallet, artistId }: { title: string; note?: string; items: ArtistRelease[]; hasWallet: boolean; artistId: string | null }) {
  return (
    <section>
      <h2 className="font-heading text-lg font-bold text-foreground">{title}</h2>
      {note && <p className="mt-1 mb-3 text-xs text-muted-foreground">{note}</p>}
      <div className={`space-y-3 ${note ? '' : 'mt-3'}`}>
        {items.map((r) => <ReleaseCard key={r.id} release={r} hasWallet={hasWallet} artistId={artistId} />)}
      </div>
    </section>
  );
}

function ReleaseCard({ release, hasWallet, artistId }: { release: ArtistRelease; hasWallet: boolean; artistId: string | null }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);
  const queryClient = useQueryClient();
  const { deleteRelease, reaudition } = useReleaseActions();
  const coin = useSongCoin(release.id);
  const a = release.audition;
  const tier = a?.tier;
  const hasNote = !!(a && (a.hikulu || a.nakulu || a.failures?.length || a.shortfalls?.length || a.plain));
  const minted = coin?.mint_status === 'minted';
  const requested = release.distribution === 'onchain' || Boolean(release.onchain_requested_at);
  const scheduled = isScheduled(release);
  const statusKey = scheduled ? 'scheduled' : release.status;
  // A record that has sat with the judges past the window is stuck, not busy:
  // the tab closed on it, or the audition fell over. It can be asked again.
  const stuck =
    (release.status === 'auditioning' || release.status === 'uploading')
    && Date.now() - new Date(release.created_at).getTime() > AUDITION_STALE_MS;
  const canDelete = release.status !== 'published';

  const remove = async () => {
    setWorking(true);
    try {
      await deleteRelease(release.id);
      toast('Removed', { description: `${release.title || 'That record'} is gone from your Studio.` });
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not remove it. Try again.');
    } finally {
      setWorking(false);
      setConfirmDelete(false);
    }
  };

  const askAgain = async () => {
    setWorking(true);
    try {
      const r = await reaudition(release.id);
      toast(r.passed ? 'It is live' : 'Back to the workshop', {
        description: r.hikulu || r.plain || (r.passed ? 'The judges are done with it.' : 'See what the judges said on the card.'),
      });
    } catch (err) {
      toast.error((err as Error)?.message || 'The judges could not be reached. Try again in a minute.');
    } finally {
      setWorking(false);
    }
  };

  /* "Take it onchain": the artist's wish is recorded on the row and lands in
     the admin coin queue; the mint itself runs from the platform signer. */
  const takeOnchain = async () => {
    if (!hasWallet) {
      toast('Connect a wallet first', { description: 'The coin pays out to it. Add one in your profile, then come back.' });
      return;
    }
    setAsking(true);
    try {
      await requestOnchain(release.id);
      await queryClient.invalidateQueries({ queryKey: ['artist_releases'] });
      toast('On its way on chain', { description: 'We mint it and message you when the coin is live.' });
    } catch (err) {
      toast.error((err as Error)?.message || 'That did not go through. Try again.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <SongDetailsDialog
        songId={release.id}
        title={release.title || 'Untitled'}
        genre={release.genre}
        artistId={artistId}
        coverUrl={release.cover_art_url}
        open={editing}
        onOpenChange={setEditing}
        // A record still at 'uploading' has its audio in and was only waiting
        // on the artist. Saving the details sends it to the judges at any age;
        // this used to wait twenty minutes, so a cover added straight away did nothing.
        onSaved={release.status === 'uploading' ? () => void askAgain() : undefined}
      />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {release.title || 'this record'}?</AlertDialogTitle>
            <AlertDialogDescription>
              The file and everything you typed for it go with it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Keep it</AlertDialogCancel>
            <AlertDialogAction disabled={working} onClick={(e) => { e.preventDefault(); void remove(); }}>
              {working ? 'Removing' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {release.track_number ? <span className="mr-1.5 tabular-nums text-muted-foreground">{release.track_number}.</span> : null}
            {release.title || 'Untitled'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {release.artist_name}
            {release.genre ? ` · ${release.genre}` : ''}
            {release.explicit ? ' · Explicit' : ''}
            {release.duration_seconds ? ` · ${Math.floor(release.duration_seconds / 60)}:${String(Math.round(release.duration_seconds % 60)).padStart(2, '0')}` : ''}
          </p>
          {scheduled && (release.release_at || release.release_date) && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
              <CalendarClock className="h-3.5 w-3.5" /> Goes public {release.release_at ? new Date(release.release_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : `on ${prettyDate(release.release_date!)}`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {tier && release.status === 'published' && (
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${TIER_CHIP[tier]}`}>
              {TIER_LABEL[tier]}
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
            statusKey === 'published' ? 'bg-primary/15 text-primary'
              : statusKey === 'scheduled' ? 'bg-primary/10 text-primary'
              : statusKey === 'workshop' ? 'bg-amber-500/15 text-amber-500'
              : 'bg-muted text-muted-foreground'
          }`}>
            {STATUS_LABEL[statusKey] ?? statusKey}
          </span>
        </div>
      </div>

      {/* A record whose audio landed but whose cover never did used to sit here
          saying "Upload started" for ever, with nothing to say what was wrong.
          One artist stranded eleven that way and sent the same song three times
          trying to get past it. Say what is missing and what fixes it. */}
      {release.status === 'uploading' && (!release.cover_art_url || !release.genre) && (
        <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          Your audio is safely uploaded. This one still needs its
          {!release.cover_art_url && !release.genre ? ' cover art and a genre' : !release.cover_art_url ? ' cover art' : ' genre'}.
          Open Edit details, add {!release.cover_art_url && !release.genre ? 'them' : 'it'}, save, and it goes to the judges by itself.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted min-h-10"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit details
        </button>
        {release.status === 'uploading' && release.audio_url && (
          <Link
            to={`/studio?release=ep&with=${release.id}`}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted min-h-10"
          >
            <ListMusic className="h-3.5 w-3.5" /> Send it with more tracks
          </Link>
        )}
        {minted ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <Coins className="h-3.5 w-3.5" /> On chain
          </span>
        ) : requested ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <Coins className="h-3.5 w-3.5" /> Coin on its way
          </span>
        ) : release.status === 'published' ? (
          <button
            type="button"
            onClick={takeOnchain}
            disabled={asking}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-60 min-h-10"
          >
            <Coins className="h-3.5 w-3.5" /> Take it onchain
          </button>
        ) : null}
        {stuck && (
          <button
            type="button"
            onClick={askAgain}
            disabled={working}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-500 hover:bg-amber-500/25 disabled:opacity-60 min-h-10"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${working ? 'animate-spin' : ''}`} /> Ask the judges again
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={working}
            aria-label={`Remove ${release.title || 'this record'}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60 min-h-10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>
      {stuck && !release.cover_art_url ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            The music arrived. It stopped at the cover. Add the artwork and it goes to the judges.
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 min-h-10"
          >
            <ImageIcon className="h-3.5 w-3.5" /> Add the cover
          </button>
        </div>
      ) : stuck ? (
        <p className="mt-2 text-xs text-muted-foreground">
          This one has been with the judges longer than it should. Usually the tab closed on it. Ask again and it picks up where it left off.
        </p>
      ) : null}

      {hasNote && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-3 text-xs font-semibold text-primary"
          >
            {open ? 'Hide what the judges said' : 'What the judges said'}
          </button>
          {open && (
            <div className="mt-3 space-y-3">
              {a?.plain && !a.ok && (
                <p className="text-sm text-foreground">{a.plain}</p>
              )}
              {a?.hikulu && (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-accent">$HIKULU</p>
                  <p className="text-sm text-foreground">{a.hikulu}</p>
                </div>
              )}
              {a?.nakulu && (
                <div className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-rose-400">NAKULU</p>
                  <p className="text-sm text-foreground">{a.nakulu}</p>
                </div>
              )}
              <AuditionDetail
                failures={a?.failures}
                advisories={a?.advisories}
                shortfalls={a?.shortfalls}
                published={release.status === 'published'}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AuditionDetail({
  failures = [],
  advisories = [],
  shortfalls = [],
  published = false,
}: {
  failures?: Array<{ code: string; plain: string }>;
  advisories?: Array<{ code: string; plain: string }>;
  shortfalls?: Array<{ code: string; plain: string }>;
  published?: boolean;
}) {
  // On a published track the shortfalls are the interesting list, and they are
  // already inside advisories. Showing both would say everything twice.
  const climb = published ? shortfalls : [];
  const notes = published
    ? advisories.filter((a) => !climb.some((c) => c.code === a.code))
    : advisories;

  if (!failures.length && !notes.length && !climb.length) return null;
  return (
    <div className="space-y-3">
      {climb.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            To climb the next rung
          </p>
          <ul className="space-y-1.5">
            {climb.map((c) => (
              <li key={c.code} className="flex gap-2 text-sm text-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                {c.plain}
              </li>
            ))}
          </ul>
        </div>
      )}
      {failures.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">What to fix</p>
          <ul className="space-y-1.5">
            {failures.map((f) => (
              <li key={f.code} className="flex gap-2 text-sm text-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                {f.plain}
              </li>
            ))}
          </ul>
        </div>
      )}
      {notes.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Worth knowing</p>
          <ul className="space-y-1.5">
            {notes.map((a) => (
              <li key={a.code} className="flex gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                {a.plain}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default Studio;
