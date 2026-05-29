import { SONGS, ARTISTS, type Song, type Artist } from '@/data/musicData';

function toSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip combining diacritical marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Artist slug ↔ artist maps
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

// Routes that must not be intercepted by the slug resolver
const RESERVED: Set<string> = new Set([
  'about','artists','artist','catalog','song','playlist','playlists','discover',
  'social','room','community','profile','marketplace','inbox','dj-shuffle',
  'admin','audience','post','share','install','reset-password','bettercallzaal',
  'wavewarz-africa','auth','api','node_modules',
]);

export function isKnownArtistSlug(slug: string): boolean {
  const s = slug.toLowerCase();
  return !RESERVED.has(s) && artistBySlug.has(s);
}

export function getArtistBySlug(slug: string): Artist | undefined {
  return artistBySlug.get(slug.toLowerCase());
}

export function getSongBySlug(artistSlug: string, songSlug: string): Song | undefined {
  return songByFullSlug.get(`${artistSlug.toLowerCase()}/${songSlug.toLowerCase()}`);
}

export function getSongSlugUrl(song: Song): string {
  const full = fullSlugBySongId.get(song.id);
  return full ? `/${full}` : `/song/${song.id}`;
}

export function getArtistSlugUrl(artist: Artist): string {
  const slug = slugByArtistId.get(artist.id);
  return slug ? `/${slug}` : `/artist/${artist.id}`;
}

export function getArtistSlugById(artistId: string): string {
  return slugByArtistId.get(artistId) ?? artistId;
}
