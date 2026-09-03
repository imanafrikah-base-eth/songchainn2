import { Ticket } from 'lucide-react';
import { HOST_FEE_USD, HOST_FEE_SPLIT_BPS } from '@/battlezone/lib/battleMarket';
import { battleMarketIsLive } from '@/battlezone/config';

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
  if (!battleMarketIsLive()) return null;

  const artistPct = Number(HOST_FEE_SPLIT_BPS.artists) / 100;

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card/60 p-4">
      <Ticket className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="text-sm">
        <p className="font-medium">
          Hosting a battle costs ${HOST_FEE_USD}, paid in $WWAT.
        </p>
        <p className="mt-1 text-muted-foreground">
          {artistPct}% of it goes straight to the artists whose songs you picked. The rest
          goes to the pot the winning side's backers share when the battle ends. You pay
          from your own wallet when you launch.
        </p>
      </div>
    </div>
  );
}
