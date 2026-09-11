import { useState } from "react";
import { Radio, Users, Headphones, Swords } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/battlezone/components/ui/sheet";
import AppLink from "@/battlezone/components/AppLink";
import { useBattles } from "@/battlezone/hooks/useBattles";

/**
 * What is actually happening in WaveWarz Africa, right now.
 *
 * Every figure here is counted, not inferred. The old row multiplied the live
 * battle count by two and called it artists, and its fourth tile was the word
 * "ZM" sitting where a number should be. It also read "0 0 0 ZM" on a quiet
 * night, which tells a first-time visitor nothing except that the place is
 * empty.
 *
 * Colour carries one meaning and one only: red is live. When nothing is on
 * air the row says so in words and points at the two things a person can do
 * about it, and the tiles go quiet rather than pretending.
 */

interface Tile {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
  /** Red only while it is genuinely live. */
  live?: boolean;
  meaning: string;
  action?: { label: string; to: string };
}

const StatsRow = () => {
  const { data: liveBattles = [] } = useBattles("live");
  const { data: allBattles = [] } = useBattles();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const listeners = liveBattles.reduce((sum, b) => sum + b.listeners, 0);
  // The artists actually in a live battle, counted once each, rather than two
  // per battle whether or not that is who is in them.
  const artistsOn = new Set(
    liveBattles.flatMap((b) => [b.artistA?.name, b.artistB?.name].filter(Boolean) as string[]),
  ).size;
  const anyLive = liveBattles.length > 0;

  const tiles: Tile[] = [
    {
      key: "rooms",
      icon: Radio,
      label: liveBattles.length === 1 ? "Battle live" : "Battles live",
      value: String(liveBattles.length),
      live: anyLive,
      meaning: anyLive
        ? "Battles on air this minute. Walk into any of them, listen, vote and talk in the room while it runs."
        : "Nothing is on air this minute. Battles are hosted by artists and their crews, and anyone can start one.",
      action: anyLive ? { label: "Go to a live battle", to: "/battles/live" } : { label: "Host a battle", to: "/host" },
    },
    {
      key: "listeners",
      icon: Headphones,
      label: "Listening now",
      value: listeners.toLocaleString(),
      live: listeners > 0,
      meaning:
        "People in a battle room in the last minute, counted from the rooms themselves. It moves as people come and go.",
      action: anyLive ? { label: "Join them", to: "/battles/live" } : undefined,
    },
    {
      key: "artists",
      icon: Users,
      label: artistsOn === 1 ? "Artist on" : "Artists on",
      value: String(artistsOn),
      live: artistsOn > 0,
      meaning:
        "The artists in a live battle right now, each counted once. A battle is two sides, and the same artist can be in more than one.",
      action: anyLive ? { label: "See who is on", to: "/battles/live" } : undefined,
    },
    {
      key: "all",
      icon: Swords,
      label: allBattles.length === 1 ? "Battle so far" : "Battles so far",
      value: allBattles.length.toLocaleString(),
      meaning:
        "Every battle ever held here, live and finished. The verdicts, the scorecards and the crowd's vote all stay on the results page.",
      action: { label: "See the results", to: "/battles/results" },
    },
  ];

  const open = tiles.find((t) => t.key === openKey) ?? null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const tone = tile.live ? "text-live" : "text-muted-foreground";
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => setOpenKey(tile.key)}
              aria-label={`${tile.label}: ${tile.value}. What this means.`}
              className="flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-4 py-5 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <Icon className={`h-5 w-5 ${tone}`} aria-hidden="true" />
              <span className="font-display text-2xl font-bold tabular-nums text-foreground">{tile.value}</span>
              <span className="text-xs text-muted-foreground">{tile.label}</span>
            </button>
          );
        })}
      </div>

      {!anyLive && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Nothing is live right now.{" "}
          <AppLink to="/host" className="font-semibold text-primary hover:underline">
            Host a battle
          </AppLink>{" "}
          or{" "}
          <AppLink to="/battles/results" className="font-semibold text-primary hover:underline">
            see how the last ones went
          </AppLink>
          .
        </p>
      )}

      <Sheet open={Boolean(open)} onOpenChange={(v) => !v && setOpenKey(null)}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          {open && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2.5">
                  <open.icon className={`h-5 w-5 ${open.live ? "text-live" : "text-muted-foreground"}`} aria-hidden="true" />
                  {open.label}
                </SheetTitle>
              </SheetHeader>
              <p className="mt-2 font-display text-4xl font-bold tabular-nums text-foreground">{open.value}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{open.meaning}</p>
              {open.action && (
                <div className="mt-5 pb-2">
                  <AppLink
                    to={open.action.to}
                    onClick={() => setOpenKey(null)}
                    className="flex h-11 w-full items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {open.action.label}
                  </AppLink>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export default StatsRow;
