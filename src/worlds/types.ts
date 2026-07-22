// Artist Worlds by songchainn — framework types.
// A World is a token-gated immersive layer over an artist's catalog and
// content. Artist profiles evolve into worlds: each artist gets a WorldConfig
// describing their access token, rooms, and copy. IMan Afrikah is World #001
// (spec: WORLDS/IMAN AFRIKAH/INSTRUCTIONS/IMAN_WORLD_BUILD_SPEC.pdf).
// In future, artists will shape their own worlds on the songchainn interface;
// for now the platform builds each world from the artist's brief.

export type WorldRoomAccess = 'public' | 'fan' | 'insider' | 'council' | 'event';

export interface WorldRoomDef {
  /** Concept-locked string. Changing a slug later is a migration. */
  slug: string;
  name: string;
  /** 0 public, 1 fan, 2 insider, 3 council; null = event-based or public utility. */
  ring: 0 | 1 | 2 | 3 | null;
  access: WorldRoomAccess;
  tagline: string;
  /** Shown on a locked door: what is waiting inside. Counts, never spoilers. */
  teaser: string;
  /** Tailwind color stem used for the door art (must exist in DOOR_HUES). */
  hue: string;
  order: number;
}

export interface WorldConfig {
  /** URL slug under /world/. Matches the artist's vanity slug. */
  slug: string;
  /** World #001, #002, ... in launch order. */
  worldNumber: number;
  /** musicData ARTISTS id — links the world to its artist profile + catalog. */
  artistId: string;
  artistName: string;
  /** Access token ticker, with the $ prefix (display only). */
  tokenSymbol: string;
  /**
   * Client-side hint only. The server (world-gate edge function) is the
   * authority on whether the token is live; this drives nothing but copy
   * while the gate resolves.
   */
  chain: 'base';
  /** Swap link once the token pool is live; null pre-launch. */
  swapUrl: string | null;
  farcasterUrl?: string;
  /** The one-line positioning statement, rendered verbatim. */
  positioning: string;
  /** Gate room story, one paragraph per entry. */
  story: string[];
  /**
   * Song ids to feature at the Gate. Empty = pick the artist's top ranked
   * tracks at runtime.
   */
  featuredSongIds: string[];
  rooms: WorldRoomDef[];
  /** Primary accent hue for world chrome (Tailwind color stem). */
  accent: string;
}

/**
 * The ring resolution returned by the world-gate edge function. The server
 * is the only enforcement boundary; the client uses this to paint doors.
 */
export interface WorldRings {
  ring0: true;
  ring1: boolean;
  ring2: boolean;
  council: boolean;
  /** Whole-token balance of the world's access token. */
  balance: number;
  thresholds: { FAN: number; INSIDER: number };
  rank: number | null;
  /** False until the world's token contract is configured server-side. */
  tokenLive: boolean;
}

export type WorldDoorState = 'open' | 'locked' | 'no-wallet' | 'council' | 'event';

export function doorStateFor(
  room: WorldRoomDef,
  rings: WorldRings | null,
  connected: boolean,
): WorldDoorState {
  if (room.access === 'public') return 'open';
  if (room.access === 'event') return 'event';
  if (!connected) return 'no-wallet';
  if (!rings) return 'locked';
  if (room.access === 'fan') return rings.ring1 ? 'open' : 'locked';
  if (room.access === 'insider') return rings.ring2 ? 'open' : 'locked';
  if (room.access === 'council') return rings.council ? 'council' : 'locked';
  return 'locked';
}

export function roomIsEnterable(state: WorldDoorState): boolean {
  return state === 'open' || state === 'council';
}
