import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Users, X, Loader2, ShieldCheck, Zap, Music2, Lock } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/battlezone/components/ui/sheet';
import { useBattleStanding, useBackCorner } from '@/battlezone/hooks/useBattleMarket';
import { battleMarketIsLive } from '@/battlezone/config';
import { toast } from 'sonner';
import { SONGS } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { getEthUsdPrice } from '@/lib/ethPrice';

/**
 * The Trading Ground, as it appears inside a live battle.
 *
 * Collapsed it is a tug of war along the bottom of the stage: who the room is
 * behind, counted in people. Opened it is the trading floor (founder, 15 Sep
 * 2026: "it's a trading ground and for music", not a wallet screen): two
 * corners face off with their records, the room's momentum between them, and
 * backing a corner is pick a side, pick a stake, one big button.
 *
 * Backing buys that song's coin into the backer's own wallet. Nothing is
 * pooled, nothing is taken back, and nobody loses money because a song lost.
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

/** Corner A wears the zone's neon green, corner B its cyan. */
const TONE = {
  a: {
    text: 'text-primary',
    ring: 'border-primary/60 shadow-[0_0_28px_hsl(var(--neon-green)/0.35)]',
    idle: 'border-primary/20',
    bg: 'bg-primary',
    fg: 'text-primary-foreground',
    glow: 'shadow-[0_0_22px_hsl(var(--neon-green)/0.45)]',
    wash: 'hsl(var(--neon-green) / 0.22)',
  },
  b: {
    text: 'text-secondary',
    ring: 'border-secondary/60 shadow-[0_0_28px_hsl(var(--cyan)/0.35)]',
    idle: 'border-secondary/20',
    bg: 'bg-secondary',
    fg: 'text-secondary-foreground',
    glow: 'shadow-[0_0_22px_hsl(var(--cyan)/0.45)]',
    wash: 'hsl(var(--cyan) / 0.22)',
  },
} as const;

function useEthUsdOnce() {
  const [usd, setUsd] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void getEthUsdPrice().then((v) => live && setUsd(v));
    return () => {
      live = false;
    };
  }, []);
  return usd;
}

export function TradingGround({
  battleId,
  cornerA,
  cornerB,
  walletAddress,
  userId,
  isOpen,
}: TradingGroundProps) {
  const [expanded, setExpanded] = useState(false);
  const [picked, setPicked] = useState<'a' | 'b' | null>(null);
  const [stake, setStake] = useState<(typeof STAKES)[number]>('0.005');
  const { data: standing } = useBattleStanding(battleId);
  const { backCorner, pending, status } = useBackCorner();
  const { songs: published } = usePublishedCatalog();
  const ethUsd = useEthUsdOnce();

  const covers = useMemo(() => {
    const byId = new Map<string, string | undefined>();
    for (const s of [...SONGS, ...published]) byId.set(String(s.id), s.coverImage);
    return byId;
  }, [published]);

  // Held shut until $WWAT is live and the market tables are applied. Showing a
  // board that cannot take a trade is worse than showing no board at all.
  if (!battleMarketIsLive()) return null;

  const backersA = standing?.backers_a ?? 0;
  const backersB = standing?.backers_b ?? 0;
  const total = backersA + backersB;
  const pctA = total === 0 ? 50 : Math.round((backersA / total) * 100);
  const leader = total === 0 ? null : backersA === backersB ? null : backersA > backersB ? cornerA : cornerB;

  const corners = [cornerA, cornerB];
  const chosen = picked ? (picked === 'a' ? cornerA : cornerB) : null;
  const stakeUsd = ethUsd ? Number(stake) * ethUsd : null;

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
      setPicked(null);
    } else if (result.recordFailed) {
      // Half of this worked and half of it did not, so it does not get a tick.
      // The coin is genuinely theirs, but they are not on the board.
      toast.error('You own the coin, but the board did not count it', {
        description: result.error,
      });
      setExpanded(false);
    } else {
      toast.error('That did not go through', { description: result.error });
    }
  };

  const Momentum = ({ thick = false }: { thick?: boolean }) => (
    <div className={`relative flex overflow-hidden rounded-full bg-muted ${thick ? 'h-3' : 'h-2'}`}>
      <div
        className="bg-primary shadow-[0_0_12px_hsl(var(--neon-green)/0.8)] transition-all duration-700"
        style={{ width: `${pctA}%` }}
      />
      <div className="flex-1 bg-secondary shadow-[0_0_12px_hsl(var(--cyan)/0.8)] transition-all duration-700" />
      <span
        aria-hidden="true"
        className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow-[0_0_8px_white] transition-all duration-700"
        style={{ left: `${pctA}%` }}
      />
    </div>
  );

  return (
    <>
      {/* The strip: a tug of war on the stage. */}
      <button
        onClick={() => setExpanded(true)}
        className="group relative w-full overflow-hidden rounded-2xl border border-primary/30 bg-card/80 px-4 py-3 text-left transition-all hover:border-primary/60 hover:shadow-[0_0_24px_hsl(var(--neon-green)/0.2)]"
        aria-label="Open the trading ground"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: 'linear-gradient(90deg, hsl(var(--neon-green) / 0.10), transparent 40%, transparent 60%, hsl(var(--cyan) / 0.10))' }}
        />
        <div className="relative flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-foreground">
            <TrendingUp className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            Trading ground
            {isOpen && (
              <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-1.5 py-0.5 text-[9px] font-bold text-live">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" /> OPEN
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow-[0_0_14px_hsl(var(--neon-green)/0.45)] transition-transform group-hover:scale-105">
            <Zap className="h-3 w-3" /> {isOpen ? 'Back a side' : 'See the board'}
          </span>
        </div>
        <div className="relative mt-3">
          <Momentum />
        </div>
        <div className="relative mt-1.5 flex justify-between gap-2 text-[11px]">
          <span className="truncate font-semibold text-primary">
            {cornerA.artistName} <span className="font-normal text-muted-foreground">· {backersA}</span>
          </span>
          <span className="truncate text-right font-semibold text-secondary">
            <span className="font-normal text-muted-foreground">{backersB} ·</span> {cornerB.artistName}
          </span>
        </div>
      </button>

      {/* The floor */}
      <Sheet open={expanded} onOpenChange={(o) => { setExpanded(o); if (!o) setPicked(null); }}>
        <SheetContent side="bottom" className="wavewarz-theme max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-primary/30 p-0 [&>button]:hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-64"
            style={{ background: 'radial-gradient(60% 100% at 25% 0%, hsl(var(--neon-green) / 0.18), transparent 70%), radial-gradient(60% 100% at 75% 0%, hsl(var(--cyan) / 0.18), transparent 70%)' }}
          />
          <div className="relative mx-auto w-full max-w-xl px-4 pb-6 pt-4 sm:px-6">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                  <TrendingUp className="h-3.5 w-3.5" /> Trading ground
                </p>
                <SheetTitle className="mt-1 font-display text-2xl font-black leading-tight text-foreground sm:text-3xl">
                  Back your corner
                </SheetTitle>
                <SheetDescription className="mt-1 text-sm text-muted-foreground">
                  Buy the song you believe in. It lands in your wallet and stays yours, win or lose.
                </SheetDescription>
              </div>
              <button
                onClick={() => setExpanded(false)}
                aria-label="Close the trading ground"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* The face-off */}
            <div className="relative mt-5 grid grid-cols-2 gap-3">
              {corners.map((corner) => {
                const t = TONE[corner.side];
                const backers = corner.side === 'a' ? backersA : backersB;
                const share = corner.side === 'a' ? pctA : 100 - pctA;
                const cover = covers.get(String(corner.songId));
                const selected = picked === corner.side;
                const canBack = !!corner.coinAddress && isOpen;
                return (
                  <button
                    key={corner.side}
                    type="button"
                    disabled={!canBack}
                    onClick={() => setPicked(corner.side)}
                    aria-pressed={selected}
                    className={`relative min-w-0 overflow-hidden rounded-2xl border-2 bg-card text-left transition-all ${
                      selected ? `${t.ring} scale-[1.02]` : `${t.idle} hover:border-current`
                    } ${canBack ? '' : 'opacity-80'}`}
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-muted">
                      {cover ? (
                        <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Music2 className={`h-10 w-10 ${t.text}`} />
                        </div>
                      )}
                      <div
                        aria-hidden="true"
                        className="absolute inset-0"
                        style={{ background: `linear-gradient(to top, hsl(var(--card)) 4%, transparent 55%), radial-gradient(90% 60% at 50% 100%, ${t.wash}, transparent)` }}
                      />
                      <span className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${t.bg} ${t.fg}`}>
                        Corner {corner.side.toUpperCase()}
                      </span>
                      {leader?.side === corner.side && (
                        <span className="absolute right-2 top-2 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-black uppercase text-accent-foreground">
                          Leading
                        </span>
                      )}
                    </div>
                    <div className="relative -mt-8 px-3 pb-3">
                      <p className={`truncate font-display text-base font-black ${t.text}`}>{corner.artistName}</p>
                      <p className="truncate text-xs text-muted-foreground">{corner.songTitle}</p>
                      <div className="mt-2 flex items-end justify-between gap-1">
                        <span>
                          <span className="block font-display text-2xl font-black leading-none tabular-nums text-foreground">{share}%</span>
                          <span className="text-[10px] text-muted-foreground">of the room</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Users className="h-3 w-3" /> {backers}
                        </span>
                      </div>
                      {!corner.coinAddress && (
                        <p className="mt-2 text-[10px] text-muted-foreground">No coin yet, cannot be backed.</p>
                      )}
                    </div>
                  </button>
                );
              })}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-[38%] flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-accent bg-background font-display text-sm font-black text-accent shadow-[0_0_20px_hsl(var(--gold)/0.5)]"
              >
                VS
              </span>
            </div>

            {/* The momentum */}
            <div className="mt-4">
              <Momentum thick />
              <p className="mt-1.5 text-center text-xs text-muted-foreground">
                {total === 0
                  ? 'Nobody has backed a side yet. Be the first.'
                  : leader
                    ? `${total} backing. The room is behind ${leader.artistName}.`
                    : `${total} backing. Dead level.`}
              </p>
            </div>

            {!isOpen ? (
              <p className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-foreground">
                <Lock className="h-4 w-4 text-muted-foreground" /> Backing is closed for this battle.
              </p>
            ) : (
              <div className="mt-5 rounded-2xl border border-border bg-card/70 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {chosen ? `Your stake on ${chosen.artistName}` : 'Tap a corner, then pick your stake'}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {STAKES.map((amount) => {
                    const on = stake === amount;
                    const tone = chosen ? TONE[chosen.side] : TONE.a;
                    return (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setStake(amount)}
                        aria-pressed={on}
                        className={`min-h-14 rounded-xl border-2 px-2 text-center transition-all ${
                          on ? `${tone.ring} bg-background` : 'border-border bg-background/40 hover:border-muted-foreground/40'
                        }`}
                      >
                        <span className="block font-mono text-sm font-bold text-foreground">{amount} ETH</span>
                        {ethUsd && (
                          <span className="block text-[10px] text-muted-foreground">
                            about ${(Number(amount) * ethUsd).toFixed(Number(amount) * ethUsd < 10 ? 2 : 0)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={!chosen || pending}
                  onClick={() => chosen && void handleBack(chosen, stake)}
                  className={`mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 font-display text-base font-black uppercase tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    chosen ? `${TONE[chosen.side].bg} ${TONE[chosen.side].fg} ${TONE[chosen.side].glow}` : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> {status || 'Working'}
                    </>
                  ) : chosen ? (
                    <>
                      <Zap className="h-5 w-5 shrink-0" /> <span className="truncate">Back {chosen.artistName}</span>
                      {stakeUsd ? <span className="hidden font-sans text-xs font-bold normal-case opacity-80 sm:inline">(about ${stakeUsd.toFixed(2)})</span> : null}
                    </>
                  ) : (
                    'Pick a corner'
                  )}
                </button>
                {!walletAddress && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">You will be asked to connect your wallet.</p>
                )}
              </div>
            )}

            {status && !pending && <p className="mt-3 text-center text-sm text-muted-foreground">{status}</p>}

            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              Backing buys the artist's song coin from your own wallet, and every buy pays the artist.
              SONGCHAINN never holds it and never takes it back. What the room backs counts toward the
              verdict, alongside the judges and the poll.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
