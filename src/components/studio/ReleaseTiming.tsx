import { useState } from 'react';
import { CalendarClock, Loader2, PauseCircle, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useReleaseActions, isScheduled, type ArtistRelease } from '@/hooks/useArtistStudio';

/**
 * Stopping a release, and letting it go again (founder, 15 Sep 2026).
 *
 * An artist who changes their mind about a scheduled release, or wants a live
 * one down, stops it here. The records wait in the Studio as held, with every
 * file and detail kept, until the artist releases them now or at a new time.
 * When the record is one of several on a release, the artist chooses whether
 * that means this track or all of them.
 */

function localValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const BTN = 'inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60';

export function StopReleaseControl({ release, siblings }: { release: ArtistRelease; siblings: ArtistRelease[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'one' | 'all' | null>(null);
  const { stopRelease } = useReleaseActions();
  const scheduled = isScheduled(release);
  const group = siblings.filter((s) => s.status === 'published');
  const many = group.length > 1;

  const stop = async (which: 'one' | 'all') => {
    setBusy(which);
    try {
      const ids = which === 'all' ? group.map((s) => s.id) : [release.id];
      const n = await stopRelease(ids);
      toast.success(n === 1 ? `${release.title || 'That record'} is held back` : `${n} records are held back`, {
        description: 'Nothing goes out. Release them again from your Studio whenever you are ready.',
      });
      setOpen(false);
    } catch (err) {
      toast.error((err as Error)?.message || 'That did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${BTN} border border-border text-muted-foreground hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-500`}
      >
        <PauseCircle className="h-3.5 w-3.5" /> {scheduled ? 'Stop release' : 'Take it down'}
      </button>
      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {scheduled ? 'Stop this release?' : 'Take this down from SONGCHAINN?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {scheduled
                ? 'It will not go out at the time you set.'
                : 'It comes off SONGCHAINN straight away and the release notice to your followers is removed.'}{' '}
              It stays in your Studio, held back with its audio, artwork and details, and you can release it again now
              or at a new time whenever you like.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            {many && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void stop('all')}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-black disabled:opacity-60"
              >
                {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                Stop all {group.length} tracks on this release
              </button>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void stop('one')}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-60 ${
                many ? 'border border-border text-foreground hover:bg-muted' : 'bg-amber-500 text-black'
              }`}
            >
              {busy === 'one' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
              {many ? `Stop just ${release.title || 'this track'}` : scheduled ? 'Stop the release' : 'Take it down'}
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Keep it as it is</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function HeldReleaseControl({ release, siblings }: { release: ArtistRelease; siblings: ArtistRelease[] }) {
  const [open, setOpen] = useState<'now' | 'later' | null>(null);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(true);
  const [when, setWhen] = useState(() => localValue(new Date(Date.now() + 60 * 60_000)));
  const { releaseHeld } = useReleaseActions();
  const group = siblings.filter((s) => s.status === 'held');
  const many = group.length > 1;

  const go = async () => {
    const at = open === 'later' ? new Date(when) : null;
    if (open === 'later' && (!at || Number.isNaN(at.getTime()) || at.getTime() <= Date.now())) {
      toast.error('Pick a time that has not passed yet.');
      return;
    }
    setBusy(true);
    try {
      const ids = many && all ? group.map((s) => s.id) : [release.id];
      const n = await releaseHeld(ids, at);
      toast.success(
        at
          ? `${n === 1 ? 'Scheduled' : `${n} records scheduled`} for ${at.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
          : n === 1 ? `${release.title || 'Your record'} is live` : `${n} records are live`,
        { description: at ? 'Only you can see it until then, and your followers hear about it at that moment.' : 'Your followers are being told now.' },
      );
      setOpen(null);
    } catch (err) {
      toast.error((err as Error)?.message || 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen('now')} className={`${BTN} bg-primary text-primary-foreground hover:bg-primary/90`}>
        <Rocket className="h-3.5 w-3.5" /> Release now
      </button>
      <button type="button" onClick={() => setOpen('later')} className={`${BTN} border border-border text-foreground hover:bg-muted`}>
        <CalendarClock className="h-3.5 w-3.5" /> Schedule
      </button>
      <AlertDialog open={open !== null} onOpenChange={(o) => !busy && !o && setOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{open === 'later' ? 'Pick when it goes out' : 'Release it now?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {open === 'later'
                ? 'It stays yours alone until that moment, then goes public and your followers are told.'
                : 'It goes public straight away and your followers are told.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {open === 'later' && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date and time</span>
              <input
                type="datetime-local"
                value={when}
                min={localValue(new Date())}
                onChange={(e) => setWhen(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>
          )}
          {many && (
            <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4 accent-primary" />
              All {group.length} held tracks on this release
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Not yet</AlertDialogCancel>
            <button
              type="button"
              disabled={busy}
              onClick={() => void go()}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : open === 'later' ? <CalendarClock className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
              {open === 'later' ? 'Schedule it' : 'Release now'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
