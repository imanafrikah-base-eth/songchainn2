/**
 * The Trading Ground: the money and the maths behind a battle.
 *
 * Everything in this file is a pure function over numbers. Nothing here touches
 * a wallet, a chain or the database, which is deliberate: the rules that decide
 * who won and who gets paid should be readable in one sitting and testable
 * without a network.
 *
 * ---------------------------------------------------------------------------
 * THE DESIGN, AND WHY IT IS THIS SHAPE
 * ---------------------------------------------------------------------------
 * A backer buys the song coin of the side they believe in, from their own
 * wallet, straight to Zora. SONGCHAINN never holds it.
 *
 * THEY KEEP THAT COIN WHETHER THEY WIN OR LOSE. It is a real asset with a
 * resale market already built into this app, not a stake on a table. Nobody's
 * money is ever moved to somebody else because their song lost, which is the
 * single line that separates backing an artist from betting on a result.
 *
 * So the prize pool is not made of anybody's principal. It is made of fees, and
 * only fees. The genuine upside for a winning backer is the coin they are
 * already holding, which the whole room just bought into.
 *
 * And the artists do not need a slice of a pool carved out for them, because
 * every single backing trade is a real purchase of their song coin, and Zora
 * routes the creator fee on that trade to the artist's own payout address
 * automatically, on chain, with no code from us. A busy battle pays its two
 * artists continuously while it runs.
 */

import { TREASURY_ADDRESS } from '@/lib/onchain';

/** Where SONGCHAINN's share of every host fee is sent. Verified on Base. */
export const BATTLE_TREASURY = TREASURY_ADDRESS;

/** Basis points, so every share below is exact integer maths. 10,000 = 100%. */
const BPS = 10_000n;

// ---------------------------------------------------------------------------
// The host fee
// ---------------------------------------------------------------------------

/**
 * What it costs to put a battle on. There is no free battle: a battle that
 * costs nothing to start is a battle nobody has to mean, and the room fills
 * with abandoned rooms nobody shows up to.
 */
export const HOST_FEE_USD = 1;

/**
 * Where the host fee goes. These are the only four destinations and they sum
 * to exactly 100%, which `assertSplitIsWhole` below proves at module load.
 */
export const HOST_FEE_SPLIT_BPS = {
  /** Split evenly between the artists whose songs were used. */
  artists: 4_000n,
  /** Shared out among the winning side's backers when the battle ends. */
  winners: 4_000n,
  /**
   * Back to the host, but only if the battle was worth hosting.
   *
   * READ THIS BEFORE PROMISING ANYBODY THEY WILL EARN FROM HOSTING. A single
   * one dollar fee cannot meaningfully pay a host out of itself: fifteen cents
   * of their own dollar back is a rebate, not an income, and calling it earning
   * would be the kind of claim this app keeps having to walk back.
   *
   * The honest way to pay hosts is a share of the TRADING their battle causes,
   * because that scales with how good the battle was and costs nobody their
   * stake. That money exists: it is Zora's trade referral, which pays whoever
   * routes a trade. SONGCHAINN cannot claim it yet, because TradeParameters in
   * coins-sdk 0.7.1 has no referrer field at all (see src/lib/zoraTrading.ts).
   * Upgrade that, and a real host share becomes possible.
   *
   * Until then this is what it says on the tin: a rebate that makes a busy
   * battle cheaper to have run, and nothing is claimed beyond that.
   */
  host: 1_500n,
  /** Running costs. */
  treasury: 500n,
} as const;

function assertSplitIsWhole() {
  const total =
    HOST_FEE_SPLIT_BPS.artists +
    HOST_FEE_SPLIT_BPS.winners +
    HOST_FEE_SPLIT_BPS.host +
    HOST_FEE_SPLIT_BPS.treasury;
  if (total !== BPS) {
    throw new Error(`Host fee split must total 100%, got ${(Number(total) / 100).toFixed(2)}%`);
  }
}
assertSplitIsWhole();

/**
 * Where SONGCHAINN's own share is paid: the wallet behind the @songchainn Zora
 * profile, which is also where the catalogue's creator coin lives. Verified on
 * Base on 1 Sep 2026. Kept here rather than in a config file so a fee can never
 * be collected to an address nobody checked.
 */
export const SONGCHAINN_PAYOUT = '0xbbb71df935ac501ca9ea8afdcfa7ab09ba898ac6';

export interface HostFeeSplit {
  artists: bigint;
  winners: bigint;
  host: bigint;
  treasury: bigint;
}

/**
 * Split a paid host fee three ways, in the token's smallest unit.
 *
 * The remainder from integer division is given to the artists rather than
 * dropped, so the three parts always add back up to exactly what was paid and
 * no dust is ever stranded.
 */
export function splitHostFee(amountRaw: bigint): HostFeeSplit {
  if (amountRaw <= 0n) return { artists: 0n, winners: 0n, host: 0n, treasury: 0n };

  const winners = (amountRaw * HOST_FEE_SPLIT_BPS.winners) / BPS;
  const host = (amountRaw * HOST_FEE_SPLIT_BPS.host) / BPS;
  const treasury = (amountRaw * HOST_FEE_SPLIT_BPS.treasury) / BPS;
  // The artists absorb the rounding remainder, so the four parts always add
  // back to exactly what was paid and no dust is stranded.
  const artists = amountRaw - winners - host - treasury;

  return { artists, winners, host, treasury };
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/**
 * How much each voice is worth in the final verdict.
 *
 * The trading ground is deliberately the SMALLEST of the three. Money should be
 * able to influence a battle and never decide one. At 20% a side that is losing
 * with both the judges and the room cannot buy the result, which keeps the
 * trading ground fun instead of turning the battle into an auction.
 */
export const VERDICT_WEIGHTS = {
  judges: 0.5,
  poll: 0.3,
  trades: 0.2,
} as const;

export interface VerdictInput {
  /** Combined AI judge points for each side. */
  judgesA: number;
  judgesB: number;
  /** Public poll votes for each side. */
  pollA: number;
  pollB: number;
  /**
   * DISTINCT BACKERS on each side. Not volume, and not the number of trades.
   *
   * Scoring by money spent would hand the verdict to the largest wallet in the
   * room: one buy, battle over. Counting people means a side wins this
   * component by convincing more of the room, which is the thing a battle is
   * supposed to measure. Volume is still shown on screen, it just does not vote.
   */
  backersA: number;
  backersB: number;
}

export interface VerdictResult {
  shareA: number;
  shareB: number;
  winner: 'a' | 'b' | 'tie';
  components: {
    judges: { a: number; b: number };
    poll: { a: number; b: number };
    trades: { a: number; b: number };
  };
}

/**
 * Turn one component into each side's share of it, 0 to 1.
 * A component nobody engaged with splits evenly and therefore moves nothing.
 */
function share(a: number, b: number): { a: number; b: number } {
  const safeA = Number.isFinite(a) && a > 0 ? a : 0;
  const safeB = Number.isFinite(b) && b > 0 ? b : 0;
  const total = safeA + safeB;
  if (total === 0) return { a: 0.5, b: 0.5 };
  return { a: safeA / total, b: safeB / total };
}

/** Score a battle across all three voices. */
export function scoreVerdict(input: VerdictInput): VerdictResult {
  const judges = share(input.judgesA, input.judgesB);
  const poll = share(input.pollA, input.pollB);
  const trades = share(input.backersA, input.backersB);

  const shareA =
    judges.a * VERDICT_WEIGHTS.judges +
    poll.a * VERDICT_WEIGHTS.poll +
    trades.a * VERDICT_WEIGHTS.trades;
  const shareB =
    judges.b * VERDICT_WEIGHTS.judges +
    poll.b * VERDICT_WEIGHTS.poll +
    trades.b * VERDICT_WEIGHTS.trades;

  let winner: 'a' | 'b' | 'tie' = 'tie';
  // A hair of tolerance, so floating point noise never invents a winner.
  if (Math.abs(shareA - shareB) > 1e-9) winner = shareA > shareB ? 'a' : 'b';

  return { shareA, shareB, winner, components: { judges, poll, trades } };
}

// ---------------------------------------------------------------------------
// Paying the winners
// ---------------------------------------------------------------------------

export interface BackerStake {
  userId: string;
  walletAddress: string;
  /** What they spent backing the winning side, in wei. */
  spentWei: bigint;
}

export interface Payout {
  userId: string;
  walletAddress: string;
  amountRaw: bigint;
}

/**
 * Share the winners' portion of the host fee among the winning side's backers,
 * in proportion to what each of them put behind it.
 *
 * Two properties this function guarantees, both of them safety rather than
 * politeness:
 *
 *   1. THE PAYOUTS NEVER SUM TO MORE THAN THE POOL. Every share is floored, and
 *      whatever rounding is left over stays behind rather than being handed to
 *      anyone. A distribution can never be asked to pay out money that was
 *      never collected.
 *   2. Nobody who put in nothing takes anything out.
 */
export function splitWinnersPool(poolRaw: bigint, backers: BackerStake[]): Payout[] {
  if (poolRaw <= 0n) return [];

  const paying = backers.filter((b) => b.spentWei > 0n);
  const totalStake = paying.reduce((sum, b) => sum + b.spentWei, 0n);
  if (totalStake === 0n) return [];

  const payouts = paying.map((b) => ({
    userId: b.userId,
    walletAddress: b.walletAddress,
    // Floor division on purpose. See guarantee 1 above.
    amountRaw: (poolRaw * b.spentWei) / totalStake,
  }));

  return payouts.filter((p) => p.amountRaw > 0n);
}

/**
 * The safety net, to be called before any distribution is signed.
 *
 * Returns the reason it is unsafe, or null when it is safe to send. Refusing to
 * sign is always cheaper than clawing money back afterwards, and this is the
 * last point at which refusing is still free.
 */
export function checkDistributionIsSafe(poolRaw: bigint, payouts: Payout[]): string | null {
  if (payouts.some((p) => p.amountRaw < 0n)) {
    return 'A payout is negative.';
  }
  const total = payouts.reduce((sum, p) => sum + p.amountRaw, 0n);
  if (total > poolRaw) {
    return `Payouts total ${total} but the pool only holds ${poolRaw}.`;
  }
  const wallets = payouts.map((p) => p.walletAddress.toLowerCase());
  if (new Set(wallets).size !== wallets.length) {
    return 'The same wallet appears more than once.';
  }
  return null;
}
