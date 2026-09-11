import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Disc3, Music } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/battlezone/components/ui/sheet";
import type { Song } from "@/data/musicData";

/**
 * Picking a song for a battle, in the order the music is actually in.
 *
 * One flat list of every record an artist ever made is a pile, not a list. A
 * catalogue has shape: releases with their tracks in order, and the singles
 * standing on their own. So this opens on the releases, and a release opens to
 * its own tracks.
 *
 * WHY A SHEET AND NOT A DROPDOWN. The first version of this used nested hover
 * submenus. They portal out of the battle zone's own theme, they need a mouse,
 * and on the host page they left the host with no way to pick a song at all.
 * A sheet is what the rest of this app already opens (the stats tiles, the
 * trading ground), it works with a thumb, and it has room for the artwork.
 */

export interface SongOption extends Pick<Song, "id" | "title"> {
  coverImage?: string | null;
  volume?: string | null;
  releaseId?: string | null;
  releaseKind?: string | null;
  trackNumber?: number | null;
}

interface Group {
  key: string;
  title: string;
  cover: string | null;
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
    const group = groups.get(key) ?? { key, title, cover: song.coverImage ?? null, songs: [] };
    if (!group.cover && song.coverImage) group.cover = song.coverImage;
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

  // Releases first in name order, then the singles at the bottom where they are
  // easy to find because there is only ever one of them.
  return [...groups.values()].sort((a, b) => {
    if (a.key === SINGLES) return 1;
    if (b.key === SINGLES) return -1;
    return a.title.localeCompare(b.title);
  });
}

function Art({ src, className = "", rounded = "rounded-lg" }: { src?: string | null; className?: string; rounded?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={`flex shrink-0 items-center justify-center bg-muted ${rounded} ${className}`} aria-hidden="true">
        <Music className="h-4 w-4 text-muted-foreground" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 object-cover ${rounded} ${className}`}
    />
  );
}

export function BattleSongPicker({
  songs,
  value,
  onChange,
  takenIds = [],
  disabled = false,
  placeholder = "Pick a song",
  emptyLabel = "No songs on this artist yet",
  artistName,
}: {
  songs: SongOption[];
  value: string;
  onChange: (songId: string) => void;
  /** Songs already picked for another round on this side. */
  takenIds?: string[];
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  artistName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const groups = useMemo(() => groupSongs(songs), [songs]);
  const chosen = songs.find((s) => s.id === value) ?? null;
  const taken = new Set(takenIds.filter((id) => id && id !== value));
  const group = groups.find((g) => g.key === openGroup) ?? null;

  const close = () => {
    setOpen(false);
    setOpenGroup(null);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled || songs.length === 0}
        onClick={() => setOpen(true)}
        className="flex w-full min-h-14 items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Art src={chosen?.coverImage} className="h-10 w-10" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${chosen ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            {chosen ? chosen.title : songs.length === 0 ? emptyLabel : placeholder}
          </span>
          {chosen && (
            <span className="block truncate text-xs text-muted-foreground">
              {chosen.volume || "Single"}
            </span>
          )}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              {group ? (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenGroup(null)}
                    aria-label="Back to the catalogues"
                    className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <span className="truncate">{group.title}</span>
                </>
              ) : (
                <span className="truncate">{artistName ? `${artistName}, pick a song` : "Pick a song"}</span>
              )}
            </SheetTitle>
          </SheetHeader>

          {!group && (
            <ul className="mt-3 space-y-2 pb-3">
              {groups.length === 0 && <li className="text-sm text-muted-foreground">{emptyLabel}</li>}
              {groups.map((g) => (
                <li key={g.key}>
                  <button
                    type="button"
                    onClick={() => setOpenGroup(g.key)}
                    className="flex w-full min-h-16 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <Art src={g.cover} className="h-12 w-12" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{g.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {g.songs.length} {g.songs.length === 1 ? "song" : "songs"}
                        {g.songs.some((s) => s.id === value) ? " · one picked" : ""}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {group && (
            <ul className="mt-3 space-y-1.5 pb-3">
              {group.songs.map((song) => {
                const isTaken = taken.has(song.id);
                const isChosen = song.id === value;
                return (
                  <li key={song.id}>
                    <button
                      type="button"
                      disabled={isTaken}
                      onClick={() => {
                        onChange(song.id);
                        close();
                      }}
                      className={`flex w-full min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        isChosen ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                      } ${isTaken ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      {song.trackNumber ? (
                        <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{song.trackNumber}</span>
                      ) : (
                        <Art src={song.coverImage} className="h-9 w-9" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{song.title}</span>
                      {isTaken && <span className="shrink-0 text-[11px] text-muted-foreground">picked for another round</span>}
                      {isChosen && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!group && groups.length > 0 && (
            <p className="flex items-center gap-1.5 pb-2 text-[11px] text-muted-foreground">
              <Disc3 className="h-3.5 w-3.5" aria-hidden="true" /> Tap a release to see its tracks.
            </p>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

export default BattleSongPicker;
