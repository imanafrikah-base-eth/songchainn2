import { TrendingUp, TrendingDown, Disc3 } from 'lucide-react';
import { useSongCopies } from '@/hooks/useSongCopies';

/**
 * What you own of one song, said the way a person would say it.
 *
 * A dollar buys one digital copy. From the moment it clears, that copy is worth
 * whatever the song's coin is worth, so the next person in pays a little more
 * than you did. This is the line that makes that real: how many copies, what you
 * paid, what they are worth now, and the difference between the two.
 *
 * When the current value cannot be had honestly, because there is no wallet
 * connected or the quote did not come back, it says nothing about value rather
 * than guessing. A wrong number next to somebody's money is worse than no number.
 */
export function CopyPosition({
  songId, coinAddress, balance, walletAddress,
}: {
  songId: string;
  coinAddress?: string | null;
  balance?: bigint;
  walletAddress?: string | null;
}) {
  const { copies, usdPaid, usdNow, changePct, isLoading } = useSongCopies(
    songId, coinAddress, balance, walletAddress,
  );

  /*
   * What you hold decides this, not what you once bought.
   *
   * This used to render from the purchase receipt alone, so somebody who had
   * sold their whole position still saw "You own 1 copy". Telling a person they
   * own something they do not own is worse than telling them nothing. The
   * receipt is only ever used for the "paid" figure now.
   */
  const holdsNow = !!balance && balance > BigInt(0);
  if (isLoading || !holdsNow || copies <= 0) return null;

  const up = changePct !== null && changePct >= 0;
  const copyWord = copies === 1 ? 'copy' : 'copies';
  const money = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`;

  return (
    <div className="rounded-xl border border-border bg-background/40 px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        <Disc3 size={13} className="text-primary shrink-0" />
        <p className="text-xs font-semibold text-foreground">
          You own {copies % 1 === 0 ? copies : copies.toFixed(2)} {copyWord}
        </p>
      </div>

      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">
          Paid {money(usdPaid)}
        </span>
        {usdNow !== null ? (
          <span className="flex items-center gap-1 tabular-nums">
            <span className="text-foreground font-semibold">worth {money(usdNow)}</span>
            {changePct !== null && (
              <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
                {up ? <TrendingUp size={11} className="inline" /> : <TrendingDown size={11} className="inline" />}
                {' '}{up ? '+' : ''}{changePct.toFixed(0)}%
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">value follows the coin</span>
        )}
      </div>

      {/*
        A green percentage next to somebody's money needs the other half of the
        sentence sitting beside it, not buried in the terms.
      */}
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
        The price moves. This can be worth less than you paid.
      </p>
    </div>
  );
}
