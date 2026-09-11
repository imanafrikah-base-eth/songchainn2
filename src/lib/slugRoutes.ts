import { SONGS, ARTISTS, type Song, type Artist } from '@/data/musicData';

/**
 * Addresses people see: songchainn.xyz/n3m3sis, songchainn.xyz/n3m3sis/trapped-soul.
 *
 * Catalog ids (artist 11, song 97, u-<uuid>) are for the backend. Every link
 * the app builds for a person goes through artistPath and songPath, and the
 * old /artist/:id and /song/:id addresses swap themselves for the name in the
 * address bar, so a number never becomes the thing somebody shares.
 */

export function toSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Every first path segment the app itself owns. A name that slugs to one of
// these can never be an artist address, or the artist would hide the page.
const RESERVED: Set<string> = new Set([
  'about', 'admin', 'api', 'artist', 'artists', 'assets', 'audience', 'auth', 'bettercallzaal', 'catalog',
  'claim', 'community', 'console', 'delete-account', 'discover', 'dj-shuffle', 'drops', 'guidelines',
  'inbox', 'install', 'keys', 'launch', 'leaderboard', 'license', 'marketplace', 'node_modules', 'nft',
  'not-found', 'playlist', 'playlists', 'post', 'privacy', 'profile', 'reset-password', 'room', 'share',
  'social', 'song', 'studio', 'terms', 'w', 'wallet', 'wavewarz-africa', 'world', 'world-assets',
  'world-builder', 'worlds',
]);

// The founding catalog, known at build time.
const artistBySlug = new Map<string, Artist>();
const slugByArtistId = new Map<string, string>();
ARTISTS.forEach((artist) => {
  const slug = toSlug(artist.name);
  artistBySlug.set(slug, artist);
  slugByArtistId.set(artist.id, slug);
});

// Full song slug (`artistSlug/songSlug`) ↔ song maps
const songByFullSlug = new Map<string, Song>();
const fullSlugBySongId = new Map<string, string>();
SONGS.forEach((song) => {
  const artistSlug = slugByArtistId.get(song.artistId);
  if (!artistSlug) return;
  const base = `${artistSlug}/${toSlug(song.title)}`;
  // Disambiguate collisions by appending the numeric song id
  const full = songByFullSlug.has(base) ? `${base}-${song.id}` : base;
  songByFullSlug.set(full, song);
  fullSlugBySongId.set(song.id, full);
});

// Artists who joined through the app, learned from the published catalog and
// from artist accounts as they load. First name to claim a slug keeps it.
const dynamicIdBySlug = new Map<string, string>();
const dynamicSlugById = new Map<string, string>();

function usable(slug: string): boolean {
  return Boolean(slug) && !RESERVED.has(slug) && !artistBySlug.has(slug);
}

/** Make these artists addressable by name. Safe to call often. */
export function registerArtistNames(list: Array<{ id: string; name: string | null | undefined }>): void {
  for (const { id, name } of list) {
    if (!id || !name || slugByArtistId.has(id) || dynamicSlugById.has(id)) continue;
    const slug = toSlug(name);
    if (!usable(slug) || dynamicIdBySlug.has(slug)) continue;
    dynamicIdBySlug.set(slug, id);
    dynamicSlugById.set(id, slug);
  }
}

export function isKnownArtistSlug(slug: string): boolean {
  const s = slug.toLowerCase();
  return !RESERVED.has(s) && (artistBySlug.has(s) || dynamicIdBySlug.has(s));
}

export function getArtistBySlug(slug: string): Artist | undefined {
  return artistBySlug.get(slug.toLowerCase());
}

/** The artist id behind a name address, founding or joined through the app. */
export function artistIdForSlug(slug: string): string | undefined {
  const s = slug.toLowerCase();
  return artistBySlug.get(s)?.id ?? dynamicIdBySlug.get(s);
}

export function getSongBySlug(artistSlug: string, songSlug: string): Song | undefined {
  return songByFullSlug.get(`${artistSlug.toLowerCase()}/${songSlug.toLowerCase()}`);
}

/**
 * Where an artist lives, by name. The name given is used when the artist has
 * not been learned yet; the id is the last resort, and the artist page swaps
 * it for the name the moment it knows it.
 */
export function artistPath(id: string | number | null | undefined, name?: string | null): string {
  const key = id == null ? '' : String(id);
  const known = slugByArtistId.get(key) ?? dynamicSlugById.get(key);
  if (known) return `/${known}`;
  if (name) {
    const slug = toSlug(name);
    if (usable(slug) && (!dynamicIdBySlug.has(slug) || dynamicIdBySlug.get(slug) === key)) return `/${slug}`;
  }
  return key ? `/artist/${key}` : '/artists';
}

/** Where a song lives, by the artist's name and the song's title. */
export function songPath(song: { id: string; title?: string | null; artistId?: string | null }): string {
  const full = fullSlugBySongId.get(song.id);
  if (full) return `/${full}`;
  const artist = artistPath(song.artistId);
  const title = song.title ? toSlug(song.title) : '';
  if (artist.startsWith('/artist/') || artist === '/artists' || !title) return `/song/${song.id}`;
  return `${artist}/${title}`;
}

export function getSongSlugUrl(song: Song): string {
  return songPath(song);
}

export function getArtistSlugUrl(artist: Artist): string {
  return artistPath(artist.id, artist.name);
}

export function getArtistSlugById(artistId: string): string {
  return slugByArtistId.get(artistId) ?? dynamicSlugById.get(artistId) ?? artistId;
}
