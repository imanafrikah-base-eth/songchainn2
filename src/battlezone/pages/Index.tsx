import { useMemo, useState } from "react";
import { Zap, Play, HelpCircle, Radio, PlusCircle, ArrowRight } from "lucide-react";
import AppLink from "@/battlezone/components/AppLink";
import Navbar from "@/battlezone/components/Navbar";
import Footer from "@/battlezone/components/Footer";
import BattleCard from "@/battlezone/components/BattleCard";
import StatsRow from "@/battlezone/components/StatsRow";
import CountryChips from "@/battlezone/components/CountryChips";
import SectionHeader from "@/battlezone/components/SectionHeader";
import { useBattles } from "@/battlezone/hooks/useBattles";
import wavewarzLogo from "@/battlezone/assets/WaveWarz Africa music logo transparent.png";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";

const Index = () => {
  const { isEmbedded } = useEmbedMode();
  const { data: liveBattles = [] } = useBattles("live");
  const { data: upcomingBattles = [] } = useBattles("upcoming");
  const { data: endedBattles = [] } = useBattles("ended");
  const [selectedLiveBattleId, setSelectedLiveBattleId] = useState("");
  const [manualBattleId, setManualBattleId] = useState("");

  const featuredLiveBattles = useMemo(() => liveBattles.slice(0, 8), [liveBattles]);

  const onboardingSteps = [
    {
      title: "Connect Wallet",
      copy: "Use Phantom or Solflare to join battles and support artists in real time.",
    },
    {
      title: "Join Or Host",
      copy: "Jump into a live room, or launch your own battle with co-hosts and audience voting.",
    },
    {
      title: "Go Live Voice",
      copy: "Use LiveKit-powered room audio so hosts, speakers, and fans can react instantly.",
    },
    {
      title: "Grow Community",
      copy: "WaveWarz Africa helps onboard local creators and cities into the battle ecosystem.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {isEmbedded ? <EmbedTopBar title="BattleZone Home" /> : <Navbar />}

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-battle opacity-40" />
        <div className={`relative mx-auto max-w-7xl px-4 ${isEmbedded ? "py-8 md:py-14" : "py-12 md:py-28"} flex flex-col md:flex-row items-center gap-8 md:gap-10`}>
          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
              <Zap className="h-3 w-3" /> WaveWarz Africa BattleZone
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-black text-foreground leading-tight mb-6">
              Prepare for the Next Wave of Music Battles{" "}
              <span className="text-primary text-glow-green">Across Africa</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground mb-8 max-w-lg">
              Compete. Vote. Host. Discover the hottest artists across Africa in real-time live battle rooms.
            </p>
            <div className="flex w-full flex-wrap gap-3 sm:gap-4 justify-center md:justify-start">
              <AppLink to="/battles/live" className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary/90 transition-all hover:shadow-[0_0_25px_hsl(var(--neon-green)/0.3)]">
                <Play className="h-4 w-4" /> Join Live Battle
              </AppLink>
              <AppLink to="/host/create" className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-bold text-foreground hover:bg-muted transition-colors">
                <Zap className="h-4 w-4" /> Host a Battle
              </AppLink>
              <AppLink to="/how-it-works" className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-medium text-muted-foreground hover:bg-muted transition-colors">
                <HelpCircle className="h-4 w-4" /> How It Works
              </AppLink>
            </div>
          </div>
          <div className="flex-shrink-0">
            <img src={wavewarzLogo} alt="WaveWarz Africa BattleZone" className="w-48 max-w-full sm:w-64 md:w-80 float-slow" />
          </div>
        </div>
      </section>

      <div className={`mx-auto max-w-7xl px-4 ${isEmbedded ? "space-y-10 pb-6" : "space-y-12 md:space-y-16 pb-10"}`}>
        <StatsRow />
        <CountryChips />

        <section className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-secondary/10 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeader
              title="WaveWarz Africa Onboarding"
              subtitle="Everything needed to onboard, then create or join on this same page."
            />
          </div>
          <div className="mt-3 overflow-x-auto pb-2">
            <div className="flex min-w-full gap-3">
              {onboardingSteps.map((step) => (
                <article
                  key={step.title}
                  className="min-w-[240px] flex-1 rounded-xl border border-border bg-card/70 p-4 sm:min-w-[260px]"
                >
                  <p className="text-sm font-bold text-foreground">{step.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{step.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-primary/20 bg-card/70 p-5 sm:p-6">
          <h2 className="text-xl font-display font-bold text-foreground">Join Or Create From Here</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a live battle, enter by room ID, or launch a new battle without leaving this page.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="text-sm font-semibold text-foreground">Join Selected Live Battle</p>
              <select
                value={selectedLiveBattleId}
                onChange={(event) => setSelectedLiveBattleId(event.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="">Select live battle...</option>
                {liveBattles.map((battle) => (
                  <option key={battle.id} value={battle.id}>
                    {battle.title}
                  </option>
                ))}
              </select>
              <AppLink
                to={selectedLiveBattleId ? `/entry/${selectedLiveBattleId}` : "#"}
                className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${
                  selectedLiveBattleId
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "pointer-events-none bg-muted text-muted-foreground"
                }`}
              >
                <Radio className="h-4 w-4" /> Enter Live Room
              </AppLink>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="text-sm font-semibold text-foreground">Enter By Battle ID</p>
              <input
                value={manualBattleId}
                onChange={(event) => setManualBattleId(event.target.value)}
                placeholder="Paste room/battle ID"
                className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
              />
              <AppLink
                to={manualBattleId.trim() ? `/entry/${manualBattleId.trim()}` : "#"}
                className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${
                  manualBattleId.trim()
                    ? "bg-secondary text-secondary-foreground hover:bg-secondary/90"
                    : "pointer-events-none bg-muted text-muted-foreground"
                }`}
              >
                <ArrowRight className="h-4 w-4" /> Open Battle Entry
              </AppLink>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="text-sm font-semibold text-foreground">Create A New Battle</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Host flow includes artist/song selection, co-host invites, and launch-now controls.
              </p>
              <AppLink
                to="/host/create"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                <PlusCircle className="h-4 w-4" /> Create Battle
              </AppLink>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader
            title="Live Scroller"
            subtitle="Swipe/scroll through active rooms and jump in quickly."
            linkTo="/battles/live"
            linkLabel="All Live"
          />
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-4">
              {featuredLiveBattles.map((b) => (
                <div key={b.id} className="min-w-[280px] sm:min-w-[320px]">
                  <BattleCard battle={b} />
                </div>
              ))}
              {featuredLiveBattles.length === 0 && (
                <p className="w-full py-6 text-center text-muted-foreground">No live battles right now.</p>
              )}
            </div>
          </div>
        </section>

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
          <SectionHeader title="Past Battles" subtitle="See completed battle outcomes" linkTo="/battles/results" linkLabel="All Results" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {endedBattles.map((b) => <BattleCard key={b.id} battle={b} />)}
          </div>
          {endedBattles.length === 0 && <p className="text-center text-muted-foreground py-6">No results yet.</p>}
        </section>

        <section className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5 p-6 sm:p-10 text-center">
          <h2 className="text-2xl font-display font-bold text-foreground mb-3">Ready to Host?</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Create your own battle room, invite artists, and let Africa decide who wins.
          </p>
          <AppLink to="/host/create" className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3 font-bold text-primary-foreground hover:bg-primary/90 transition-all hover:shadow-[0_0_25px_hsl(var(--neon-green)/0.3)]">
            <Zap className="h-4 w-4" /> Host a Battle
          </AppLink>
        </section>
      </div>

      {!isEmbedded && <Footer />}
    </div>
  );
};

export default Index;
