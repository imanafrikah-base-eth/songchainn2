// Artist Worlds by songchainn — framework types.
// A World is a token-gated immersive layer over an artist's catalog and
// content. Artist profiles evolve into worlds: each artist gets a WorldConfig
// describing their access token, rooms, and copy. IMan Afrikah is World #001
// (spec: WORLDS/IMAN AFRIKAH/INSTRUCTIONS/IMAN_WORLD_BUILD_SPEC.pdf).
// In future, artists will shape their own worlds on the songchainn interface;
// for now the platform builds each world from the artist's brief.

export type WorldRoomAccess = 'public' | 'fan' | 'insider' | 'council' | 'event';

/**
 * How a street or a city is shown while it is being built.
 *
 * There used to be two states, on the map or put away, which forced an artist
 * with a half-built gallery to choose between showing visitors an empty room
 * and hiding the room altogether. Three states, theirs to pick per street and
 * per city:
 *
 *   open  shown and enterable, the normal thing
 *   soon  shown on the map with a Coming soon plate; nobody walks in yet
 *   away  off the map entirely, kept with everything on it
 *
 * The owner always walks in, whatever the stage says. It is about what
 * visitors see, not about locking the artist out of their own work.
 */
export type WorldStage = 'open' | 'soon' | 'away';

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
  /**
   * A key the artist put on this door specifically, which overrides the ring
   * rules above. Holding the named song opens it, whatever ring the visitor is
   * in. The artist sets this per street and can change it at any time.
   */
  songKey?: { songId: string; threshold: string; title?: string } | null;
  /**
   * A drop the artist put on this door. Holding one copy of that NFT opens
   * it, whatever ring the visitor is in. Checked on the server from the
   * visitor's real balance on Base.
   */
  nftKey?: { nftId: string; title?: string } | null;
  /** How visitors see this street while it is being built. Absent means open. */
  stage?: WorldStage;
}

/**
 * A city is a KIND of content, not a place on a map. Music City holds the
 * records, Canvas City the artwork, Motion City the video. The rooms that
 * already exist become buildings standing inside whichever city they belong
 * to, so nothing is thrown away: a room is still a room, it just has an
 * address now.
 *
 * Music is deliberately not confined to Music City. The player lives above
 * the router (PlayerProvider in App.tsx), so audio carries across every city
 * a visitor walks into. Music is the township in all of them.
 */
export type CityContentKind = 'music' | 'canvas' | 'motion' | 'vault' | 'word';

export interface WorldCityDef {
  /** URL segment under /world/:worldSlug/. Must not collide with a room slug. */
  slug: string;
  name: string;
  kind: CityContentKind;
  tagline: string;
  /** One line on the skyline plate: what a visitor finds here. */
  teaser: string;
  /** Shown instead of a count while the city has nothing standing in it yet. */
  emptyLine: string;
  /** Tailwind color stem, shared with DOOR_HUES. */
  hue: string;
  order: number;
  /** Room slugs that stand as buildings in this city, in display order. */
  buildings: string[];
  /** How visitors see this city while it is being built. Absent means open. */
  stage?: WorldStage;
}

export interface WorldConfig {
  /** URL slug under /world/. Matches the artist's vanity slug. */
  slug: string;
  /** The worlds row id, for a world built in the builder. Absent for coded ones. */
  id?: string;
  /** True until the doors have been opened. Only the owner can see one. */
  draft?: boolean;
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
  /**
   * The owner asks visitors not to screenshot this world.
   *
   * A request, and the interface must never dress it as anything stronger. A
   * browser cannot stop a screenshot: the operating system takes it and the
   * page is never asked. Android can, with FLAG_SECURE, but this app is one
   * webview serving every route, so honouring it per world needs a native
   * plugin that is not built yet. Until then this states the wish where
   * visitors see it, and nothing claims the wish is enforced.
   */
  noScreenshots?: boolean;
  /** Gate room story, one paragraph per entry. */
  story: string[];
  /**
   * Song ids to feature at the Gate. Empty = pick the artist's top ranked
   * tracks at runtime.
   */
  featuredSongIds: string[];
  rooms: WorldRoomDef[];
  /**
   * The cities of this world, in skyline order. Rooms live inside them; any
   * room no city claims stands in the town square instead.
   */
  cities: WorldCityDef[];
  /** Primary accent hue for world chrome (Tailwind color stem). */
  accent: string;
  /** Large image behind the world map header. */
  heroImage?: string;
  /** Door and room art, keyed by room slug. Real artist imagery only. */
  roomArt?: Record<string, string>;
  /** Skyline art, keyed by city slug. Real artist imagery only. */
  cityArt?: Record<string, string>;

  // ---------------------------------------------------------------- motion
  // Every art slot above is a still, and the still is what ships: these
  // fields are additive. A world with no motion looks exactly as it did.
  // Each loop is silent, seamless, and plays over its own still, which is
  // also its poster frame, so nothing jumps when the video takes over and
  // nothing is missing when it never does. WorldArt is the only consumer.

  /** Silent loop behind the world map header. Poster is heroImage. */
  heroVideo?: string;
  /** Silent room loops, keyed by room slug. Posters come from roomArt. */
  roomVideo?: Record<string, string>;
  /** Silent city loops, keyed by city slug. Posters come from cityArt. */
  cityVideo?: Record<string, string>;
  /**
   * The doors a visitor walks through on arrival. Portrait, under three
   * seconds, played at most once a session and never for anyone who asked
   * their system for less motion.
   */
  entrance?: { poster: string; video?: string };
  /**
   * What this world shows in its advert on Home and the landing page. The
   * artist's choice: the gate (entrance loop, the default), the hero loop, or
   * a clip made for the slot. Absent means the gate.
   */
  ad?: { kind: 'entrance' | 'hero' | 'custom'; image?: string; video?: string };
  /**
   * How each piece of art sits in its frame, chosen by the artist: focus point
   * and zoom, keyed 'hero' | 'entrance' | 'ad' | 'room:<slug>' | 'city:<slug>'.
   */
  artFit?: Record<string, { x: number; y: number; scale: number }>;
  /**
   * Textures for the world with depth. Absent means the 3D city falls back
   * to the flat colours it has always used, which is a valid world, just a
   * barer one.
   */
  depth?: {
    /** Equirectangular 2:1 night sky, wrapped around the whole scene. */
    sky?: string;
    /** Seamless tile wrapped on every tower, tinted to its city hue. */
    facade?: string;
    /** Seamless tile for the ground plane and the town square circle. */
    ground?: string;
  };
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
  /**
   * Song coin balances this visitor holds, keyed by song id, as decimal
   * strings. Filled from the holder profile, which is written from Base by the
   * song-holdings function, so a door locked with a song is checked against a
   * balance that was actually read from the chain.
   */
  heldSongs?: Record<string, string>;
  /**
   * Copies of this world's drops the visitor holds, keyed by drop id. Read
   * from Base by world-gate, so a door locked with a drop is answered by the
   * chain, never by the browser.
   */
  heldNfts?: Record<string, number>;
  /**
   * True when the person asking owns this world.
   *
   * An artist was locked out of the rooms they had just built, because the only
   * way in was holding enough of their own coin, and a draft world has no coin
   * at all. Owning it is a stronger claim than holding a balance, so an owner
   * walks through every door. Set by world-gate from worlds.owner_id against
   * their session, never from anything the browser says.
   */
  isOwner?: boolean;
  /** An owner who asked to see it the way a stranger sees it. */
  viewingAsVisitor?: boolean;
}

export type WorldDoorState = 'open' | 'locked' | 'no-wallet' | 'council' | 'event' | 'soon';

export function doorStateFor(
  room: WorldRoomDef,
  rings: WorldRings | null,
  connected: boolean,
): WorldDoorState {
  // The artist is not a visitor to their own world. Every door they made is
  // open to them, including the ones locked with a drop, a song or an event,
  // because otherwise they cannot see what they are building. Asking for the
  // visitor's view drops this and every rule below applies as normal.
  if (rings?.isOwner && !rings.viewingAsVisitor) return 'open';
  // The artist said this one is not ready. It stands on the map so people know
  // it is coming, and nobody walks in until they say so.
  if (room.stage === 'soon') return 'soon';
  // A drop on the door is the artist's own decision about this one door, so it
  // is answered before the ring rules, and it can open a door the rings would
  // shut. Same for a song key below.
  if (room.nftKey) {
    const held = rings?.heldNfts?.[room.nftKey.nftId] ?? 0;
    if (held > 0) return 'open';
    if (!connected) return 'no-wallet';
    return 'locked';
  }
  if (room.songKey) {
    const held = rings?.heldSongs?.[room.songKey.songId];
    const need = room.songKey.threshold;
    if (held !== undefined && BigInt(held || '0') >= BigInt(need || '1')) return 'open';
    if (!connected) return 'no-wallet';
    return 'locked';
  }
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
