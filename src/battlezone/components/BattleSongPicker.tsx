import { useMemo, useState } from "react";
import { ChevronDown, Disc3, Music } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/battlezone/components/ui/dropdown-menu";
import type { Song } from "@/data/musicData";

/**
 * Picking a song for a battle, in the order the music is actually in.
 *
 * One flat list of every record an artist ever made is not a list, it is a
 * pile. A catalogue has shape: releases with their tracks in order, and the
 * singles standing on their own. So this opens on the releases, each one
 * opens to its own tracks, and the singles sit together under Singles.
 *
 * A song already picked for another round is still shown, greyed, so the host
 * can see it was taken rather than wondering where it went.
 */

export interface SongOption extends Pick<Song, "id" | "title"> {
  /** The release this track belongs to, when it belongs to one. */
  volume?: string | null;
  releaseId?: string | null;
  releaseKind?: string | null;
  trackNumber?: number | null;
}

interface Group {
  key: string;
  title: string;
  songs: SongOption[];
}

const SINGLES = "__singles__";

function groupSongs(songs: SongOption[]): Group[] {
  const groups = new Map<string, Group>();

  for (const song of songs) {
    const isSingle =
      (song.releaseKind ?? "").toLowerCase() === "single" ||
      (song.volume ?? "").trim().toLowerCase() === "single" ||
      (!song.releaseId && !song.volume);

    const key = isSingle ? SINGLES : String(song.releaseId || song.volume);
    const title = isSingle ? "Singles" : String(song.volume || "Release");

    const group = groups.get(key) ?? { key, title, songs: [] };
    group.songs.push(song);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.songs.sort((a, b) => {
      const ta = a.trackNumber ?? Number.MAX_SAFE_INTEGER;
      const tb = b.trackNumber ?? Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      return a.title.localeCompare(b.title);
    });
  }

  // Releases first, in name order, then the singles at the bottom where they
  // are easy to find because there is only ever one of them.
  return [...groups.values()].sort((a, b) => {
    if (a.key === SINGLES) return 1;
    if (b.key === SINGLES) return -1;
    return a.title.localeCompare(b.title);
  });
}

export function BattleSongPicker({
  songs,
  value,
  onChange,
  takenIds = [],
  disabled = false,
  placeholder = "Select song",
  emptyLabel = "No songs on this artist yet",
}: {
  songs: SongOption[];
  value: string;
  onChange: (songId: string) => void;
  /** Songs already picked for another round on this side. */
  takenIds?: string[];
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupSongs(songs), [songs]);
  const chosen = songs.find((s) => s.id === value) ?? null;
  const taken = new Set(takenIds.filter((id) => id && id !== value));

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        disabled={disabled || songs.length === 0}
        className="flex w-full min-h-12 items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Music className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate ${chosen ? "" : "text-muted-foreground"}`}>
          {chosen ? chosen.title : songs.length === 0 ? emptyLabel : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="max-h-[60vh] w-[min(22rem,90vw)] overflow-y-auto">
        {groups.length === 0 && <DropdownMenuLabel className="text-muted-foreground">{emptyLabel}</DropdownMenuLabel>}

        {groups.map((group) => (
          <DropdownMenuSub key={group.key}>
            <DropdownMenuSubTrigger className="gap-2">
              <Disc3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{group.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{group.songs.length}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[60vh] w-[min(20rem,85vw)] overflow-y-auto">
              <DropdownMenuLabel className="truncate text-xs uppercase tracking-wide text-muted-foreground">
                {group.title}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {group.songs.map((song) => {
                const isTaken = taken.has(song.id);
                return (
                  <DropdownMenuItem
                    key={song.id}
                    disabled={isTaken}
                    onSelect={() => {
                      if (isTaken) return;
                      onChange(song.id);
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    {song.trackNumber ? (
                      <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{song.trackNumber}</span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{song.title}</span>
                    {isTaken && <span className="shrink-0 text-[11px] text-muted-foreground">picked</span>}
                    {song.id === value && !isTaken && <span className="shrink-0 text-[11px] text-primary">chosen</span>}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default BattleSongPicker;
