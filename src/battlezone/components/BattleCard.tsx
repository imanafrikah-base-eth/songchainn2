import { Users, Music, Trophy } from "lucide-react";
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
    <AppLink to={isLive ? `/entry/${battle.id}` : `/battle/${battle.id}`} className="group block rounded-2xl border border-border bg-card/80 p-5 backdrop-blur transition-all hover:border-primary/30 hover:shadow-[0_0_30px_hsl(var(--neon-green)/0.08)]">
      <div className="flex items-center justify-between mb-3">
        {isLive && <LiveBadge />}
        {isEnded && (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            Ended
          </span>
        )}
        <span className="text-xs text-muted-foreground">{battle.region}</span>
      </div>

      <h3 className="text-lg font-bold text-foreground mb-4">{battle.title}</h3>

      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex flex-col items-center gap-2 flex-1">
          <ArtistAvatar name={battle.artistA.name} image={battle.artistA.image} side="A" />
          <span className="text-sm font-semibold text-foreground text-center">{battle.artistA.name}</span>
          <span className="text-xs text-muted-foreground">{battle.songA}</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-display font-bold text-muted-foreground">VS</span>
          {isEnded && battle.winner && (
            <span className="text-[10px] font-semibold text-neon-gold text-center">
              {battle.winner === "A" ? battle.artistA.name : battle.artistB.name} wins
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 flex-1">
          <ArtistAvatar name={battle.artistB.name} image={battle.artistB.image} side="B" />
          <span className="text-sm font-semibold text-foreground text-center">{battle.artistB.name}</span>
          <span className="text-xs text-muted-foreground">{battle.songB}</span>
        </div>
      </div>

      {totalVotes > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{battle.votesA.toLocaleString()}</span>
            <span>{battle.votesB.toLocaleString()}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
            <div className="bg-primary h-full rounded-l-full transition-all" style={{ width: `${pctA}%` }} />
            <div className="bg-secondary h-full rounded-r-full transition-all" style={{ width: `${100 - pctA}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {battle.listeners.toLocaleString()}</span>
        <span className="flex items-center gap-1"><Music className="h-3 w-3" /> {battle.host}</span>
      </div>

      <div className="mt-4 text-center">
        <span className="text-sm font-semibold text-primary group-hover:text-glow-green transition-all">
          {isLive ? "Join Room ->" : isEnded ? "View Results ->" : "View Battle ->"}
        </span>
      </div>
    </AppLink>
  );
};

export default BattleCard;
