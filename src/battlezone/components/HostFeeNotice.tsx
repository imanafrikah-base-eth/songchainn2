import { Ticket } from 'lucide-react';
import { HOST_FEE_USD, HOST_FEE_SPLIT_BPS } from '@/battlezone/lib/battleMarket';
import { HOST_FEE_ENABLED, HOST_FEE_MAX_TOKENS } from '@/battlezone/config';

/**
 * What hosting a battle costs, said before the host commits to anything.
 *
 * There is no free battle. A room that costs nothing to open is a room nobody
 * has to mean, and the zone fills up with empty scheduled battles that never
 * happen. The fee is small enough not to be a barrier and real enough to be a
 * decision.
 *
 * The artists' share is stated here rather than buried, because a host putting
 * money in deserves to know most of it reaches the musicians they picked.
 */
export function HostFeeNotice() {
  if (!HOST_FEE_ENABLED) return null;

  const artistPct = Number(HOST_FEE_SPLIT_BPS.artists) / 100;

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card/60 p-4">
      <Ticket className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="text-sm">
        {/* Saying "$1" while charging a penny is still the interface getting
            its own price wrong, and it makes hosting sound dearer than it is.
            The ceiling is a fixed number of tokens, so stating it cannot go
            stale the way a converted figure would. */}
        <p className="font-medium">
          Hosting a battle costs ${HOST_FEE_USD} in $WWAT, and never more than{' '}
          {HOST_FEE_MAX_TOKENS.toLocaleString('en-US')} $WWAT.
        </p>
        <p className="mt-1 text-muted-foreground">
          While $WWAT is this cheap the cap is what you actually pay, which is a few cents. When
          $WWAT is worth more, the ${HOST_FEE_USD} is what you pay instead. It changes by itself.
        </p>
        <p className="mt-1 text-muted-foreground">
          {artistPct}% of it goes straight to the artists whose songs you picked, paid from
          your wallet to theirs, so it never passes through us. The rest goes to the pot the
          winning side's backers share when the battle ends. You pay when you launch, and if
          an artist has no payout wallet on file yet you are not charged at all.
        </p>
      </div>
    </div>
  );
}
