import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Wrench } from 'lucide-react';

/**
 * The upload, as something worth watching.
 *
 * A big number that climbs smoothly (never jumps), a bar that fills under it,
 * and the stage in words: getting ready, sending, the judges, then the
 * verdict. The number is tweened towards the real progress on every frame,
 * so a burst of bytes reads as a glide rather than a stutter, and it never
 * sits still: while the judges listen it breathes at 100.
 */
export function UploadProgress({
  phase,
  progress,
  passed,
  compact = false,
}: {
  phase: 'queued' | 'preparing' | 'uploading' | 'auditioning' | 'done' | 'error';
  progress: number;
  passed?: boolean;
  compact?: boolean;
}) {
  const target = phase === 'preparing' ? 2 : phase === 'uploading' ? Math.max(2, progress) : phase === 'queued' ? 0 : 100;
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const step = () => {
      const cur = shownRef.current;
      const next = Math.abs(target - cur) < 0.15 ? target : cur + (target - cur) * 0.12;
      shownRef.current = next;
      setShown(next);
      if (next !== target) frame.current = requestAnimationFrame(step);
      else frame.current = null;
    };
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(step);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [target]);

  const judging = phase === 'auditioning';
  const label =
    phase === 'queued' ? 'Waiting its turn'
    : phase === 'preparing' ? 'Getting things ready'
    : phase === 'uploading' ? 'Sending your track'
    : judging ? 'The judges are listening'
    : phase === 'done' ? (passed ? 'Live' : 'In the workshop')
    : 'Stopped';

  if (phase === 'done') {
    return (
      <div className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'} font-semibold ${passed ? 'text-primary' : 'text-amber-500'}`}>
        {passed ? <CheckCircle2 className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
        {label}
      </div>
    );
  }

  return (
    <div className={compact ? 'mt-1' : 'mt-2'} aria-live="polite">
      <div className="flex items-end justify-between gap-3">
        <span className={`${compact ? 'text-xs' : 'text-sm'} text-foreground`}>{label}</span>
        <span className={`font-heading tabular-nums leading-none text-primary ${compact ? 'text-xl' : 'text-3xl'} ${judging ? 'animate-pulse' : ''}`}>
          {Math.round(shown)}<span className="text-sm">%</span>
        </span>
      </div>
      <div className={`relative mt-1.5 w-full overflow-hidden rounded-full bg-muted ${compact ? 'h-1.5' : 'h-2'}`}>
        <div
          className={`h-full rounded-full bg-primary ${judging ? 'animate-pulse' : ''}`}
          style={{ width: `${shown}%`, transition: 'width 120ms linear' }}
        />
        {phase === 'uploading' && (
          <div className="pointer-events-none absolute inset-y-0 w-16 -translate-x-full animate-[shimmer_1.4s_linear_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" style={{ left: `${shown}%` }} />
        )}
      </div>
    </div>
  );
}
