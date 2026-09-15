import { Ticket } from 'lucide-react';
import { HOST_FEE_USD, HOST_FEE_SPLIT_BPS } from '@/battlezone/lib/battleMarket';
import { HOST_FEE_ENABLED, HOST_FEE_MAX_TOKENS } from '@/battlezone/config';
import { useWwatFee } from '@/battlezone/hooks/useWwatFee';

/**
 * What hosting a battle costs, said before the host commits to anything.
 *
 * There is no free battle. A room that costs nothing to open is a room nobody
 * has to mean, and the zone fills up with empty scheduled battles that never
 * happen. The fee is small enough not to be a barrier and real enough to be a
 * decision.
 *
 * It leads with what the host actually pays today (founder, 15 Sep 2026). While
 * $WWAT is cheap the token ceiling is the price, about a penny, so opening with
 * "$1" overstated hosting a hundred times over. The dollar price is only
 * mentioned as what it becomes once $WWAT is worth more.
 *
 * The artists' share is stated here rather than buried, because a host putting
 * money in deserves to know most of it reaches the musicians they picked.
 */
export function HostFeeNotice() {
  const fee = useWwatFee(HOST_FEE_USD, HOST_FEE_MAX_TOKENS);
  if (!HOST_FEE_ENABLED) return null;

  const artistPct = Number(HOST_FEE_SPLIT_BPS.artists) / 100;

  return (
    <div className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <Ticket className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="text-sm">
        <p className="font-semibold text-foreground">
          Hosting this battle costs {fee.words}: {fee.tokens.toLocaleString('en-US')} $WWAT.
        </p>
        <p className="mt-1 text-muted-foreground">
          {artistPct}% goes straight from your wallet to the artists whose songs you picked. The
          rest goes to the pot the winning side's backers share. You pay when you launch, and if an
          artist has no payout wallet on file yet you are not charged at all.
        </p>
        <p className="mt-1 text-xs text-muted-foreground/80">
          {fee.capped
            ? `$WWAT is young, so hosting is capped at ${HOST_FEE_MAX_TOKENS.toLocaleString('en-US')} $WWAT. Once $WWAT is worth more, it settles at $${HOST_FEE_USD} by itself.`
            : `That is $${HOST_FEE_USD} in $WWAT at today's price.`}
        </p>
      </div>
    </div>
  );
}
