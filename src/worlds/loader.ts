// Loading a world from the database.
//
// The registry in ./registry.ts stays exactly as it is: a hand-written
// WorldConfig per launched world. This adds a second source, the `worlds`
// tables, and hands back the identical WorldConfig shape so nothing
// downstream can tell where a world came from.
//
// Code-defined worlds win on a slug collision, always. World #001 was built by
// hand against a live audience and nothing in the builder is allowed to move
// it. That rule is the whole reason this is a merge and not a migration.

import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { worldKeyUrlFor } from '@/lib/artistCoins';
import type {
  CityContentKind,
  WorldCityDef,
  WorldConfig,
  WorldRoomAccess,
  WorldRoomDef,
} from './types';
import { WORLDS, getWorldBySlug as getCodeWorldBySlug } from './registry';

/** Rows as they come back from the three tables that make up a world. */
interface WorldRow {
  id: string;
  slug: string;
  world_number: number | null;
  artist_id: string | null;
  artist_name: string;
  token_symbol: string;
  chain: string;
  swap_url: string | null;
  farcaster_url: string | null;
  positioning: string;
  story: string[];
  featured_song_ids: string[];
  accent: string;
  hero_image: string | null;
  room_art: unknown;
  city_art: unknown;
  status: string;
  hero_video?: string | null;
  entrance_poster?: string | null;
  entrance_video?: string | null;
  room_video?: unknown;
  city_video?: unknown;
  depth?: unknown;
}

interface CityRow {
  slug: string;
  name: string;
  kind: string;
  tagline: string;
  teaser: string;
  empty_line: string;
  hue: string;
  sort_order: number;
  buildings: string[];
}

interface StreetRow {
  slug: string;
  name: string;
  ring: number | null;
  access: string;
  tagline: string;
  teaser: string;
  hue: string;
  sort_order: number;
  /* The key the artist put on this street specifically. Null inherits the world. */
  key_kind?: string | null;
  key_song_id?: string | null;
  key_threshold?: string | number | null;
  key_nft_id?: string | null;
}

const ACCESS: WorldRoomAccess[] = ['public', 'fan', 'insider', 'council', 'event'];
const KINDS: CityContentKind[] = ['music', 'canvas', 'motion', 'vault', 'word'];

function asRecord(value: unknown): Record<string, string> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {};
}

function toRoom(row: StreetRow): WorldRoomDef {
  return {
    slug: row.slug,
    name: row.name,
    // ring is 0|1|2|3|null in the type; anything else is data rot, so it
    // degrades to null (event or public utility) rather than throwing.
    ring: row.ring === 0 || row.ring === 1 || row.ring === 2 || row.ring === 3 ? row.ring : null,
    // An artist who set this street to 'open' means open, whatever ring it was.
    access: row.key_kind === 'open'
      ? 'public'
      : ACCESS.includes(row.access as WorldRoomAccess)
      ? (row.access as WorldRoomAccess)
      : 'public',
    tagline: row.tagline,
    teaser: row.teaser,
    hue: row.hue,
    order: row.sort_order,
    songKey:
      row.key_kind === 'song' && row.key_song_id
        ? { songId: String(row.key_song_id), threshold: String(row.key_threshold ?? '1') }
        : null,
    nftKey: row.key_kind === 'nft' && row.key_nft_id ? { nftId: String(row.key_nft_id) } : null,
  };
}

function toCity(row: CityRow): WorldCityDef {
  return {
    slug: row.slug,
    name: row.name,
    kind: KINDS.includes(row.kind as CityContentKind) ? (row.kind as CityContentKind) : 'music',
    tagline: row.tagline,
    teaser: row.teaser,
    emptyLine: row.empty_line,
    hue: row.hue,
    order: row.sort_order,
    buildings: row.buildings ?? [],
  };
}

export function rowsToWorldConfig(
  world: WorldRow,
  cities: CityRow[],
  streets: StreetRow[],
): WorldConfig {
  return {
    slug: world.slug,
    // Unpublished worlds have no number yet. 0 reads as "unnumbered" and the
    // map never prints it, which is the point of earning it at publish.
    worldNumber: world.world_number ?? 0,
    artistId: world.artist_id ?? '',
    artistName: world.artist_name,
    tokenSymbol: world.token_symbol,
    chain: 'base',
    // A world's key is its artist's Zora creator coin, so the buy link is
    // derived from the coin on record rather than typed in by hand. A saved
    // swap_url still wins, for a world keyed on something else on purpose.
    swapUrl: world.swap_url ?? (world.artist_id ? worldKeyUrlFor(world.artist_id) : null),
    farcasterUrl: world.farcaster_url ?? undefined,
    positioning: world.positioning,
    story: world.story ?? [],
    featuredSongIds: world.featured_song_ids ?? [],
    rooms: [...streets].sort((a, b) => a.sort_order - b.sort_order).map(toRoom),
    cities: [...cities].sort((a, b) => a.sort_order - b.sort_order).map(toCity),
    accent: world.accent,
    heroImage: world.hero_image ?? undefined,
    roomArt: asRecord(world.room_art),
    cityArt: asRecord(world.city_art),
    // Every slot World #001 has, filled from the Art step when the artist
    // filled it. Absent means the still, or nothing, exactly as before.
    heroVideo: world.hero_video ?? undefined,
    roomVideo: asRecord(world.room_video),
    cityVideo: asRecord(world.city_video),
    entrance: world.entrance_poster ? { poster: world.entrance_poster, video: world.entrance_video ?? undefined } : undefined,
    depth: (() => {
      const d = asRecord(world.depth);
      return d.sky || d.facade || d.ground ? { sky: d.sky, facade: d.facade, ground: d.ground } : undefined;
    })(),
  };
}

/**
 * A world by slug, code-defined first. Returns null when there is no such
 * world, or when Supabase is not configured and the slug is not code-defined.
 */
export async function fetchWorldBySlug(slug: string | undefined): Promise<WorldConfig | null> {
  const coded = getCodeWorldBySlug(slug);
  if (coded) return coded;
  if (!isSupabaseConfigured || !slug) return null;

  const { data: world, error } = await supabase
    .from('worlds')
    .select(
      'id, slug, world_number, artist_id, artist_name, token_symbol, chain, swap_url, farcaster_url, positioning, story, featured_song_ids, accent, hero_image, room_art, city_art, status, hero_video, entrance_poster, entrance_video, room_video, city_video, depth',
    )
    .eq('slug', slug.trim().toLowerCase())
    .maybeSingle();

  if (error || !world) return null;

  const [{ data: cities }, { data: streets }] = await Promise.all([
    supabase
      .from('world_cities')
      .select('slug, name, kind, tagline, teaser, empty_line, hue, sort_order, buildings')
      .eq('world_id', world.id),
    supabase
      .from('world_streets')
      .select('slug, name, ring, access, tagline, teaser, hue, sort_order, key_kind, key_song_id, key_threshold, key_nft_id')
      .eq('world_id', world.id),
  ]);

  return rowsToWorldConfig(
    world as unknown as WorldRow,
    (cities ?? []) as unknown as CityRow[],
    (streets ?? []) as unknown as StreetRow[],
  );
}

/**
 * Every world the directory should show: the code-defined ones, then the
 * published database ones, minus any slug already claimed by code.
 */
export async function fetchPublishedWorlds(): Promise<WorldConfig[]> {
  if (!isSupabaseConfigured) return [...WORLDS];

  const { data, error } = await supabase
    .from('worlds')
    .select(
      'id, slug, world_number, artist_id, artist_name, token_symbol, chain, swap_url, farcaster_url, positioning, story, featured_song_ids, accent, hero_image, room_art, city_art, status, hero_video, entrance_poster, entrance_video, room_video, city_video, depth',
    )
    .eq('status', 'published')
    .order('world_number', { ascending: true });

  if (error || !data?.length) return [...WORLDS];

  const claimed = new Set(WORLDS.map((w) => w.slug));
  const fromDb = (data as unknown as WorldRow[])
    .filter((w) => !claimed.has(w.slug))
    // The directory only needs the shell; rooms and cities load per world.
    .map((w) => rowsToWorldConfig(w, [], []));

  return [...WORLDS, ...fromDb];
}

/** The worlds this person owns or can edit, drafts included. */
export async function fetchMyWorlds(): Promise<Array<WorldConfig & { id: string; status: string }>> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('worlds')
    .select(
      'id, slug, world_number, artist_id, artist_name, token_symbol, chain, swap_url, farcaster_url, positioning, story, featured_song_ids, accent, hero_image, room_art, city_art, status, hero_video, entrance_poster, entrance_video, room_video, city_video, depth',
    )
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return (data as unknown as WorldRow[]).map((w) => ({
    ...rowsToWorldConfig(w, [], []),
    id: w.id,
    status: w.status,
  }));
}
