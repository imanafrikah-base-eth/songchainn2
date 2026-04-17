import { Zap, Play, HelpCircle } from "lucide-react";
import AppLink from "@/battlezone/components/AppLink";
import Navbar from "@/battlezone/components/Navbar";
import Footer from "@/battlezone/components/Footer";
import BattleCard from "@/battlezone/components/BattleCard";
import StatsRow from "@/battlezone/components/StatsRow";
import CountryChips from "@/battlezone/components/CountryChips";
import SectionHeader from "@/battlezone/components/SectionHeader";
import { useBattles } from "@/battlezone/hooks/useBattles";
import wavewarzLogo from "@/battlezone/assets/wavewarz-logo-2.png";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";

const Index = () => {
  const { isEmbedded } = useEmbedMode();
  const { data: liveBattles = [] } = useBattles("live");
  const { data: upcomingBattles = [] } = useBattles("upcoming");
  const { data: endedBattles = [] } = useBattles("ended");

  return (
    <div className="min-h-screen bg-background">
      {isEmbedded ? <EmbedTopBar title="BattleZone Home" /> : <Navbar />}

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-battle opacity-40" />
        <div className={`relative mx-auto max-w-7xl px-4 ${isEmbedded ? "py-10 md:py-14" : "py-20 md:py-28"} flex flex-col md:flex-row items-center gap-10`}>
          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
              <Zap className="h-3 w-3" /> WaveWarz Africa Battle Zone
            </div>
            <h1 className="text-4xl md:text-6xl font-display font-black text-foreground leading-tight mb-6">
              Prepare For The Next Music Battle Wave{" "}
              <span className="text-primary text-glow-green">Across Africa</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-lg">
              Compete. Vote. Host. Discover the hottest artists across Africa in real-time live battle rooms.
            </p>
            <div className="flex flex-wrap gap-4 justify-center md:justify-start">
              <AppLink to="/battles/live" className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary/90 transition-all hover:shadow-[0_0_25px_hsl(var(--neon-green)/0.3)]">
                <Play className="h-4 w-4" /> Join Live Battle
              </AppLink>
              <AppLink to="/host/create" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-bold text-foreground hover:bg-muted transition-colors">
                <Zap className="h-4 w-4" /> Host a Battle
              </AppLink>
              <AppLink to="/how-it-works" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-medium text-muted-foreground hover:bg-muted transition-colors">
                <HelpCircle className="h-4 w-4" /> How It Works
              </AppLink>
            </div>
          </div>
          <div className="flex-shrink-0">
            <img src={wavewarzLogo} alt="WaveWarz Africa Battle Zone" className="w-64 md:w-80 float-slow" />
          </div>
        </div>
      </section>

      <div className={`mx-auto max-w-7xl px-4 ${isEmbedded ? "space-y-10 pb-6" : "space-y-16"}`}>
        <StatsRow />
        <CountryChips />

        <section>
          <SectionHeader title="Live Now" subtitle="Join active battles happening right now" linkTo="/battles/live" linkLabel="All Live" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {liveBattles.map((b) => <BattleCard key={b.id} battle={b} />)}
          </div>
          {liveBattles.length === 0 && <p className="text-center text-muted-foreground py-6">No live battles right now.</p>}
        </section>

        <section>
          <SectionHeader title="Coming Soon" subtitle="Scheduled battles launching next" linkTo="/battles/upcoming" linkLabel="All Upcoming" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {upcomingBattles.map((b) => <BattleCard key={b.id} battle={b} />)}
          </div>
          {upcomingBattles.length === 0 && <p className="text-center text-muted-foreground py-6">No upcoming battles scheduled.</p>}
        </section>

        <section>
          <SectionHeader title="Passed Battles" subtitle="See completed battle outcomes" linkTo="/battles/results" linkLabel="All Results" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {endedBattles.map((b) => <BattleCard key={b.id} battle={b} />)}
          </div>
          {endedBattles.length === 0 && <p className="text-center text-muted-foreground py-6">No results yet.</p>}
        </section>

        <section className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5 p-10 text-center">
          <h2 className="text-2xl font-display font-bold text-foreground mb-3">Ready to Host?</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Create your own battle room, invite artists, and let Africa decide who wins.
          </p>
          <AppLink to="/host/create" className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3 font-bold text-primary-foreground hover:bg-primary/90 transition-all hover:shadow-[0_0_25px_hsl(var(--neon-green)/0.3)]">
            <Zap className="h-4 w-4" /> Host a Battle
          </AppLink>
        </section>
      </div>

      {!isEmbedded && <Footer />}
    </div>
  );
};

export default Index;
