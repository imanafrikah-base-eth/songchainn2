import { useEffect, useState } from 'react';
import { Timer, Hourglass } from 'lucide-react';
import { formatCountdown } from '@/battlezone/lib/battleStages';

/**
 * How long is left before the poll and the trading ground close.
 *
 * Counts to a timestamp the row carries, not to a duration this device started
 * measuring, so everybody in the room sees the same number however long ago
 * their page loaded. A countdown that drifts per viewer is worse than none: two
 * people would disagree about whether voting was still open.
 *
 * WHAT THIS DOES AND DOES NOT CLAIM
 * The battle is given a length when it opens. That length is ours, not a
 * measurement of the songs: nothing in the catalogue carries a duration yet, so
 * a line reading "music plays for 6:12" would be a made-up number presented as
 * a fact. This counts down the battle's own clock instead, which is true
 * because we set it.
 *
 * Two tones, and the difference matters to the person watching. For most of the
 * battle there is no pressure. In the closing stretch there is a real deadline,
 * so it says so.
 */
export function BattleCountdown({
  musicEndsAt,
  closesAt,
  onClosed,
}: {
  /** ISO timestamp where the relaxed stretch ends and the last call begins. */
  musicEndsAt: string | null;
  /** ISO timestamp when the poll and the trading ground both close. */
  closesAt: string | null;
  onClosed?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const close = closesAt ? new Date(closesAt).getTime() : null;
  const lastCallFrom = musicEndsAt ? new Date(musicEndsAt).getTime() : null;

  // Fire once, when it actually closes.
  const closed = close != null && Number.isFinite(close) && now >= close;
  useEffect(() => {
    if (closed) onClosed?.();
  }, [closed, onClosed]);

  // A battle that was never given a clock says nothing rather than guessing.
  if (close == null || !Number.isFinite(close)) return null;

  if (closed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
        <Timer className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">Voting and backing are closed.</span>
      </div>
    );
  }

  const lastCall = lastCallFrom != null && Number.isFinite(lastCallFrom) && now >= lastCallFrom;
  const seconds = Math.max(0, Math.round((close - now) / 1000));

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
        lastCall ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
      }`}
      // Announced politely so a screen reader is not interrupted every second.
      aria-live="polite"
    >
      {lastCall ? (
        <Timer className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      ) : (
        <Hourglass className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="text-muted-foreground">
        {lastCall ? 'Last call, voting closes in' : 'Voting closes in'}
      </span>
      <span className="font-semibold tabular-nums text-foreground">{formatCountdown(seconds)}</span>
    </div>
  );
}
