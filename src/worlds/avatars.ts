// Who you are in the world.
//
// Every citizen gets a body, free, on arrival. Looks come in three kinds and
// the difference matters:
//
//   free     anyone, including someone who holds nothing at all
//   holder   unlocked by HOLDING, never bought. Sell the key and it goes away
//   premium  costs a fee, and the fee is smaller the more of the key you hold
//
// The middle kind is the important one. A look you cannot buy at any price,
// only hold, is worth more than one you can, and it costs the world nothing to
// give away. It also means a new visitor with no money can still see something
// on the rack worth walking toward.
//
// Avatars are drawn, not downloaded. Every look here is a handful of numbers
// that render as SVG, so a citizen costs no bytes, works offline, loads
// instantly on a bad connection, and needs no artist to add the next one.
// When the world grows into 3D these same numbers become the seed for a real
// body; nothing here is throwaway.

import type { WorldRings } from './types';
import { feeTierFor, type FeeTier } from './meetings';

export type LookKind = 'free' | 'holder' | 'premium';

export interface AvatarLook {
  id: string;
  name: string;
  kind: LookKind;
  /** Minimum tier required to WEAR it. Only meaningful for holder looks. */
  requires?: 'fan' | 'insider' | 'council';
  /** Base fee in whole tokens. Only meaningful for premium looks. */
  baseFee?: number;
}

export interface AvatarConfig {
  skin: string;
  outfit: string;
  hair: string;
  accessory: string;
}

export const SKINS: { id: string; hex: string }[] = [
  { id: 'umber', hex: '#5C3A21' },
  { id: 'sienna', hex: '#7A4B2A' },
  { id: 'clay', hex: '#96603A' },
  { id: 'sand', hex: '#B8814F' },
  { id: 'wheat', hex: '#D2A16B' },
  { id: 'oat', hex: '#E3C39A' },
];

export const OUTFITS: (AvatarLook & { hex: string })[] = [
  { id: 'street', name: 'Street', kind: 'free', hex: '#2F3540' },
  { id: 'dust', name: 'Dust', kind: 'free', hex: '#6B5B4A' },
  { id: 'river', name: 'River', kind: 'free', hex: '#2C5364' },
  { id: 'copper', name: 'Copper', kind: 'holder', requires: 'fan', hex: '#B0663A' },
  { id: 'patina', name: 'Patina', kind: 'holder', requires: 'insider', hex: '#3F7468' },
  { id: 'gold', name: 'Council Gold', kind: 'holder', requires: 'council', hex: '#C9A227' },
  { id: 'midnight', name: 'Midnight Silk', kind: 'premium', baseFee: 1_000_000, hex: '#141428' },
  { id: 'ember', name: 'Ember', kind: 'premium', baseFee: 2_000_000, hex: '#8E2B1F' },
];

export const HAIRS: AvatarLook[] = [
  { id: 'fade', name: 'Fade', kind: 'free' },
  { id: 'afro', name: 'Afro', kind: 'free' },
  { id: 'braids', name: 'Braids', kind: 'free' },
  { id: 'locs', name: 'Locs', kind: 'holder', requires: 'fan' },
  { id: 'wrap', name: 'Head wrap', kind: 'holder', requires: 'insider' },
];

export const ACCESSORIES: AvatarLook[] = [
  { id: 'none', name: 'Nothing', kind: 'free' },
  { id: 'cap', name: 'Cap', kind: 'free' },
  { id: 'shades', name: 'Shades', kind: 'holder', requires: 'fan' },
  { id: 'chain', name: 'Chain', kind: 'holder', requires: 'insider' },
  { id: 'crown', name: 'Crown', kind: 'holder', requires: 'council' },
];

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: 'clay',
  outfit: 'street',
  hair: 'fade',
  accessory: 'none',
};

const TIER_ORDER: Record<FeeTier, number> = {
  visitor: 0,
  fan: 1,
  insider: 2,
  council: 3,
};

/** Same discount ladder the Parlour uses, so one rule governs every fee. */
const TIER_DISCOUNT: Record<FeeTier, number> = {
  visitor: 0,
  fan: 0,
  insider: 0.2,
  council: 0.4,
};

export function canWear(look: AvatarLook, rings: WorldRings | null): boolean {
  if (look.kind === 'free') return true;
  if (look.kind === 'premium') return false; // owned only once bought
  const tier = feeTierFor(rings);
  const need = look.requires ?? 'fan';
  return TIER_ORDER[tier] >= TIER_ORDER[need];
}

/** What a premium look costs this visitor, after the holder discount. */
export function priceFor(look: AvatarLook, rings: WorldRings | null): number | null {
  if (look.kind !== 'premium' || look.baseFee == null) return null;
  const tier = feeTierFor(rings);
  return Math.round(look.baseFee * (1 - TIER_DISCOUNT[tier]));
}

/** What it would take to wear a holder look you cannot wear yet. */
export function unlockHint(
  look: AvatarLook,
  rings: WorldRings | null,
  symbol: string,
): string | null {
  if (look.kind !== 'holder' || canWear(look, rings)) return null;
  const need = look.requires ?? 'fan';
  if (need === 'council') return 'Held by the ten most reputable citizens.';
  const amount = need === 'insider' ? rings?.thresholds.INSIDER : rings?.thresholds.FAN;
  return amount ? `Hold ${amount.toLocaleString()} ${symbol} to wear this.` : null;
}

export function hexForSkin(id: string): string {
  return SKINS.find((s) => s.id === id)?.hex ?? SKINS[2].hex;
}

export function hexForOutfit(id: string): string {
  return OUTFITS.find((o) => o.id === id)?.hex ?? OUTFITS[0].hex;
}

/**
 * Fall back to something wearable if a citizen is wearing a look they have
 * since lost the key for. Selling the token closes doors; it should not leave
 * a person standing in the street with no clothes on.
 */
export function sanitize(config: AvatarConfig, rings: WorldRings | null): AvatarConfig {
  const outfit = OUTFITS.find((o) => o.id === config.outfit);
  const hair = HAIRS.find((h) => h.id === config.hair);
  const accessory = ACCESSORIES.find((a) => a.id === config.accessory);
  return {
    skin: SKINS.some((s) => s.id === config.skin) ? config.skin : DEFAULT_AVATAR.skin,
    outfit: outfit && (outfit.kind === 'premium' || canWear(outfit, rings))
      ? config.outfit
      : DEFAULT_AVATAR.outfit,
    hair: hair && canWear(hair, rings) ? config.hair : DEFAULT_AVATAR.hair,
    accessory: accessory && canWear(accessory, rings) ? config.accessory : DEFAULT_AVATAR.accessory,
  };
}
