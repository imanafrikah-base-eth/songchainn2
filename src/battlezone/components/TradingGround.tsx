import { useState } from 'react';
import { TrendingUp, Users, X, Loader2 } from 'lucide-react';
import { Button } from '@/battlezone/components/ui/button';
import { Sheet, SheetContent } from '@/battlezone/components/ui/sheet';
import { useBattleStanding, useBackCorner } from '@/battlezone/hooks/useBattleMarket';
import { battleMarketIsLive } from '@/battlezone/config';
import { toast } from 'sonner';

/**
 * The Trading Ground, as it appears inside a live battle.
 *
 * Collapsed it is one slim strip along the bottom showing who the room is
 * behind. Tapped, it opens into the full board where a listener can put
 * something behind the corner they believe in.
 *
 * The strip is deliberately quiet. A battle is a listening experience first,
 * and a market that shouts over the music is a market nobody enjoys.
 */

interface Corner {
  side: 'a' | 'b';
  artistName: string;
  songTitle: string;
  songId: string;
  /** Null when this song has no live coin, in which case it cannot be backed. */
  coinAddress: string | null;
}

interface TradingGroundProps {
  battleId: string;
  cornerA: Corner;
  cornerB: Corner;
  walletAddress: string | null;
  userId: string | null;
  /** Backing closes when the battle does. */
  isOpen: boolean;
}

/** The amounts offered. Small, so backing a corner stays a bit of fun. */
const STAKES = ['0.001', '0.005', '0.01'] as const;

export function TradingGround({
  battleId,
  cornerA,
  cornerB,
  walletAddress,
  userId,
  isOpen,
}: TradingGroundProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: standing } = useBattleStanding(battleId);
  const { backCorner, pending, status } = useBackCorner();

  // Held shut until $WWAT is live and the market tables are applied. Showing a
  // board that cannot take a trade is worse than showing no board at all.
  if (!battleMarketIsLive()) return null;

  const backersA = standing?.backers_a ?? 0;
  const backersB = standing?.backers_b ?? 0;
  const total = backersA + backersB;
  const pctA = total === 0 ? 50 : Math.round((backersA / total) * 100);

  const handleBack = async (corner: Corner, ethAmount: string) => {
    if (!walletAddress || !userId) {
      toast.error('Connect your wallet first', {
        description: 'Backing a corner buys the song, so it goes to your own wallet.',
      });
      return;
    }
    if (!corner.coinAddress) {
      toast.error('This song has no coin yet', {
        description: 'Only songs with a live coin can be backed.',
      });
      return;
    }

    const result = await backCorner({
      battleId,
      side: corner.side,
      songId: corner.songId,
      coinAddress: corner.coinAddress,
      ethAmount,
      walletAddress,
      userId,
    });

    if (result.success && !result.recordFailed) {
      toast.success(`You are behind ${corner.artistName}`, {
        description: 'The song is yours to keep, however this battle ends.',
      });
      setExpanded(false);
    } else if (result.recordFailed) {
      // Half of this worked and half of it did not, so it does not get a tick.
      // The coin is genuinely theirs, but they are not on the board, and this
      // used to be a success toast that said "The song is yours" and left them
      // believing they were counted.
      toast.error('You own the coin, but the board did not count it', {
        description: result.error,
      });
      setExpanded(false);
    } else {
      toast.error('That did not go through', { description: result.error });
    }
  };

  return (
    <>
      {/* The strip */}
      <button
        onClick={() => setExpanded(true)}
        className="w-full rounded-xl border border-border bg-card/80 px-4 py-3 text-left transition-colors hover:bg-card"
        aria-label="Open the trading ground"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4 shrink-0" aria-hidden="true" />
            Trading ground
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {total === 0 ? 'Nobody has backed a side yet' : `${total} backing a side`}
          </span>
        </div>

        {/* Who the room is behind. Counts people, not money. */}
        <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="bg-primary transition-all" style={{ width: `${pctA}%` }} />
          <div className="flex-1 bg-destructive transition-all" />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
          <span className="truncate pr-2">{cornerA.artistName}</span>
          <span className="truncate pl-2">{cornerB.artistName}</span>
        </div>
      </button>

      {/* The board */}
      <Sheet open={expanded} onOpenChange={setExpanded}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Trading ground</h2>
              <button
                onClick={() => setExpanded(false)}
                aria-label="Close the trading ground"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted min-h-11 min-w-11 inline-flex items-center justify-center"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="mb-4 text-sm text-muted-foreground">
              Back the corner you believe in and the song lands in your wallet. You keep it
              whichever way the battle goes. What the room backs counts toward the verdict,
              alongside the judges and the poll.
            </p>

            {!isOpen && (
              <p className="mb-4 rounded-lg bg-muted p-3 text-sm">
                This battle has ended, so backing is closed.
              </p>
            )}

            <div className="grid gap-3">
              {[cornerA, cornerB].map((corner) => {
                const backers = corner.side === 'a' ? backersA : backersB;
                return (
                  <div key={corner.side} className="rounded-xl border border-border p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{corner.artistName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {backers === 1 ? '1 backer' : `${backers} backers`}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {corner.songTitle}
                    </p>

                    {corner.coinAddress ? (
                      <div className="mt-3 flex gap-2">
                        {STAKES.map((amount) => (
                          <Button
                            key={amount}
                            size="sm"
                            variant="outline"
                            disabled={pending || !isOpen}
                            onClick={() => void handleBack(corner, amount)}
                            className="flex-1"
                          >
                            {pending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              `${amount} ETH`
                            )}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        This song has no coin yet, so it cannot be backed.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {status && (
              <p className="mt-3 text-center text-sm text-muted-foreground">{status}</p>
            )}

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Backing buys the artist's song coin from your own wallet. SONGCHAINN never holds
              it and never takes it back. Nobody's money moves to anyone else because a song
              lost.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
