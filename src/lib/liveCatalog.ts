import { ARTISTS, CATALOGS, SONGS, buildCatalogs, type Artist, type Catalog, type Song } from '@/data/musicData';

/**
 * The whole catalogue as it stands right now: the founding songs in
 * musicData.ts plus everything published since, held in one place.
 *
 * Code that read SONGS / ARTISTS / CATALOGS directly only ever saw the founding
 * list, so an artist who joined through the app was missing from it. Read from
 * here instead: `useLiveCatalog()` in a component, the plain getters anywhere
 * else (event handlers, the player, jobs). usePublishedCatalog feeds it.
 */
export interface LiveCatalog {
  songs: Song[];
  artists: Artist[];
  catalogs: Catalog[];
  songById: Map<string, Song>;
  artistById: Map<string, Artist>;
}

function build(songs: Song[], artists: Artist[], catalogs: Catalog[]): LiveCatalog {
  return {
    songs,
    artists,
    catalogs,
    songById: new Map(songs.map((s) => [String(s.id), s])),
    artistById: new Map(artists.map((a) => [String(a.id), a])),
  };
}

const NO_ONE: ReadonlySet<string> = new Set();

let snapshot: LiveCatalog = build(SONGS, ARTISTS, CATALOGS);
let lastSource: unknown = null;
let lastReleases: unknown = null;
let lastPaused: ReadonlySet<string> = NO_ONE;
const listeners = new Set<() => void>();

/**
 * Called by usePublishedCatalog when its rows change. `source` and `releases`
 * are the query results themselves, which every instance of the hook shares,
 * so many mounted instances still rebuild the catalogue only once.
 */
export function setLiveCatalog(
  source: unknown,
  releases: unknown,
  publishedSongs: Song[],
  publishedArtists: Artist[],
  pausedArtistIds: ReadonlySet<string> = NO_ONE,
): void {
  if (source === lastSource && releases === lastReleases && pausedArtistIds === lastPaused) return;
  lastSource = source;
  lastReleases = releases;
  lastPaused = pausedArtistIds;

  // An artist on a break is out of the catalogue altogether, founding records
  // included (those live here, not in a songs row anyone could hide).
  const away = (artistId: string | number | null | undefined) =>
    artistId != null && pausedArtistIds.has(String(artistId).toLowerCase());

  // The founding entry wins where an id is in both.
  const songById = new Map<string, Song>();
  for (const s of SONGS) if (!away(s.artistId)) songById.set(String(s.id), s);
  for (const s of publishedSongs) if (!songById.has(String(s.id))) songById.set(String(s.id), s);
  const artistById = new Map<string, Artist>();
  for (const a of ARTISTS) if (!away(a.id)) artistById.set(String(a.id), a);
  for (const a of publishedArtists) if (!artistById.has(String(a.id))) artistById.set(String(a.id), a);

  const songs = Array.from(songById.values());
  snapshot = build(songs, Array.from(artistById.values()), songs.length === SONGS.length ? CATALOGS : buildCatalogs(songs));
  listeners.forEach((listener) => listener());
}

export function subscribeLiveCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLiveCatalog(): LiveCatalog {
  return snapshot;
}

export function liveSongs(): Song[] {
  return snapshot.songs;
}

export function liveArtists(): Artist[] {
  return snapshot.artists;
}

export function liveCatalogs(): Catalog[] {
  return snapshot.catalogs;
}

export function findSong(id: string | number | null | undefined): Song | undefined {
  return id == null ? undefined : snapshot.songById.get(String(id));
}

export function findArtist(id: string | number | null | undefined): Artist | undefined {
  return id == null ? undefined : snapshot.artistById.get(String(id));
}
