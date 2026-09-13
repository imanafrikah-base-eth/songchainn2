import { toast } from 'sonner';
import type { QueryClient } from '@tanstack/react-query';
import { moshaDo, type MoshaDoOp } from '@/lib/moshaDo';

/**
 * Jobs Mo$ha runs for somebody on one tap, kept outside every component.
 *
 * N3M3SIS asked Mo$ha to clear her duplicate photos (13 Sep 2026). The answer
 * is one pop-up, "Delete 4 duplicates now?", and a tap. After that the chat can
 * close, she can keep talking or change page, and the job still finishes and
 * its report still lands: a toast wherever she is, and a line from Mo$ha in any
 * chat window that is open.
 */

export type MoshaJob = { status: 'idle' | 'running' | 'done' | 'error'; message: string };

const IDLE: MoshaJob = { status: 'idle', message: '' };
const jobs = new Map<string, MoshaJob>();
const dismissed = new Set<string>();
const listeners = new Set<() => void>();
type DoneListener = (r: { jobId: string; op: MoshaDoOp; message: string }) => void;
const doneListeners = new Set<DoneListener>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

/** One job per offer: the op and the reply it was offered under. */
export function doJobKey(op: MoshaDoOp, turnKey: string | number | null | undefined): string {
  return `${op}:${turnKey ?? ''}`;
}

export function getMoshaJob(jobId: string): MoshaJob {
  return jobs.get(jobId) ?? IDLE;
}

export function isMoshaJobDismissed(jobId: string): boolean {
  return dismissed.has(jobId);
}

export function subscribeMoshaJobs(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getMoshaJobsVersion(): number {
  return version;
}

/** "Not now": the pop-up goes and does not come back for that offer. */
export function dismissMoshaJob(jobId: string): void {
  dismissed.add(jobId);
  emit();
}

/** Called once for every job that finishes, wherever it was started. */
export function onMoshaJobDone(fn: DoneListener): () => void {
  doneListeners.add(fn);
  return () => {
    doneListeners.delete(fn);
  };
}

export async function runMoshaJob(jobId: string, op: MoshaDoOp, queryClient?: QueryClient): Promise<void> {
  const now = jobs.get(jobId)?.status;
  if (now === 'running' || now === 'done') return;
  const task = moshaDo(op);
  jobs.set(jobId, { status: 'running', message: task.working });
  emit();
  try {
    const message = await task.run();
    jobs.set(jobId, { status: 'done', message });
    emit();
    toast.success('Mo$ha', { description: message, duration: 5000 });
    doneListeners.forEach((l) => l({ jobId, op, message }));
    if (queryClient) await Promise.all(task.refresh.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  } catch (e) {
    const message = (e as Error)?.message || 'That did not go through. Try again.';
    jobs.set(jobId, { status: 'error', message });
    emit();
    toast.error('Mo$ha could not finish that', { description: message });
  }
}
