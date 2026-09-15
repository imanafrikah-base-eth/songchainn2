import { useMemo, useState } from 'react';
import { Check, ListPlus, Loader2, Search, X, Radio } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { Song } from '@/data/musicData';
import { thumb } from '@/lib/img';

export interface RoomLineEntry {
  requestId: string;
  song: Song;
  requesterId: string;
  requesterName: string;
}

/**
 * Ask the Room for a song. Search every record the Room plays, tap one, and it
 * joins the request line for everybody. Your own request sits at the top with
 * a way to take it back.
 */
export function RoomRequestSheet({
  open,
  onOpenChange,
  songs,
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
  line: RoomLineEntry[];
  selfId: string | null;
  currentSongId: string | null;
  pending: boolean;
  onRequest: (song: Song) => void;
  onCancel: (requestId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const mine = line.find((entry) => entry.requesterId === selfId) ?? null;
  const minePosition = mine ? line.indexOf(mine) : -1;
  const inLine = useMemo(() => new Set(line.map((entry) => entry.song.id)), [line]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...songs].sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0));
    const hits = q
      ? sorted.filter((s) => s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q))
      : sorted;
    return hits.slice(0, 80);
  }, [query, songs]);

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
              Pick a record and the whole room hears it next. One request at a time.
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

        {mine && (
          <div className="mx-4 mb-3 flex shrink-0 items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-2.5 sm:mx-5">
            <Cover song={mine.song} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Your request · {minePosition === 0 ? 'next up' : `${minePosition} ahead of it`}
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
          {results.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-zinc-400">Nothing in the Room matches that.</p>
          ) : (
            <ul>
              {results.map((song) => {
                const playing = song.id === currentSongId;
                const queued = inLine.has(song.id);
                const blocked = !!mine || playing || queued || pending;
                return (
                  <li key={song.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04]">
                    <Cover song={song} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-zinc-100">{song.title}</p>
                      <p className="truncate text-xs text-zinc-400">{song.artist}</p>
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
                        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity disabled:opacity-35"
                      >
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
                        Request
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
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
