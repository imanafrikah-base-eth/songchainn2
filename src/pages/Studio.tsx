import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, UploadCloud, Loader2, CheckCircle2, Wrench, Music4, Wallet, Coins, AlertCircle,
  Image as ImageIcon, Globe2,
} from 'lucide-react';
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
  useArtistReleases, useTrackUpload, TIER_LABEL, type ArtistRelease, type ReleaseTier,
} from '@/hooks/useArtistStudio';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Pencil } from 'lucide-react';
import { SongDetailsFields, DistributionChoice } from '@/components/studio/SongDetailsFields';
import { SongDetailsDialog } from '@/components/studio/SongDetailsDialog';
import { ActivityBoard } from '@/components/studio/ActivityBoard';
import { EMPTY_DETAILS, requestOnchain, type SongDetails } from '@/lib/songDetails';
import { useSongCoin } from '@/hooks/useSongCoins';

// A WAV master runs about 10.6 MB a minute, so this has to be generous enough
// that a full lossless record fits. Keep in step with MAX_BYTES in upload-url.
const MAX_MB = 100;

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
};

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
  const { phase, progress, error, result, upload, reset } = useTrackUpload();
  const { cannotUpload } = useCompliance();

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [genre, setGenre] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  /** Lyrics, credits, identifiers and where the record lives. All optional. */
  const [details, setDetails] = useState<SongDetails>(EMPTY_DETAILS);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!artistName && profile) {
      setArtistName(profile.display_name || profile.username || '');
    }
  }, [profile, artistName]);

  const busy = phase === 'preparing' || phase === 'uploading' || phase === 'auditioning';
  const hasWallet = !!profile?.wallet_address;

  const { live, workshop, pending } = useMemo(() => ({
    live: releases.filter((r) => r.status === 'published'),
    workshop: releases.filter((r) => r.status === 'workshop'),
    pending: releases.filter((r) => r.status === 'uploading' || r.status === 'auditioning'),
  }), [releases]);

  const tooBig = file ? file.size > MAX_MB * 1024 * 1024 : false;
  const canSubmit = !!file && !tooBig && title.trim().length > 0 && artistName.trim().length > 0 && !busy && !cannotUpload;

  const submit = async () => {
    if (!file || !canSubmit) return;
    await upload(file, {
      title: title.trim(),
      artistName: artistName.trim(),
      genre: genre.trim() || undefined,
      cover,
      details,
    });
  };

  const startOver = () => {
    reset();
    setFile(null);
    setTitle('');
    setGenre('');
    setDetails(EMPTY_DETAILS);
    setMoreOpen(false);
    setCover(null);
    setCoverPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    if (fileRef.current) fileRef.current.value = '';
    if (coverRef.current) coverRef.current.value = '';
  };

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
            Everything else on SONGCHAINN is open to you. If you make music, claim your page and this same account becomes your artist account once we confirm it is you.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild><Link to="/claim">Claim your artist page</Link></Button>
            <Button asChild variant="outline"><Link to="/">Back to the music</Link></Button>
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
          Send a finished record. $HIKULU and NAKULU read how it was mastered and it goes live to New Releases the same minute. Only a broken file is held back. Everything else publishes, and how it was finished decides which rung it lands on: mastered to standard, release ready, or out with room to tighten. Nobody approves it by hand.
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

        {phase !== 'done' && (
          <div className="rounded-2xl border border-border bg-card p-5 mb-8">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audio file</span>
              <input
                ref={fileRef}
                type="file"
                accept=".wav,.mp3,audio/wav,audio/x-wav,audio/mpeg"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
                }}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary/15 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/25"
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              WAV or MP3, up to {MAX_MB} MB. Export from your session, not from a streaming rip.
            </p>
            {tooBig && (
              <p className="mt-2 text-xs text-destructive">
                That file is {(file!.size / (1024 * 1024)).toFixed(1)} MB. The limit is {MAX_MB} MB.
              </p>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={busy}
                  maxLength={120}
                  placeholder="Song title"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block">
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
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cover art <span className="normal-case font-normal">(optional, but it should not be)</span></span>
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
                      setCoverPreview((old) => {
                        if (old) URL.revokeObjectURL(old);
                        return f ? URL.createObjectURL(f) : null;
                      });
                    }}
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-foreground"
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Square JPG, PNG or WEBP, under 8 MB. Without it your record shows up blank next to everyone else.
                </p>
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Genre <span className="normal-case font-normal">(optional)</span></span>
                <input
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  disabled={busy}
                  maxLength={60}
                  placeholder="Afrobeats, Amapiano, Hip Hop..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                />
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
                    <span className="block text-sm font-semibold text-foreground">Lyrics, credits and paperwork</span>
                    <span className="block text-xs text-muted-foreground">Optional now, editable any time from your catalog.</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                </button>
                {moreOpen && (
                  <div className="border-t border-border p-3">
                    <SongDetailsFields value={details} onChange={setDetails} disabled={busy} />
                  </div>
                )}
              </div>
            </div>

            {busy && (
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-sm text-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {phase === 'preparing' && 'Getting things ready'}
                  {phase === 'uploading' && `Sending your track, ${progress}%`}
                  {phase === 'auditioning' && 'The judges are listening'}
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${phase === 'auditioning' ? 100 : progress}%` }}
                  />
                </div>
                {phase === 'auditioning' && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    This takes a moment. They are measuring the master properly, not guessing.
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="mt-5 flex gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                <p className="text-sm text-foreground">{error}</p>
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
              {busy ? 'Working' : 'Send it in'}
            </button>
          </div>
        )}

        {/* ------------------------------------------------------ result --- */}

        {phase === 'done' && result && (
          <div className={`mb-8 rounded-2xl border p-5 ${result.passed ? 'border-primary/40 bg-primary/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
            <div className="mb-4 flex items-center gap-2">
              {result.passed
                ? <CheckCircle2 className="h-5 w-5 text-primary" />
                : <Wrench className="h-5 w-5 text-amber-500" />}
              <div>
                <h2 className="font-heading text-lg font-bold text-foreground">
                  {result.passed ? 'It is live' : 'One more pass in the studio'}
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

            <button
              type="button"
              onClick={startOver}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Send another
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
              <Link to="/profile" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
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
            {pending.length > 0 && <ReleaseGroup title="In progress" items={pending} hasWallet={hasWallet} />}
            {live.length > 0 && <ReleaseGroup title="Live on SONGCHAINN" items={live} hasWallet={hasWallet} />}
            {workshop.length > 0 && (
              <ReleaseGroup
                title="Your workshop"
                note="Only you can see this. Nothing lands here unless something on the file is actually broken, and there is no limit on sending a track back once you have fixed it."
                items={workshop}
                hasWallet={hasWallet}
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

function ReleaseGroup({ title, note, items, hasWallet }: { title: string; note?: string; items: ArtistRelease[]; hasWallet: boolean }) {
  return (
    <section>
      <h2 className="font-heading text-lg font-bold text-foreground">{title}</h2>
      {note && <p className="mt-1 mb-3 text-xs text-muted-foreground">{note}</p>}
      <div className={`space-y-3 ${note ? '' : 'mt-3'}`}>
        {items.map((r) => <ReleaseCard key={r.id} release={r} hasWallet={hasWallet} />)}
      </div>
    </section>
  );
}

function ReleaseCard({ release, hasWallet }: { release: ArtistRelease; hasWallet: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const queryClient = useQueryClient();
  const coin = useSongCoin(release.id);
  const a = release.audition;
  const tier = a?.tier;
  const hasNote = !!(a && (a.hikulu || a.nakulu || a.failures?.length || a.shortfalls?.length || a.plain));
  const minted = coin?.mint_status === 'minted';
  const requested = release.distribution === 'onchain' || Boolean(release.onchain_requested_at);

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
      <SongDetailsDialog songId={release.id} title={release.title || 'Untitled'} open={editing} onOpenChange={setEditing} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{release.title || 'Untitled'}</p>
          <p className="truncate text-xs text-muted-foreground">{release.artist_name}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {tier && release.status === 'published' && (
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${TIER_CHIP[tier]}`}>
              {TIER_LABEL[tier]}
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
            release.status === 'published' ? 'bg-primary/15 text-primary'
              : release.status === 'workshop' ? 'bg-amber-500/15 text-amber-500'
              : 'bg-muted text-muted-foreground'
          }`}>
            {STATUS_LABEL[release.status] ?? release.status}
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
      </div>

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
