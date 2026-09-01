// The cities of a world. A city is a KIND of content: music, artwork, video,
// the onchain layer, the writing. The nine rooms did not go anywhere; each one
// now stands as a building inside the city its content belongs to, and the
// rooms no city claims (the Gate, the Stage, the Council) stand in the town
// square at the centre.
//
// Why content types and not bodies of work: a visitor arrives wanting a thing,
// not a release. "Show me the videos" is a direction you can walk in. Bodies of
// work are how the music is shelved once you are already inside Music City.
//
// Buildings are content, so a city's height is its real inventory. A city with
// nothing in it renders as a fenced plot and says so. An empty building that
// pretends to be full teaches people the world is dead.

import { SONGS } from '@/data/musicData';
import type { WorldCityDef, WorldConfig, WorldRoomDef } from './types';

export const CLASSIC_FIVE_CITIES: WorldCityDef[] = [
  {
    slug: 'music',
    name: 'Music City',
    kind: 'music',
    tagline: 'The records, and the room they were made in',
    teaser: 'The catalog, the bodies of work, the studio floor and the request desk.',
    emptyLine: 'No records standing yet.',
    hue: 'emerald',
    order: 1,
    buildings: ['streets', 'studio', 'request-desk'],
  },
  {
    slug: 'canvas',
    name: 'Canvas City',
    kind: 'canvas',
    tagline: 'Everything made to be looked at',
    teaser: 'Cover art, graphics, animation, photography and the mural walls.',
    emptyLine: 'The walls are primed and waiting.',
    hue: 'violet',
    order: 2,
    buildings: ['gallery'],
  },
  {
    slug: 'motion',
    name: 'Motion City',
    kind: 'motion',
    tagline: 'Everything that moves',
    teaser: 'Music videos, visualizers, interviews and the stage footage.',
    emptyLine: 'Fenced plot. The archive is on its way in.',
    hue: 'sky',
    order: 3,
    buildings: ['screening-room'],
  },
  {
    slug: 'vault',
    name: 'Vault City',
    kind: 'vault',
    tagline: 'The onchain layer',
    teaser: 'Song coins, collectibles, the supporters wall and the receipts.',
    emptyLine: 'Nothing minted into this world yet.',
    hue: 'cyan',
    order: 4,
    buildings: ['wall'],
  },
  {
    slug: 'word',
    name: 'Word City',
    kind: 'word',
    tagline: 'Where the records came from',
    teaser: 'Lyrics, credits, and the story behind each one, told properly.',
    emptyLine: 'Unwritten. This city gets built a sentence at a time.',
    hue: 'orange',
    order: 5,
    buildings: [],
  },
];

export function getCityBySlug(
  world: WorldConfig,
  slug: string | undefined,
): WorldCityDef | undefined {
  if (!slug) return undefined;
  const s = slug.toLowerCase();
  return world.cities.find((c) => c.slug === s);
}

/** The city a room stands in, or undefined when the room is a town square landmark. */
export function cityForRoom(world: WorldConfig, roomSlug: string): WorldCityDef | undefined {
  return world.cities.find((c) => c.buildings.includes(roomSlug));
}

/** The rooms standing in a city, in the order the city lists them. */
export function cityRooms(world: WorldConfig, city: WorldCityDef): WorldRoomDef[] {
  return city.buildings
    .map((slug) => world.rooms.find((r) => r.slug === slug))
    .filter((r): r is WorldRoomDef => Boolean(r));
}

/**
 * Landmarks at the centre of the world rather than inside any one city: the
 * Gate you arrive through, the Stage in the square, the Council above it.
 */
export function townSquareRooms(world: WorldConfig): WorldRoomDef[] {
  return world.rooms
    .filter((r) => !cityForRoom(world, r.slug))
    .sort((a, b) => a.order - b.order);
}

export interface CityInventory {
  /** Real item count. Zero means the city renders as a fenced plot. */
  count: number;
  /** Plural noun for the count, shown on the skyline plate. */
  unit: string;
}

/**
 * What is actually standing in a city today, counted from real data rather
 * than estimated. Motion and Word read zero until the platform archives are
 * exported and loaded; that zero is deliberate and shows on the map.
 */
export function cityInventory(world: WorldConfig, city: WorldCityDef): CityInventory {
  const own = SONGS.filter((s) => s.artistId === world.artistId);

  switch (city.kind) {
    case 'music':
      return { count: own.length, unit: 'tracks' };
    case 'canvas': {
      const art = new Set(own.map((s) => s.coverImage).filter(Boolean));
      return { count: art.size, unit: 'artworks' };
    }
    case 'vault':
      return { count: own.filter((s) => s.onChainId != null).length, unit: 'coins' };
    case 'motion':
      return { count: 0, unit: 'videos' };
    case 'word':
      return { count: 0, unit: 'writings' };
    default:
      return { count: 0, unit: 'items' };
  }
}
