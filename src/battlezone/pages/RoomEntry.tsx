import { ArrowLeft, ExternalLink, Info, Mic, Radio, Zap } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import AppLink from "@/battlezone/components/AppLink";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";
import Navbar from "@/battlezone/components/Navbar";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import { useBattle } from "@/battlezone/hooks/useBattles";

const RoomEntry = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { isEmbedded, embedTo } = useEmbedMode();
  const { data: battle, isLoading } = useBattle(roomId);

  const enterRoom = () => {
    if (!roomId) return;
    navigate(embedTo(`/room/${roomId}`));
  };

  return (
    <div className="min-h-screen bg-background">
      {isEmbedded ? <EmbedTopBar title="WaveWarz Africa" /> : <Navbar />}
      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <AppLink
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to BattleZone
        </AppLink>

        <section className="rounded-2xl border border-primary/25 bg-card/70 p-6 backdrop-blur">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Zap className="h-3.5 w-3.5" /> WaveWarz Africa Entry
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-black text-foreground">
            Join Or Launch Battles, Then Enter The Room
          </h1>
          <p className="mt-2 text-sm md:text-base text-muted-foreground">
            WaveWarz Africa extends the global WaveWarz battle format for African creators, hosts, speakers, and fans.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={enterRoom}
              disabled={!battle || battle.status !== "live" || isLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Radio className="h-4 w-4" /> Enter Live Room
            </button>
            <AppLink
              to="/host/create"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <Mic className="h-4 w-4" /> Create New Battle
            </AppLink>
            {roomId && (
              <AppLink
                to={`/battle/${roomId}`}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Info className="h-4 w-4" /> Battle Details
              </AppLink>
            )}
          </div>

          {battle && battle.status !== "live" && (
            <p className="mt-3 text-xs text-amber-300">
              This battle is currently marked as {battle.status}. Enter room is enabled only for live battles.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card/50 p-6">
          <h2 className="text-lg font-bold text-foreground mb-3">About WaveWarz & WaveWarz Africa</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              WaveWarz is a live battle music experience where hosts run rooms, speakers perform, and audiences vote in real
              time.
            </p>
            <p>
              WaveWarz Africa brings this format to African markets with local artist discovery, region-based battles, and
              community-led hosting.
            </p>
            <a
              href="https://www.wavewarz.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Learn more on wavewarz.com <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>
      </main>
    </div>
  );
};

export default RoomEntry;
