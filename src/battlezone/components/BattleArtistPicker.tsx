import { useState } from "react";
import { Check, ChevronRight, Mic2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/battlezone/components/ui/sheet";

/**
 * Picking the artist in a corner, with their face on it.
 *
 * A battle is two artists, and a name in a grey dropdown is the driest way to
 * show one. Their picture is already in the catalogue, so the picker shows it,
 * and the corner shows it too the moment they are chosen.
 */

export interface ArtistOption {
  id: string;
  name: string;
  image?: string | null;
  region?: string | null;
}

function Face({ src, name, className }: { src?: string | null; name: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground ${className}`} aria-hidden="true">
        {name.trim().charAt(0).toUpperCase() || <Mic2 className="h-4 w-4" />}
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
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}

export function BattleArtistPicker({
  artists,
  value,
  onChange,
  label,
  disabled = false,
  placeholder = "Pick an artist",
}: {
  artists: ArtistOption[];
  value: string;
  onChange: (artistId: string) => void;
  /** Which corner this is, for the sheet's title. */
  label?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = artists.find((a) => a.id === value) ?? null;

  return (
    <>
      <button
        type="button"
        disabled={disabled || artists.length === 0}
        onClick={() => setOpen(true)}
        className="flex w-full min-h-14 items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Face src={chosen?.image} name={chosen?.name ?? "?"} className="h-10 w-10" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${chosen ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            {chosen ? chosen.name : placeholder}
          </span>
          {chosen?.region && <span className="block truncate text-xs text-muted-foreground">{chosen.region}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>{label ? `${label}: pick the artist` : "Pick the artist"}</SheetTitle>
          </SheetHeader>
          <ul className="mt-3 grid grid-cols-1 gap-2 pb-3 sm:grid-cols-2">
            {artists.length === 0 && <li className="text-sm text-muted-foreground">Nobody is ready for this stage yet.</li>}
            {artists.map((artist) => {
              const isChosen = artist.id === value;
              return (
                <li key={artist.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(artist.id);
                      setOpen(false);
                    }}
                    className={`flex w-full min-h-16 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      isChosen ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    <Face src={artist.image} name={artist.name} className="h-11 w-11" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{artist.name}</span>
                      {artist.region && <span className="block truncate text-xs text-muted-foreground">{artist.region}</span>}
                    </span>
                    {isChosen && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default BattleArtistPicker;
