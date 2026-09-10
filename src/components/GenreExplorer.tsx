import { useMemo, useState } from 'react';
import { ArtistName } from '@/components/ArtistName';
import { Lock, Play, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Song } from '@/data/musicData';

/**
 * Browsing the catalog by the sound of it.
 *
 * This replaced "All Songs": a six-column grid of two hundred and thirty
 * records in a scroll box. Two things were wrong with it, and the second is the
 * one you actually see.
 *
 * First, it was a dump. No editorial, no reason to look, no way in. A wall of
 * everything is the same as a wall of nothing.
 *
 * Second, and worse: songs from the same body of work share one cover, and the
 * grid sorted them together, so the identical picture appeared four and five
 * times in a row. That repetition is what made it read as broken rather than
 * full. Interleaving by artwork fixes it, so a row looks like a shelf of
 * different records instead of a printing error.
 */

interface GenreExplorerProps {
  songs: Song[];
  onPlay: (song: Song) => void;
  /** Guest gating on the landing page. Locked records still show. */
  isLocked?: (song: Song) => boolean;
}

/**
 * Reorder so the same cover never sits next to itself.
 *
 * Round-robin across artwork groups: take one from each distinct cover, then
 * go round again. With one group it degrades to the original order, which is
 * correct: there is nothing to interleave.
 */
function spreadByArtwork(songs: Song[]): Song[] {
  const groups = new Map<string, Song[]>();
  for (const s of songs) {
    const key = s.coverImage ?? `no-art-${s.id}`;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  const buckets = [...groups.values()];
  const out: Song[] = [];
  for (let i = 0; out.length < songs.length; i++) {
    let moved = false;
    for (const b of buckets) {
      if (i < b.length) {
        out.push(b[i]);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

export function GenreExplorer({ songs, onPlay, isLocked }: GenreExplorerProps) {
  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of songs) {
      const g = (s.genre ?? '').trim();
      if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [songs]);

  const [active, setActive] = useState<string | null>(null);
  const current = active ?? genres[0]?.name ?? null;

  const shown = useMemo(() => {
    const inGenre = current ? songs.filter((s) => s.genre === current) : songs;
    return spreadByArtwork(inGenre);
  }, [songs, current]);

  const playRandom = () => {
    if (!shown.length) return;
    onPlay(shown[Math.floor(Math.random() * shown.length)]);
  };

  if (!genres.length) return null;

  return (
    <section id="all-songs" aria-labelledby="explore-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="explore-heading" className="font-heading text-xl font-semibold text-foreground">
            Find your corner
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {songs.length} records across {genres.length} sounds. Pick one.
          </p>
        </div>
        <Button
          variant="secondary"
          className="h-10 shrink-0 rounded-full px-4 text-xs font-semibold"
          onClick={playRandom}
        >
          <Shuffle className="mr-2 h-3.5 w-3.5" />
          Surprise me
        </Button>
      </div>

      {/* The way in. Sorted by how much of the catalog each sound actually is. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-hide">
        <ul className="flex min-w-max gap-1.5">
          {genres.map((g) => (
            <li key={g.name}>
              <button
                type="button"
                onClick={() => setActive(g.name)}
                aria-pressed={current === g.name}
                className={`h-10 whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors focus-ring ${
                  current === g.name
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {g.name}
                <span className="ml-1.5 opacity-60">{g.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Bigger tiles than the old grid, and they scroll sideways: a shelf you
          run your eye along rather than a wall you scroll past. */}
      <div className="-mx-1 mt-4 overflow-x-auto px-1 pb-2 scrollbar-hide">
        <ul className="flex min-w-max gap-3">
          {shown.map((song) => {
            const locked = isLocked?.(song) ?? false;
            return (
              <li key={song.id} className="w-36 shrink-0 sm:w-40">
                <button
                  type="button"
                  onClick={() => onPlay(song)}
                  className="group w-full text-left focus-ring rounded-lg"
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-secondary">
                    {song.coverImage ? (
                      <img
                        src={song.coverImage}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : null}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90">
                        <Play className="ml-0.5 h-5 w-5 text-black" fill="currentColor" />
                      </span>
                    </span>
                    {locked ? (
                      <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/85">
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 truncate text-sm text-foreground">{song.title}</p>
                  <p className="truncate text-xs text-muted-foreground"><ArtistName name={song.artist} artistId={song.artistId} size={12} /></p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default GenreExplorer;
