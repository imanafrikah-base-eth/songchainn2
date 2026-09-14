import { Crown, Gavel, Heart } from "lucide-react";
import type { Battle } from "@/battlezone/hooks/useBattles";

/**
 * The judges' verdicts and the final score of an ended battle.
 *
 * One component for the battle page and the live room, so what the host reads
 * out in the room is exactly what the page says afterwards.
 */
export function BattleResults({ battle }: { battle: Battle }) {
  if (battle.status !== "ended") return null;

  if (!battle.hikuluVerdict) {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 flex items-center gap-3">
        <Crown className="h-5 w-5 text-amber-400 shrink-0" />
        <p className="text-sm text-muted-foreground">$HIKULU and NAKULU are weighing their verdicts on this battle. They land here in a moment.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-amber-400/50 bg-gradient-to-b from-amber-400/10 to-transparent p-6 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-400" />
          <h3 className="font-black text-amber-400">$HIKULU's Verdict</h3>
        </div>
        <p className="text-sm italic text-foreground">"{battle.hikuluVerdict}"</p>
      </div>
      {battle.nakuluVerdict && (
        <div className="space-y-1 rounded-xl border border-rose-400/30 bg-rose-400/5 p-3">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-rose-400" />
            <h3 className="font-black text-rose-400">NAKULU's Verdict</h3>
          </div>
          <p className="text-sm italic text-foreground">"{battle.nakuluVerdict}"</p>
        </div>
      )}
      {/*
        The Council of Elders only appears when it actually sat, which
        is when $HIKULU and NAKULU picked opposite winners or came out
        level. When it sat, it decided.
      */}
      {battle.councilVerdicts.length > 0 && (
        <div className="space-y-3 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3">
          <div className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-emerald-400" />
            <h3 className="font-black text-emerald-400">The Council of Elders was summoned</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            The bench was split, so the high council came down to settle it.
          </p>
          <div className="space-y-2">
            {battle.councilVerdicts.map((elder) => (
              <div key={elder.key} className="rounded-lg border border-border bg-background/40 p-2.5">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs font-black text-foreground">{elder.name}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {battle.artistA.name} {elder.points_a}, {battle.artistB.name} {elder.points_b}
                  </span>
                </div>
                <p className="text-xs italic text-muted-foreground">"{elder.verdict}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-center">
          <p className="font-bold text-foreground">{battle.artistA.name}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {battle.votesA.toLocaleString()} votes + {battle.hikuluPointsA} $HIKULU + {battle.nakuluPointsA} NAKULU
            {battle.councilPointsA > 0 ? ` + ${battle.councilPointsA} council` : ""}
          </p>
          <p className="font-black text-primary text-lg">
            {(battle.votesA + battle.hikuluPointsA + battle.nakuluPointsA + battle.councilPointsA).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-secondary/30 bg-secondary/5 p-3 text-center">
          <p className="font-bold text-foreground">{battle.artistB.name}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {battle.votesB.toLocaleString()} votes + {battle.hikuluPointsB} $HIKULU + {battle.nakuluPointsB} NAKULU
            {battle.councilPointsB > 0 ? ` + ${battle.councilPointsB} council` : ""}
          </p>
          <p className="font-black text-secondary text-lg">
            {(battle.votesB + battle.hikuluPointsB + battle.nakuluPointsB + battle.councilPointsB).toLocaleString()}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground text-center">
        {battle.decidedBy === "council"
          ? "Settled by the Council of Elders. The judges heard the records, the crowd cast its own vote, and neither side of the bench could break it."
          : battle.decidedBy === "host"
            ? "Called by the host. Judge points and crowd votes are shown for the record."
            : "Final score: crowd votes plus judge points. The judges heard the records and never saw the votes."}
      </p>
    </div>
  );
}

export default BattleResults;
