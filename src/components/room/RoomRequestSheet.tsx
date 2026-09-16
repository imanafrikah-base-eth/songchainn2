import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ListPlus, Loader2, Lock, Search, X, Radio } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { buildCatalogs, type Catalog, type Song } from '@/data/musicData';
import { thumb } from '@/lib/img';

export interface RoomLineEntry {
  requestId: string;
  song: Song;
  requesterId: string;
  requesterName: string;
}

interface ArtistShelf {
  id: string;
  name: string;
  image?: string;
  songCount: number;
  catalogs: Array<Catalog & { songs: Song[] }>;
}

/**
 * Ask the Room for a song. Every record the Room plays is here: pick an
 * artist, open one of their catalogues, and request a song from it, or search
 * straight for a song. It plays next for the whole room. Your own request sits
 * at the top with a way to take it back.
 */
export function RoomRequestSheet({
  open,
  onOpenChange,
  songs,
  artists,
  points,
  pointsLoading,
  minPoints,
  line,
  selfId,
  currentSongId,
  pending,
  onRequest,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songs: Song[];
  artists: Map<string, { name: string; image?: string }>;
  points: number;
  pointsLoading: boolean;
  minPoints: number;
  line: RoomLineEntry[];
  selfId: string | null;
  currentSongId: string | null;
  pending: boolean;
  onRequest: (song: Song) => void;
  onCancel: (requestId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [openArtistId, setOpenArtistId] = useState<string | null>(null);
  const [openCatalogId, setOpenCatalogId] = useState<string | null>(null);
  const mine = line.find((entry) => entry.requesterId === selfId) ?? null;
  const minePosition = mine ? line.indexOf(mine) : -1;
  const inLine = useMemo(() => new Set(line.map((entry) => entry.song.id)), [line]);
  const locked = !pointsLoading && points < minPoints;

  const shelves = useMemo<ArtistShelf[]>(() => {
    const songById = new Map(songs.map((s) => [s.id, s]));
    const byArtist = new Map<string, ArtistShelf>();
    for (const catalog of buildCatalogs(songs)) {
      const catalogSongs = catalog.songIds.map((id) => songById.get(id)).filter((s): s is Song => Boolean(s));
      if (catalogSongs.length === 0) continue;
      const known = artists.get(catalog.artistId);
      const shelf = byArtist.get(catalog.artistId) ?? {
        id: catalog.artistId,
        name: known?.name || catalog.artist,
        image: known?.image,
        songCount: 0,
        catalogs: [],
      };
      shelf.catalogs.push({ ...catalog, songs: catalogSongs });
      shelf.songCount += catalogSongs.length;
      byArtist.set(catalog.artistId, shelf);
    }
    const list = [...byArtist.values()];
    for (const shelf of list) {
      shelf.catalogs.sort((a, b) => b.trackCount - a.trackCount || a.title.localeCompare(b.title));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [artists, songs]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return songs
      .filter((s) => s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [query, songs]);

  const songRow = (song: Song, showArtist: boolean) => {
    const playing = song.id === currentSongId;
    const queued = inLine.has(song.id);
    const blocked = locked || !!mine || pending;
    return (
      <li key={song.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04]">
        <Cover song={song} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-zinc-100">{song.title}</p>
          {showArtist && <p className="truncate text-xs text-zinc-400">{song.artist}</p>}
        </div>
        {playing ? (
          <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-emerald-400">
            <Radio className="h-4 w-4" /> Playing
          </span>
        ) : queued ? (
          <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-zinc-400">
            <Check className="h-4 w-4" /> In the line
          </span>
        ) : (
          <button
            type="button"
            disabled={blocked}
            onClick={() => onRequest(song)}
            aria-label={`Request ${song.title} by ${song.artist}`}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity disabled:opacity-35"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : locked ? <Lock className="h-4 w-4" /> : <ListPlus className="h-4 w-4" />}
            Request
          </button>
        )}
      </li>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[88vh] w-full max-w-2xl flex-col gap-0 rounded-t-3xl border-white/10 bg-zinc-950 p-0 text-zinc-100 sm:bottom-4 sm:rounded-3xl sm:border [&>button]:hidden"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-white/15" aria-hidden="true" />
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-3 sm:px-5">
          <div className="min-w-0">
            <SheetTitle className="text-xl font-bold text-zinc-50">Request a song</SheetTitle>
            <SheetDescription className="mt-0.5 text-sm text-zinc-400">
              Pick a record and the whole room hears it next. One point a request, one request at a
              time, up to ten every five hours.
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-300 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {locked && (
          <div className="mx-4 mb-3 flex shrink-0 items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3 sm:mx-5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-zinc-100">Requests open at {minPoints} points</p>
              <p className="mt-0.5 text-zinc-400">
                You have {points.toLocaleString()}. Points come from listening, likes and battle votes.{' '}
                <Link to="/leaderboard" onClick={() => onOpenChange(false)} className="font-medium text-primary underline-offset-2 hover:underline">
                  See the leaderboard
                </Link>
              </p>
            </div>
          </div>
        )}

        {mine && (
          <div className="mx-4 mb-3 flex shrink-0 items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-2.5 sm:mx-5">
            <Cover song={mine.song} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {/* Where they actually stand, counted the way a person counts. */}
                Your request · {minePosition === 0 ? 'next up' : `#${minePosition + 1} in the line`}
              </p>
              <p className="truncate text-sm font-semibold text-zinc-50">{mine.song.title}</p>
              <p className="truncate text-xs text-zinc-400">{mine.song.artist}</p>
            </div>
            <button
              type="button"
              onClick={() => onCancel(mine.requestId)}
              className="inline-flex h-10 shrink-0 items-center rounded-full border border-white/15 px-3.5 text-sm font-medium text-zinc-200 hover:bg-white/10"
            >
              Take back
            </button>
          </div>
        )}

        <label className="mx-4 mb-2 flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 focus-within:border-primary/60 sm:mx-5">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a song or an artist"
            aria-label="Search a song or an artist"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear the search" className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-3">
          {query.trim() ? (
            results.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-zinc-400">Nothing in the Room matches that.</p>
            ) : (
              <ul>{results.map((song) => songRow(song, true))}</ul>
            )
          ) : shelves.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-zinc-400">Loading the Room's records…</p>
          ) : (
            <>
              <p className="px-3 pb-1 pt-1 text-xs text-zinc-500">
                {shelves.length} artists · {songs.length} songs
              </p>
              <ul>
                {shelves.map((artist) => {
                  const artistOpen = openArtistId === artist.id;
                  return (
                    <li key={artist.id} className="border-b border-white/[0.06] last:border-b-0">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenArtistId(artistOpen ? null : artist.id);
                          setOpenCatalogId(null);
                        }}
                        aria-expanded={artistOpen}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-white/[0.04]"
                      >
                        {artist.image ? (
                          <img
                            src={thumb(artist.image, 96) ?? artist.image}
                            alt=""
                            loading="lazy"
                            className="h-11 w-11 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-zinc-300">
                            {artist.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-zinc-100">{artist.name}</span>
                          <span className="block truncate text-xs text-zinc-400">
                            {artist.catalogs.length} {artist.catalogs.length === 1 ? 'catalogue' : 'catalogues'} · {artist.songCount} {artist.songCount === 1 ? 'song' : 'songs'}
                          </span>
                        </span>
                        <ChevronDown className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform ${artistOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {artistOpen && (
                        <ul className="mb-2 ml-3 border-l border-white/10 pl-2">
                          {artist.catalogs.map((catalog) => {
                            const catalogOpen = openCatalogId === catalog.id;
                            return (
                              <li key={catalog.id}>
                                <button
                                  type="button"
                                  onClick={() => setOpenCatalogId(catalogOpen ? null : catalog.id)}
                                  aria-expanded={catalogOpen}
                                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/[0.04]"
                                >
                                  {catalog.coverImage ? (
                                    <img
                                      src={thumb(catalog.coverImage, 88) ?? catalog.coverImage}
                                      alt=""
                                      loading="lazy"
                                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                                    />
                                  ) : (
                                    <span className="h-10 w-10 shrink-0 rounded-lg bg-white/10" />
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-zinc-100">{catalog.title}</span>
                                    <span className="block truncate text-xs text-zinc-400">
                                      {catalog.songs.length} {catalog.songs.length === 1 ? 'song' : 'songs'}
                                    </span>
                                  </span>
                                  <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${catalogOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {catalogOpen && <ul className="ml-2">{catalog.songs.map((song) => songRow(song, false))}</ul>}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {mine && (
            <p className="px-3 pt-2 text-center text-xs text-zinc-500">
              Your song plays first. Once it has, you can ask for another.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Cover({ song, size }: { song: Song; size: number }) {
  return song.coverImage ? (
    <img
      src={thumb(song.coverImage, size * 2) ?? song.coverImage}
      alt=""
      loading="lazy"
      className="shrink-0 rounded-lg object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span className="shrink-0 rounded-lg bg-white/10" style={{ width: size, height: size }} />
  );
}
