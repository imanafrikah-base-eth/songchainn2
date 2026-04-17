import { useParams } from "react-router-dom";
import { ArrowLeft, Users, Share2, Play, Trophy } from "lucide-react";
import Navbar from "@/battlezone/components/Navbar";
import Footer from "@/battlezone/components/Footer";
import LiveBadge from "@/battlezone/components/LiveBadge";
import { useBattle } from "@/battlezone/hooks/useBattles";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";
import AppLink from "@/battlezone/components/AppLink";

const BattleDetail = () => {
  const { isEmbedded } = useEmbedMode();
  const { battleId } = useParams();
  const { data: battle, isLoading } = useBattle(battleId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading battle...</p>
      </div>
    );
  }

  if (!battle) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Battle not found.</p>
          <AppLink to="/" className="text-primary hover:underline">Go Home</AppLink>
        </div>
      </div>
    );
  }

  const totalVotes = battle.votesA + battle.votesB;
  const pctA = totalVotes ? Math.round((battle.votesA / totalVotes) * 100) : 50;

  return (
    <div className="min-h-screen bg-background">
      {isEmbedded ? <EmbedTopBar title="Battle Details" /> : <Navbar />}
      <div className={`mx-auto max-w-4xl px-4 ${isEmbedded ? "py-6" : "py-12"} space-y-8`}>
        <AppLink to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </AppLink>

        <div className="flex flex-wrap items-center gap-3">
          {battle.status === "live" && <LiveBadge />}
          {battle.status === "ended" && <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">Ended</span>}
          {battle.status === "upcoming" && <span className="rounded-full bg-secondary/20 px-3 py-1 text-xs font-semibold text-secondary">Upcoming</span>}
          <span className="text-xs text-muted-foreground">{battle.region}</span>
        </div>

        <h1 className="text-3xl font-display font-black text-foreground">{battle.title}</h1>

        <div className="grid grid-cols-3 gap-6 items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <img src={battle.artistA.image} alt={battle.artistA.name} className="h-24 w-24 rounded-full object-cover border-2 border-primary/50" />
            <h3 className="font-bold text-foreground">{battle.artistA.name}</h3>
            <span className="text-xs text-muted-foreground">{battle.songA}</span>
            <span className="text-xs text-muted-foreground">{battle.artistA.region}</span>
            {battle.winner === "A" && <span className="rounded-full bg-neon-gold/20 px-3 py-1 text-xs font-bold text-neon-gold">ðŸ† Winner</span>}
          </div>
          <div className="flex flex-col items-center">
            <span className="text-2xl font-display font-bold text-muted-foreground">VS</span>
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <img src={battle.artistB.image} alt={battle.artistB.name} className="h-24 w-24 rounded-full object-cover border-2 border-secondary/50" />
            <h3 className="font-bold text-foreground">{battle.artistB.name}</h3>
            <span className="text-xs text-muted-foreground">{battle.songB}</span>
            <span className="text-xs text-muted-foreground">{battle.artistB.region}</span>
            {battle.winner === "B" && <span className="rounded-full bg-neon-gold/20 px-3 py-1 text-xs font-bold text-neon-gold">ðŸ† Winner</span>}
          </div>
        </div>

        {totalVotes > 0 && (
          <div>
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>{battle.votesA.toLocaleString()} votes</span>
              <span>{battle.votesB.toLocaleString()} votes</span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden flex">
              <div className="bg-primary h-full rounded-l-full" style={{ width: `${pctA}%` }} />
              <div className="bg-secondary h-full rounded-r-full" style={{ width: `${100 - pctA}%` }} />
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card/80 p-6 space-y-2 text-sm text-muted-foreground backdrop-blur">
          <p><Users className="inline h-4 w-4 mr-1" /> {battle.listeners.toLocaleString()} listeners</p>
          <p>Host: <span className="text-foreground font-medium">{battle.host}</span></p>
          {battle.coHosts.length > 0 && <p>Co-hosts: <span className="text-foreground">{battle.coHosts.join(", ")}</span></p>}
          <p>Round {battle.round}/{battle.totalRounds}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-6 backdrop-blur">
          <h3 className="font-bold text-foreground mb-3">Battle Rules</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>3 rounds per battle</li>
            <li>Audience votes live each round</li>
            <li>Most total votes wins</li>
            <li>Host can end the battle early</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-4">
          {battle.status === "live" && (
            <AppLink to={`/entry/${battle.id}`} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary/90 transition-all">
              <Play className="h-4 w-4" /> Enter Room
            </AppLink>
          )}
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-bold text-foreground hover:bg-muted transition-colors">
            <Trophy className="h-4 w-4" /> Vote Now
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>
      </div>
      {!isEmbedded && <Footer />}
    </div>
  );
};

export default BattleDetail;
