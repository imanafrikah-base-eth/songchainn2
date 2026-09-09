import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, UploadCloud, Loader2, CheckCircle2, Wrench, Music4, Wallet, Coins, AlertCircle,
  Image as ImageIcon, Globe2, Trash2, RefreshCw, CalendarClock, X, ListMusic,
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
import { supabase } from '@/integrations/supabase/client';
import {
  useArtistReleases, useBatchUpload, useReleaseActions, isScheduled, AUDITION_STALE_MS, UPLOADS_PER_DAY,
  TIER_LABEL, type ArtistRelease, type ReleaseTier, type QueuedTrack, type BatchMeta,
} from '@/hooks/useArtistStudio';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Pencil } from 'lucide-react';
import { SongDetailsFields, DistributionChoice } from '@/components/studio/SongDetailsFields';
import { SongDetailsDialog } from '@/components/studio/SongDetailsDialog';
import { UploadProgress } from '@/components/studio/UploadProgress';
import { ActivityBoard } from '@/components/studio/ActivityBoard';
import { EMPTY_DETAILS, detailProblems, requestOnchain, type SongDetails } from '@/lib/songDetails';
import { useSongCoin } from '@/hooks/useSongCoins';

// A WAV master runs about 10.6 MB a minute, so this has to be generous enough
// that a full lossless record fits. Keep in step with MAX_BYTES in upload-url.
const MAX_MB = 100;
// Keep in step with MAX_COVER_BYTES in upload-url.
const MAX_COVER_MB = 8;
// Stores want square art. Under this it is soft on a phone; under 600 it is
// unusable and gets stopped here rather than at the server.
const COVER_GOOD_PX = 1400;
const COVER_MIN_PX = 600;

/** What is wrong with a cover before a byte of it leaves the phone. */
async function checkCover(file: File): Promise<{ block: string | null; warn: string | null }> {
  if (file.size > MAX_COVER_MB * 1024 * 1024) {
    return { block: `That image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Covers are ${MAX_COVER_MB} MB at most.`, warn: null };
  }
  const url = URL.createObjectURL(file);
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('unreadable'));
      img.src = url;
    });
    const shortest = Math.min(width, height);
    const ratio = width / height;
    if (ratio > 1.1 || ratio < 0.9) {
      return { block: `That image is ${width} by ${height}. Covers have to be square; crop it first.`, warn: null };
    }
    if (shortest < COVER_MIN_PX) {
      return { block: `That image is only ${shortest} pixels across. It needs at least ${COVER_MIN_PX}, and ${COVER_GOOD_PX} looks right.`, warn: null };
    }
    if (shortest < COVER_GOOD_PX) {
      return { block: null, warn: `${shortest} pixels across will look soft on a big screen. ${COVER_GOOD_PX} or more is the store standard.` };
    }
    return { block: null, warn: null };
  } catch {
    return { block: 'We could not read that image. Send a JPG, PNG or WEBP.', warn: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Under this the judges send it to the workshop anyway (a snippet), so say
// so before a 90 MB upload rather than after it.
const MIN_SECONDS = 30;

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
        .select('display_name, username, wallet_address')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data ?? null;
    },
    staleTime: 60_000,
  });
}

const Studio = () => {
  const { user, isArtist, artistId } = useAuth();
  const { becomeArtist, pending: becoming } = useBecomeArtist();
  const { data: profile } = useMyProfile();
  const { data: releases = [], isLoading } = useArtistReleases();
  const { tracks, busy, landing, finished, add, remove, setTitle, setTrackNumber, numberAll, start, askAgain, reset, setDefaults } = useBatchUpload();
  const { cannotUpload } = useCompliance();

  const fileRef = useRef<HTMLInputElement>(null);
  const [artistName, setArtistName] = useState('');
  const [genre, setGenre] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverCheck, setCoverCheck] = useState<{ block: string | null; warn: string | null }>({ block: null, warn: null });
  const coverRef = useRef<HTMLInputElement>(null);
  /** Credits, paperwork, the release and where the records live. Shared by the batch. All optional. */
  const [details, setDetails] = useState<SongDetails>(EMPTY_DETAILS);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!artistName && profile) {
      setArtistName(profile.display_name || profile.username || '');
    }
  }, [profile, artistName]);

  const hasWallet = !!profile?.wallet_address;

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

  // What upload-url will let through today, so a ten-track album is told
  // here rather than refused on track seven.
  const sentToday = useMemo(() => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return releases.filter((r) => new Date(r.created_at).getTime() > since).length;
  }, [releases]);
  const leftToday = Math.max(0, UPLOADS_PER_DAY - sentToday);
  const queued = tracks.filter((t) => t.phase === 'queued' || t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || (t.phase === 'error' && !t.songId));
  const overCap = queued.length > leftToday;

  const detailProblem = detailProblems({ ...details, track_number: null })[0] ?? null;
  const onRelease = !!details.release_id;

  /** What stops this one row from being sent, in the artist's words. */
  const trackProblem = (t: QueuedTrack): string | null => {
    if (t.file.size > MAX_MB * 1024 * 1024) return `That file is ${(t.file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${MAX_MB} MB.`;
    if (t.seconds !== null && t.seconds < MIN_SECONDS) return `That runs ${Math.round(t.seconds)} seconds. A record has to be at least ${MIN_SECONDS}; anything shorter goes straight to the workshop as a snippet.`;
    if (!t.title.trim()) return 'Give it a title.';
    if (onRelease && (!t.trackNumber || t.trackNumber < 1)) return 'Give it a track number on the release.';
    return null;
  };
  const sameTitleOf = (t: QueuedTrack): ArtistRelease | null => {
    const title = t.title.trim().toLowerCase();
    return title ? releases.find((r) => (r.title ?? '').trim().toLowerCase() === title) ?? null : null;
  };
  const twiceInQueue = (t: QueuedTrack): boolean => {
    const title = t.title.trim().toLowerCase();
    return !!title && tracks.some((o) => o.key !== t.key && o.title.trim().toLowerCase() === title);
  };

  const canSubmit =
    queued.length > 0 && queued.every((t) => !trackProblem(t)) && !coverCheck.block && !detailProblem
    && artistName.trim().length > 0 && !busy && !cannotUpload && !overCap;

  const meta = (): BatchMeta => ({
    artistName: artistName.trim(),
    genre: genre.trim() || undefined,
    cover,
    details,
  });

  const addFiles = (incoming: FileList | File[] | null) => {
    const files = Array.from(incoming ?? []).filter(
      (f) => /\.(wav|mp3)$/i.test(f.name) || /^audio\/(wav|x-wav|mpeg)$/.test(f.type),
    );
    if (!files.length) return;
    add(files, { onRelease });
  };

  /** Turning a release on numbers the queue in order; turning it off clears the numbers. */
  const changeDetails = (next: SongDetails) => {
    if (!!next.release_id !== !!details.release_id) numberAll(!!next.release_id);
    setDetails(next);
  };

  const submit = async () => {
    if (!canSubmit) return;
    await start(meta());
  };

  const startOver = () => {
    reset();
    setGenre('');
    setDetails(EMPTY_DETAILS);
    setMoreOpen(false);
    setCover(null);
    setCoverCheck({ block: null, warn: null });
    setCoverPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    if (fileRef.current) fileRef.current.value = '';
    if (coverRef.current) coverRef.current.value = '';
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
          Send a finished record. The judges listen, and it is live the same minute. One or a whole EP at once.
        </p>

        {/* ------------------------------------------------------- world --- */}

        {WORLD_BUILDER_ENABLED && isArtist && (
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
          <div className="rounded-2xl border border-border bg-card p-5 mb-8">
            <div
              onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) addFiles(e.dataTransfer.files); }}
              className={`rounded-xl border border-dashed p-3 transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {tracks.length > 0 ? 'Add more audio files' : 'Audio files'}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".wav,.mp3,audio/wav,audio/x-wav,audio/mpeg"
                  disabled={busy}
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = '';
                  }}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary/15 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/25"
                />
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                WAV or MP3, up to {MAX_MB} MB each. Pick one, or a whole EP.
              </p>
            </div>

            {tracks.length > 0 && (
              <ul className="mt-4 space-y-2" aria-label="Tracks to send">
                {tracks.map((t) => (
                  <TrackRow
                    key={t.key}
                    track={t}
                    onRelease={onRelease}
                    problem={trackProblem(t)}
                    sameTitle={sameTitleOf(t)}
                    twice={twiceInQueue(t)}
                    busy={busy}
                    onTitle={(v) => setTitle(t.key, v)}
                    onNumber={(v) => setTrackNumber(t.key, v)}
                    onRemove={() => remove(t.key)}
                    onRetry={() => void start(meta(), t.key)}
                    onAskAgain={() => void askAgain(t.key)}
                    retryReady={!trackProblem(t) && !coverCheck.block && !detailProblem && artistName.trim().length > 0 && !cannotUpload && leftToday > 0}
                  />
                ))}
              </ul>
            )}
            {tracks.length > 1 && !busy && (
              <p className="mt-2 text-xs text-muted-foreground">
                They go up one after the other and each one is judged the moment it lands. Titles come from the file names; fix any that look wrong before you send.
              </p>
            )}
            {overCap && (
              <p className="mt-2 text-xs text-destructive">
                That is {queued.length} to send and you have {leftToday} left today. The door lets {UPLOADS_PER_DAY} through a day; take some out or send the rest tomorrow.
              </p>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Artist name</span>
                <input
                  value={artistName}
                  onChange={(e) => setArtistName(e.target.value)}
                  disabled={busy}
                  maxLength={120}
                  placeholder="How it should appear"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cover art <span className="normal-case font-normal">{tracks.length > 1 ? '(one for the whole batch; optional, but it should not be)' : '(optional, but it should not be)'}</span>
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
                    {coverPreview
                      ? <img src={coverPreview} alt="" className="h-full w-full object-cover" />
                      : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <input
                    ref={coverRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setCover(f);
                      setCoverCheck({ block: null, warn: null });
                      if (f) void checkCover(f).then(setCoverCheck);
                      setCoverPreview((old) => {
                        if (old) URL.revokeObjectURL(old);
                        return f ? URL.createObjectURL(f) : null;
                      });
                    }}
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-foreground"
                  />
                </div>
                {coverCheck.block ? (
                  <p className="mt-2 text-xs text-destructive">{coverCheck.block}</p>
                ) : coverCheck.warn ? (
                  <p className="mt-2 text-xs text-amber-500">{coverCheck.warn}</p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Square JPG, PNG or WEBP, {COVER_GOOD_PX} pixels or more, under {MAX_COVER_MB} MB. Without it your record shows up blank next to everyone else.
                  </p>
                )}
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Genre <span className="normal-case font-normal">(optional)</span></span>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="">Pick the closest one</option>
                  {GENRES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  This is where the record files in Discover. Pick the nearest fit; you can change it later.
                </span>
              </label>

              <div className="sm:col-span-2">
                <DistributionChoice
                  value={details.distribution}
                  onChange={(v) => setDetails((d) => ({ ...d, distribution: v }))}
                  hasWallet={hasWallet}
                  disabled={busy}
                />
              </div>

              <div className="sm:col-span-2 rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                >
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {tracks.length > 1 ? 'EP or album, credits and paperwork' : 'Lyrics, credits and paperwork'}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {tracks.length > 1 ? 'Put these tracks on one release. Optional now, editable any time.' : 'Optional now, editable any time from your catalog.'}
                    </span>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                </button>
                {moreOpen && (
                  <div className="border-t border-border p-3">
                    <SongDetailsFields value={details} onChange={changeDetails} disabled={busy} artistId={artistId} shared={tracks.length > 1} />
                  </div>
                )}
              </div>
            </div>

            {detailProblem && (
              <p className="mt-4 text-xs text-destructive">{detailProblem}</p>
            )}

            {busy && tracks.length > 1 && (
              <div className="mt-5 flex items-center gap-2 text-sm text-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
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
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {busy ? 'Working' : landing ? (queued.length > 1 ? `Finish and send all ${queued.length}` : 'Finish and send') : queued.length > 1 ? `Send all ${queued.length} in` : 'Send it in'}
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
                  {details.release_id ? ' They sit together on the release, in track order.' : ''}
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

function mmss(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

/** One record in the queue: its title, what is wrong with it, and how far along it is. */
function TrackRow({
  track: t, onRelease, problem, sameTitle, twice, busy, retryReady, onTitle, onNumber, onRemove, onRetry, onAskAgain,
}: {
  track: QueuedTrack;
  onRelease: boolean;
  problem: string | null;
  sameTitle: ArtistRelease | null;
  twice: boolean;
  busy: boolean;
  retryReady: boolean;
  onTitle: (v: string) => void;
  onNumber: (v: number | null) => void;
  onRemove: () => void;
  onRetry: () => void;
  onAskAgain: () => void;
}) {
  const editable = t.phase === 'queued' || t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || (t.phase === 'error' && !t.songId);
  const mb = (t.file.size / (1024 * 1024)).toFixed(1);
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-start gap-2">
        {onRelease && (
          <input
            type="number"
            min={1}
            max={99}
            value={t.trackNumber ?? ''}
            disabled={!editable}
            aria-label="Track number"
            placeholder="#"
            onChange={(e) => onNumber(e.target.value ? Number(e.target.value) : null)}
            className="w-14 shrink-0 rounded-xl border border-border bg-background px-2 py-2 text-center text-sm tabular-nums text-foreground focus:border-primary focus:outline-none disabled:opacity-60"
          />
        )}
        <div className="min-w-0 flex-1">
          <input
            value={t.title}
            onChange={(e) => onTitle(e.target.value)}
            disabled={!editable}
            maxLength={120}
            placeholder="Song title"
            aria-label="Song title"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none disabled:opacity-60"
          />
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {t.file.name}{t.seconds !== null ? `, ${mmss(t.seconds)} long` : ''}, {mb} MB
          </p>
          {problem && editable && <p className="mt-1 text-xs text-destructive">{problem}</p>}
          {!problem && editable && twice && (
            <p className="mt-1 text-xs text-amber-500">Two tracks in this batch have this title.</p>
          )}
          {!problem && editable && !twice && sameTitle && (
            <p className="mt-1 text-xs text-amber-500">
              You already have a record called this ({STATUS_LABEL[sameTitle.status] ?? sameTitle.status}). Send it anyway if this is a different version, or edit the other one instead.
            </p>
          )}
          {(t.phase === 'preparing' || t.phase === 'uploading' || t.phase === 'ready' || t.phase === 'auditioning') && (
            <UploadProgress phase={t.phase} progress={t.progress} />
          )}
          {t.phase === 'done' && t.result && (
            <p className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold ${t.result.passed ? 'text-primary' : 'text-amber-500'}`}>
              {t.result.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
              {t.result.passed ? (t.result.tier ? `Live. ${TIER_LABEL[t.result.tier]}` : 'Live') : 'In the workshop'}
            </p>
          )}
          {t.phase === 'error' && t.error && (
            <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5">
              <p className="text-xs text-foreground">{t.error}</p>
              <button
                type="button"
                onClick={t.songId ? onAskAgain : onRetry}
                disabled={busy || (!t.songId && !retryReady)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" /> {t.songId ? 'Ask the judges again' : 'Try again'}
              </button>
            </div>
          )}
        </div>
        {editable && !busy && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${t.title || t.file.name}`}
            className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}

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
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground"
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
        open={editing}
        onOpenChange={setEditing}
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit details
        </button>
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
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
          >
            <Coins className="h-3.5 w-3.5" /> Take it onchain
          </button>
        ) : null}
        {stuck && (
          <button
            type="button"
            onClick={askAgain}
            disabled={working}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-500 hover:bg-amber-500/25 disabled:opacity-60"
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
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>
      {stuck && (
        <p className="mt-2 text-xs text-muted-foreground">
          This one has been with the judges longer than it should. Usually the tab closed on it. Ask again and it picks up where it left off.
        </p>
      )}

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
