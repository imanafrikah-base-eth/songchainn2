import { Users, Music } from "lucide-react";
import type { Battle } from "@/battlezone/hooks/useBattles";
import LiveBadge from "./LiveBadge";
import AppLink from "./AppLink";

const ArtistAvatar = ({ name, image, side }: { name: string; image: string; side: "A" | "B" }) => (
  image ? (
    <img src={image} alt={name} className={`h-14 w-14 rounded-full object-cover border-2 ${side === "A" ? "border-primary/50" : "border-secondary/50"}`} />
  ) : (
    <div className={`flex h-14 w-14 items-center justify-center rounded-full font-bold text-lg ${side === "A" ? "bg-primary/20 text-primary" : "bg-secondary/20 text-secondary"}`}>
      {name.charAt(0)}
    </div>
  )
);

const BattleCard = ({ battle }: { battle: Battle }) => {
  const isLive = battle.status === "live";
  const isEnded = battle.status === "ended";
  const totalVotes = battle.votesA + battle.votesB;
  const pctA = totalVotes ? Math.round((battle.votesA / totalVotes) * 100) : 50;

  return (
    <AppLink to={isLive ? `/entry/${battle.id}` : `/battle/${battle.id}`} className="group flex h-full flex-col rounded-2xl border border-border bg-card/80 p-5 backdrop-blur transition-all hover:border-primary/30 hover:shadow-[0_0_30px_hsl(var(--neon-green)/0.08)]">
      <div className="mb-3 flex min-h-6 items-center justify-between">
        {isLive && <LiveBadge />}
        {isEnded && (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            Ended
          </span>
        )}
        <span className="text-xs text-muted-foreground">{battle.region}</span>
      </div>

      <h3 className="mb-4 min-h-[3.5rem] text-lg font-bold leading-snug text-foreground">{battle.title}</h3>

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-col items-center gap-2">
          <ArtistAvatar name={battle.artistA.name} image={battle.artistA.image} side="A" />
          <span className="text-sm font-semibold text-foreground text-center">{battle.artistA.name}</span>
          <span className="text-center text-xs leading-tight text-muted-foreground">{battle.songA}</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-display font-bold text-muted-foreground">VS</span>
          {isEnded && battle.winner && (
            <span className="text-[10px] font-semibold text-neon-gold text-center">
              {battle.winner === "A" ? battle.artistA.name : battle.artistB.name} wins
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center gap-2">
          <ArtistAvatar name={battle.artistB.name} image={battle.artistB.image} side="B" />
          <span className="text-sm font-semibold text-foreground text-center">{battle.artistB.name}</span>
          <span className="text-center text-xs leading-tight text-muted-foreground">{battle.songB}</span>
        </div>
      </div>

      <div className="mb-4 min-h-[2.25rem]">
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>{battle.votesA.toLocaleString()}</span>
          <span>{battle.votesB.toLocaleString()}</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-l-full bg-primary transition-all" style={{ width: `${totalVotes > 0 ? pctA : 50}%` }} />
          <div className="h-full rounded-r-full bg-secondary transition-all" style={{ width: `${totalVotes > 0 ? 100 - pctA : 50}%` }} />
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {battle.listeners.toLocaleString()}</span>
        <span className="flex max-w-[55%] items-center gap-1 truncate text-right"><Music className="h-3 w-3 shrink-0" /> <span className="truncate">{battle.host}</span></span>
      </div>

      <div className="mt-auto border-t border-border/70 pt-3 text-center">
        <span className="inline-flex items-center justify-center text-sm font-semibold text-primary transition-all group-hover:text-glow-green">
          {isLive ? "Join Room" : isEnded ? "View Results" : "View Battle"}
        </span>
      </div>
    </AppLink>
  );
};

export default BattleCard;
