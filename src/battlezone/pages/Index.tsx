import { HelpCircle, Play, Zap } from "lucide-react";
import AppLink from "@/battlezone/components/AppLink";
import Navbar from "@/battlezone/components/Navbar";
import Footer from "@/battlezone/components/Footer";
import CountryChips from "@/battlezone/components/CountryChips";
import SectionHeader from "@/battlezone/components/SectionHeader";
import wavewarzLogo from "@/battlezone/assets/WaveWarz Africa music logo transparent.png";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";

const Index = () => {
  const { isEmbedded } = useEmbedMode();
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
              <a
                href="https://www.wavewarz.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary/90 transition-all hover:shadow-[0_0_25px_hsl(var(--neon-green)/0.3)]"
              >
                <Play className="h-4 w-4" /> Join Live Battle
              </a>
              <a
                href="https://www.wavewarz.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-bold text-foreground hover:bg-muted transition-colors"
              >
                <Zap className="h-4 w-4" /> Host a Battle
              </a>
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
        <section className="rounded-2xl border border-primary/20 bg-card/70 p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionHeader
              title="Countries Live & Coming Soon"
              subtitle="WaveWarz Africa rollout by country."
            />
            <a
              href="https://www.wavewarz.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20"
            >
              Submit Your Country
            </a>
          </div>
          <CountryChips />
        </section>

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
      </div>

      {!isEmbedded && <Footer />}
    </div>
  );
};

export default Index;
