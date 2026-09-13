import { useEffect, useState, useSyncExternalStore } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { moshaDo, type DoCheck, type MoshaDoOp } from '@/lib/moshaDo';
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

const CARD = 'animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-border bg-card p-3 text-foreground shadow-lg';

/**
 * The pop-up over the composer: one question, one button. It counts first, so
 * the question says exactly what will happen. Once tapped it shows the job
 * running and goes away when it is done; the report itself lands as a toast
 * and a line from Mo$ha, even if the person has moved on.
 */
export function MoshaDoPopup({ jobId, op }: { jobId: string; op: MoshaDoOp }) {
  const queryClient = useQueryClient();
  const { job, dismissed } = useJob(jobId);
  const [check, setCheck] = useState<DoCheck | null>(null);

  useEffect(() => {
    if (job.status !== 'idle' || dismissed) return;
    let live = true;
    moshaDo(op)
      .check()
      .then((c) => live && setCheck(c))
      .catch(() => live && setCheck({ nothing: 'I could not check that just now. Ask me again in a moment.' }));
    return () => {
      live = false;
    };
  }, [op, job.status, dismissed]);

  // Nothing to do is said, then the pop-up goes by itself.
  useEffect(() => {
    if (!check?.nothing || job.status !== 'idle') return;
    const t = window.setTimeout(() => dismissMoshaJob(jobId), 5000);
    return () => window.clearTimeout(t);
  }, [check?.nothing, job.status, jobId]);

  if (dismissed || job.status === 'done') return null;

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
          onClick={() => void runMoshaJob(jobId, op, queryClient)}
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
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => void runMoshaJob(jobId, op, queryClient)}
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
