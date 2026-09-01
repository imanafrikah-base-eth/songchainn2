// Meeting the artist, at a fee.
//
// Three shapes of booking: a private one to one, an appearance on somebody's
// show, and hosting a whole event at a citizen's venue. All three are asked
// for here and settled directly between two wallets.
//
// Two deliberate rules, and both exist to keep this simple and safe:
//
//   1. NOTHING IS CUSTODIAL. The world never holds anybody's tokens. A request
//      is a request; payment happens wallet to wallet only after the artist
//      accepts. Holding other people's money to release later is a regulated
//      activity, and a booking desk does not need to be one.
//
//   2. YOU ASK BEFORE YOU PAY. Paying up front for a slot that might be turned
//      down is a bad deal for the visitor and a support burden for the artist.
//      Accept first, then pay.
//
// Pricing is by how much of the world's key you hold, not by what you spend.
// Holding more lowers the fee, which rewards belief rather than churn, and
// needs nothing but a balance read the gate already does.

import type { WorldRings } from './types';

export type MeetingKind = 'one-to-one' | 'appearance' | 'event';

export interface MeetingKindDef {
  id: MeetingKind;
  name: string;
  minutes: number;
  blurb: string;
  /**
   * Base fee in whole tokens, before the holder discount.
   *
   * Set against the launch price of roughly $0.00001 per $IMAN, so these land
   * near $25, $75 and $150. Token price moves and these numbers do not, so
   * revisit them whenever the price has moved meaningfully. They are plain
   * constants precisely so that is a one line change.
   */
  baseFee: number;
}

export const MEETING_KINDS: MeetingKindDef[] = [
  {
    id: 'one-to-one',
    name: 'A private word',
    minutes: 15,
    blurb: 'Fifteen minutes, just the two of you. Ask what you have been wanting to ask.',
    baseFee: 2_500_000,
  },
  {
    id: 'appearance',
    name: 'Come on my show',
    minutes: 30,
    blurb: 'An interview or a feature on your show, your podcast, or your room in this world.',
    baseFee: 7_500_000,
  },
  {
    id: 'event',
    name: 'Host him at your place',
    minutes: 60,
    blurb: 'A full hour at a venue you run. A listening party, a takeover, a night that is yours.',
    baseFee: 15_000_000,
  },
];

export type FeeTier = 'visitor' | 'fan' | 'insider' | 'council';

/** Discount off the base fee, by how much of the key you hold. */
const TIER_DISCOUNT: Record<FeeTier, number> = {
  visitor: 0,
  fan: 0,
  insider: 0.2,
  council: 0.4,
};

const TIER_LABEL: Record<FeeTier, string> = {
  visitor: 'Visitor',
  fan: 'Fan',
  insider: 'Insider',
  council: 'Council',
};

export function feeTierFor(rings: WorldRings | null): FeeTier {
  if (!rings) return 'visitor';
  if (rings.council) return 'council';
  if (rings.ring2) return 'insider';
  if (rings.ring1) return 'fan';
  return 'visitor';
}

export interface MeetingQuote {
  tier: FeeTier;
  tierLabel: string;
  baseFee: number;
  /** What this visitor actually pays, in whole tokens. */
  fee: number;
  /** Discount as a whole percentage, 0 when none applies. */
  discountPct: number;
  /** Tokens saved against the base fee. */
  saved: number;
}

export function quoteFor(kind: MeetingKindDef, rings: WorldRings | null): MeetingQuote {
  const tier = feeTierFor(rings);
  const discount = TIER_DISCOUNT[tier];
  const fee = Math.round(kind.baseFee * (1 - discount));
  return {
    tier,
    tierLabel: TIER_LABEL[tier],
    baseFee: kind.baseFee,
    fee,
    discountPct: Math.round(discount * 100),
    saved: kind.baseFee - fee,
  };
}

/** The next tier up and what it would save, for showing what holding more is worth. */
export function nextTierSaving(
  kind: MeetingKindDef,
  rings: WorldRings | null,
): { label: string; holding: number; fee: number } | null {
  const tier = feeTierFor(rings);
  if (!rings) return null;
  if (tier === 'visitor' || tier === 'fan') {
    return {
      label: TIER_LABEL.insider,
      holding: rings.thresholds.INSIDER,
      fee: Math.round(kind.baseFee * (1 - TIER_DISCOUNT.insider)),
    };
  }
  if (tier === 'insider') {
    return {
      label: TIER_LABEL.council,
      holding: rings.thresholds.INSIDER,
      fee: Math.round(kind.baseFee * (1 - TIER_DISCOUNT.council)),
    };
  }
  return null;
}

export type MeetingStatus = 'pending' | 'accepted' | 'declined' | 'paid' | 'done';

export const MEETING_STATUS_COPY: Record<MeetingStatus, string> = {
  pending: 'Waiting on a reply',
  accepted: 'Accepted. Payment details to follow',
  declined: 'Not this time',
  paid: 'Paid and booked',
  done: 'Done',
};
