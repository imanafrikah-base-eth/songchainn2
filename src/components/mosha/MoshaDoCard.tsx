import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ARTISTS, SONGS } from '@/data/musicData';
import { useAuth } from '@/context/AuthContext';
import { usePlayerActions } from '@/context/PlayerContext';
import { useEngagement } from '@/context/EngagementContext';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { useOfflineAudio } from '@/hooks/useOfflineAudio';
import { useShare } from '@/hooks/useShare';
import { moshaDo, type DoCheck, type DoCtx, type MoshaDoOp } from '@/lib/moshaDo';
import {
  dismissMoshaJob,
  getMoshaJob,
  getMoshaJobsVersion,
  isMoshaJobDismissed,
  runMoshaJob,
  subscribeMoshaJobs,
} from '@/lib/moshaJobs';

function useJob(jobId: string) {
  useSyncExternalStore(subscribeMoshaJobs, getMoshaJobsVersion, getMoshaJobsVersion);
  return { job: getMoshaJob(jobId), dismissed: isMoshaJobDismissed(jobId) };
}

/** The player lives only inside a signed-in session; outside it there is simply no player. */
function useOptionalPlayer() {
  try {
    return usePlayerActions();
  } catch {
    return null;
  }
}

/** Everything a job may need that only a component can reach: the whole catalogue, the player, likes, offline, links. */
function useDoCtx(): { ctx: DoCtx; ready: boolean } {
  const { user } = useAuth();
  const { songs: published, artists: publishedArtists, isLoading } = usePublishedCatalog();
  const player = useOptionalPlayer();
  const { isLiked, toggleLike } = useEngagement();
  const { cacheSong, isSongCached } = useOfflineAudio();
  const { getSongShareUrl } = useShare();
  const playSong = player?.playSong;
  const ctx = useMemo<DoCtx>(
    () => ({
      userId: user?.id ?? null,
      songs: [...SONGS, ...published],
      artists: [...ARTISTS, ...publishedArtists],
      playSong: playSong ? (s) => playSong(s) : undefined,
      isLiked,
      toggleLike,
      cacheSong,
      isSongCached,
      songShareUrl: (s) => getSongShareUrl({ id: s.id, title: s.title, artist: s.artist }),
    }),
    [user?.id, published, publishedArtists, playSong, isLiked, toggleLike, cacheSong, isSongCached, getSongShareUrl],
  );
  return { ctx, ready: !isLoading };
}

const CARD = 'animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-border bg-card p-3 text-foreground shadow-lg';

/**
 * The pop-up over the composer: one question, one button. It looks first, so
 * the question says exactly what will happen; when more than one song or
 * artist fits, each is its own button. Once tapped it shows the job running
 * and goes away when it is done; the report itself lands as a toast and a line
 * from Mo$ha, even if the person has moved on.
 */
export function MoshaDoPopup({ jobId, op, arg }: { jobId: string; op: MoshaDoOp; arg?: string }) {
  const queryClient = useQueryClient();
  const { job, dismissed } = useJob(jobId);
  const { ctx, ready } = useDoCtx();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [check, setCheck] = useState<DoCheck | null>(null);

  useEffect(() => {
    if (job.status !== 'idle' || dismissed || !ready) return;
    let live = true;
    moshaDo(op)
      .check(ctxRef.current, arg)
      .then((c) => live && setCheck(c))
      .catch(() => live && setCheck({ nothing: 'I could not check that just now. Ask me again in a moment.' }));
    return () => {
      live = false;
    };
  }, [op, arg, job.status, dismissed, ready]);

  // Nothing to do is said, then the pop-up goes by itself.
  useEffect(() => {
    if (!check?.nothing || job.status !== 'idle') return;
    const t = window.setTimeout(() => dismissMoshaJob(jobId), 5000);
    return () => window.clearTimeout(t);
  }, [check?.nothing, job.status, jobId]);

  if (dismissed || job.status === 'done') return null;

  const go = (choice?: string) => void runMoshaJob(jobId, op, queryClient, { ctx: ctxRef.current, arg, choice });

  const close = (
    <button
      type="button"
      onClick={() => dismissMoshaJob(jobId)}
      aria-label="Not now"
      className="-mr-1.5 -mt-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
    >
      <X className="h-4 w-4" />
    </button>
  );

  if (job.status === 'running') {
    return (
      <div className={CARD} role="status" aria-live="polite">
        <p className="inline-flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> {job.message}
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Keep chatting. I will tell you when it is done.</p>
      </div>
    );
  }

  if (job.status === 'error') {
    return (
      <div className={CARD} role="alert">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm text-destructive">{job.message}</p>
          {close}
        </div>
        <button
          type="button"
          onClick={() => go()}
          className="mt-1 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-xs font-semibold hover:bg-muted"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!check) {
    return (
      <div className={CARD} role="status">
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking
        </p>
      </div>
    );
  }

  if (check.nothing) {
    return (
      <div className={CARD} role="status">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm">{check.nothing}</p>
          {close}
        </div>
      </div>
    );
  }

  return (
    <div className={CARD} role="dialog" aria-label={check.question}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{check.question}</p>
          {check.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{check.note}</p>}
        </div>
        {close}
      </div>
      {check.choices?.length ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {check.choices.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => go(c.value)}
              className="inline-flex min-h-11 w-full items-center rounded-xl border border-border px-3 text-left text-sm font-medium hover:bg-muted"
            >
              <span className="truncate">{c.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => go()}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {check.confirm}
          </button>
          <button
            type="button"
            onClick={() => dismissMoshaJob(jobId)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Not now
          </button>
        </div>
      )}
    </div>
  );
}

/** Under Mo$ha's reply: how the job it offered is going. Silent until it starts. */
export function MoshaDoStatus({ jobId }: { jobId: string }) {
  const { job } = useJob(jobId);
  if (job.status === 'running') {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {job.message}
      </p>
    );
  }
  if (job.status === 'done') {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
        <Check className="h-3.5 w-3.5" /> {job.message}
      </p>
    );
  }
  if (job.status === 'error') return <p className="mt-1.5 text-xs text-destructive">{job.message}</p>;
  return null;
}
