import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, UploadCloud, Loader2, CheckCircle2, Wrench, Music4, Wallet, Coins, AlertCircle,
} from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useArtistReleases, useTrackUpload, type ArtistRelease } from '@/hooks/useArtistStudio';

// A WAV master runs about 10.6 MB a minute, so this has to be generous enough
// that a full lossless record fits. Keep in step with MAX_BYTES in upload-url.
const MAX_MB = 100;

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
  const { user } = useAuth();
  const { data: profile } = useMyProfile();
  const { data: releases = [], isLoading } = useArtistReleases();
  const { phase, progress, error, result, upload, reset } = useTrackUpload();

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [genre, setGenre] = useState('');

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
  const canSubmit = !!file && !tooBig && title.trim().length > 0 && artistName.trim().length > 0 && !busy;

  const submit = async () => {
    if (!file || !canSubmit) return;
    await upload(file, { title: title.trim(), artistName: artistName.trim(), genre: genre.trim() || undefined });
  };

  const startOver = () => {
    reset();
    setFile(null);
    setTitle('');
    setGenre('');
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <Navigation />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <Music4 className="mx-auto h-10 w-10 text-primary mb-4" />
          <h1 className="font-heading text-2xl font-bold mb-2">Your music, your store</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Make an account and you can put a record out today. No wallet needed to release, no fee, no waiting on anybody's approval.
          </p>
          <Link to="/auth" className="inline-flex items-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">
            Create an account
          </Link>
        </div>
        <AudioPlayer />
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
          Send a finished record. $HIKULU and NAKULU listen to how it was mastered, and if it meets the standard it goes live to New Releases the same minute. Nobody approves it by hand.
        </p>

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

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
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
              <h2 className="font-heading text-lg font-bold text-foreground">
                {result.passed ? 'It is live' : 'One more pass in the studio'}
              </h2>
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

            <AuditionDetail failures={result.failures} advisories={result.advisories} />

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

        {/* ---------------------------------------------------- releases --- */}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your catalog.</p>
        ) : releases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing here yet. The first one you send will show up right here.
          </p>
        ) : (
          <div className="space-y-8">
            {pending.length > 0 && <ReleaseGroup title="In progress" items={pending} />}
            {live.length > 0 && <ReleaseGroup title="Live on SONGCHAINN" items={live} />}
            {workshop.length > 0 && (
              <ReleaseGroup
                title="Your workshop"
                note="Only you can see this. Nobody else can browse it, and there is no limit on sending a track back once you have fixed it."
                items={workshop}
              />
            )}
          </div>
        )}
      </div>
      <AudioPlayer />
    </div>
  );
};

function ReleaseGroup({ title, note, items }: { title: string; note?: string; items: ArtistRelease[] }) {
  return (
    <section>
      <h2 className="font-heading text-lg font-bold text-foreground">{title}</h2>
      {note && <p className="mt-1 mb-3 text-xs text-muted-foreground">{note}</p>}
      <div className={`space-y-3 ${note ? '' : 'mt-3'}`}>
        {items.map((r) => <ReleaseCard key={r.id} release={r} />)}
      </div>
    </section>
  );
}

function ReleaseCard({ release }: { release: ArtistRelease }) {
  const [open, setOpen] = useState(false);
  const a = release.audition;
  const hasNote = !!(a && (a.hikulu || a.nakulu || a.failures?.length || a.plain));

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{release.title || 'Untitled'}</p>
          <p className="truncate text-xs text-muted-foreground">{release.artist_name}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
          release.status === 'published' ? 'bg-primary/15 text-primary'
            : release.status === 'workshop' ? 'bg-amber-500/15 text-amber-500'
            : 'bg-muted text-muted-foreground'
        }`}>
          {STATUS_LABEL[release.status] ?? release.status}
        </span>
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
              <AuditionDetail failures={a?.failures} advisories={a?.advisories} />
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
}: {
  failures?: Array<{ code: string; plain: string }>;
  advisories?: Array<{ code: string; plain: string }>;
}) {
  if (!failures.length && !advisories.length) return null;
  return (
    <div className="space-y-3">
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
      {advisories.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Worth knowing</p>
          <ul className="space-y-1.5">
            {advisories.map((a) => (
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
