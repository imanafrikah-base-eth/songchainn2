/**
 * The two places a battle can happen, and the clock they both run on.
 *
 * ---------------------------------------------------------------------------
 * WHY "OPEN MIC" AND "MAIN STAGE", AND NOT "DEMO" AND "REAL"
 * ---------------------------------------------------------------------------
 * A thing called a demo is a thing nobody respects. Calling the free version a
 * demo or a test tells a first-time host that what they are about to do does
 * not count, which is the opposite of what it is for: it is where somebody
 * learns to run a battle before money is involved.
 *
 * An open mic is not a lesser gig. It is free, anyone can get up, nobody pays
 * to be there, and it is understood everywhere in music as the room you prove
 * yourself in before the main stage. Nobody thinks an open mic is broken, and
 * nobody thinks it is the same as headlining. That is exactly the distinction
 * we need, and it comes for free with the words.
 */

export type BattleStage = 'open_mic' | 'main_stage';

export interface StageRules {
  key: BattleStage;
  name: string;
  tagline: string;
  /** What it costs to host. Open Mic is paid for in points, not money. */
  costLabel: string;
  /** Whether the trading ground appears at all. */
  tradingEnabled: boolean;
  /** Whether anything here can pay out real value. */
  realValue: boolean;
  /** Whether a host may run a multi-song community battle. */
  communityBattles: boolean;
  /** Points it costs an Open Mic host. Ignored on the Main Stage. */
  pointsCost: number;
}

export const STAGES: Record<BattleStage, StageRules> = {
  open_mic: {
    key: 'open_mic',
    name: 'Open Mic',
    tagline: 'Free to host, judged for real, no money anywhere near it.',
    costLabel: 'Free, costs points',
    tradingEnabled: false,
    realValue: false,
    communityBattles: true,
    // High enough to mean something, low enough that anyone who actually uses
    // the app has them. A host who has never listened to anything cannot spam
    // the zone with empty rooms.
    pointsCost: 500,
  },
  main_stage: {
    key: 'main_stage',
    name: 'Main Stage',
    tagline: 'The real thing. Backers, payouts, and a verdict that pays artists.',
    costLabel: '$1 in $WWAT',
    tradingEnabled: true,
    realValue: true,
    communityBattles: true,
    pointsCost: 0,
  },
};

/**
 * What the Open Mic deliberately does NOT have, said plainly.
 *
 * Written once, here, because a person choosing between the two should be told
 * the difference in the same words everywhere they meet it. A free tier that
 * hides what it is missing is how you get somebody discovering it at the worst
 * possible moment.
 */
export const OPEN_MIC_LIMITS = [
  'No backing and no trading. Nothing here is worth money.',
  'Nobody gets paid, including the artists.',
  'The judges and the public poll still decide it, exactly as they do on the Main Stage.',
] as const;

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/**
 * A battle is given a length when it opens, and then a little longer.
 *
 * Each song gets a slot. While the slots run everything is open. After the last
 * one there is a short window where the poll and the trading ground stay open,
 * so somebody who was listening rather than tapping is not shut out by a
 * second. Then both close together, and the verdict is read.
 *
 * They close TOGETHER on purpose. If voting closed before backing, the last
 * backers would be buying into a result nobody could still influence, which is
 * the shape of a trap rather than a game.
 *
 * A SLOT IS NOT A MEASUREMENT. Nothing in the catalogue carries a duration yet,
 * on either side of the wire, so the slot below is the length WE give a song,
 * not the length the song is. That is why nothing on screen says "the music
 * plays for" a number: the countdown is honest about being the battle's own
 * clock. Once real durations exist, pass them in and the slot stops being used.
 */

/** The window after the last slot. Long enough to decide, short enough to keep the room. */
export const CLOSING_WINDOW_SECONDS = 90;

export interface BattleClock {
  /** Total seconds of slot time in the battle. */
  musicSeconds: number;
  /** When the last slot ends, relative to the start. This is where last call begins. */
  musicEndsAt: number;
  /** When the poll and the trading ground both close. */
  closesAt: number;
  totalSeconds: number;
}

/**
 * Work out the shape of a battle from the songs in it.
 *
 * A song with no known duration gets the standard slot rather than counting as
 * zero, because a battle that thinks it has no music would close the instant it
 * opened. Today that is every song, so in practice a quick battle runs two
 * slots and a community battle six.
 */
const FALLBACK_SONG_SECONDS = 210;

export function buildClock(songDurations: (number | null | undefined)[]): BattleClock {
  const musicSeconds = songDurations.reduce<number>((total, d) => {
    const secs = typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : FALLBACK_SONG_SECONDS;
    return total + secs;
  }, 0);

  return {
    musicSeconds,
    musicEndsAt: musicSeconds,
    closesAt: musicSeconds + CLOSING_WINDOW_SECONDS,
    totalSeconds: musicSeconds + CLOSING_WINDOW_SECONDS,
  };
}

export type BattlePhase = 'playing' | 'closing' | 'ended';

/** Where a battle is right now, given when it started. */
export function phaseAt(clock: BattleClock, startedAtMs: number, nowMs = Date.now()): BattlePhase {
  const elapsed = (nowMs - startedAtMs) / 1000;
  if (elapsed < clock.musicEndsAt) return 'playing';
  if (elapsed < clock.closesAt) return 'closing';
  return 'ended';
}

/** Seconds left before voting and backing close. Never negative. */
export function secondsUntilClose(clock: BattleClock, startedAtMs: number, nowMs = Date.now()): number {
  const elapsed = (nowMs - startedAtMs) / 1000;
  return Math.max(0, Math.round(clock.closesAt - elapsed));
}

/** Whether the poll and the trading ground are still taking input. */
export function isOpenForInput(
  stage: BattleStage,
  clock: BattleClock,
  startedAtMs: number,
  nowMs = Date.now(),
): { poll: boolean; trading: boolean } {
  const open = phaseAt(clock, startedAtMs, nowMs) !== 'ended';
  return {
    poll: open,
    // Trading is closed on the Open Mic whatever the clock says.
    trading: open && STAGES[stage].tradingEnabled,
  };
}

/** mm:ss, for a countdown that has to be read at a glance. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
