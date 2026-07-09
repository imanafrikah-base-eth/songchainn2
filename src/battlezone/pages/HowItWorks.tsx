import { Users, Mic, Trophy, Crown, Shield, Hand, MessageSquare, Radio } from "lucide-react";
import Navbar from "@/battlezone/components/Navbar";
import Footer from "@/battlezone/components/Footer";
import CountryChips from "@/battlezone/components/CountryChips";
import AppLink from "@/battlezone/components/AppLink";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";
import { VOICE_ENABLED } from "@/battlezone/config";

const steps = VOICE_ENABLED
  ? [
      { icon: Users, title: "Join a Battle Room", desc: "Browse live battles and enter a room as an audience member. It's free and instant." },
      { icon: Mic, title: "Vote Live or Request to Speak", desc: "Cast your vote for your favourite artist. Request the mic to share your take." },
      { icon: Trophy, title: "See Results and Follow Artists", desc: "Watch the results unfold and follow winning artists on $ongChainn." },
    ]
  : [
      { icon: Users, title: "Join a Battle Room", desc: "Browse live battles and enter a room as an audience member. It's free and instant." },
      { icon: MessageSquare, title: "Vote and Chat Live", desc: "Cast your vote for your favourite artist and join the conversation in the live chat. Live audio plays on the host's X Space, tap Listen on X in the room." },
      { icon: Trophy, title: "See Results and Follow Artists", desc: "Watch the results unfold and follow winning artists on $ongChainn." },
    ];

const roles = VOICE_ENABLED
  ? [
      { icon: Crown, title: "Host", desc: "Creates the battle room, manages rounds, invites co-hosts, and declares results.", color: "text-neon-gold" },
      { icon: Shield, title: "Co-Host", desc: "Assists the host by managing speakers, muting participants, and keeping order.", color: "text-neon-cyan" },
      { icon: Hand, title: "Speaker", desc: "Approved audience members who get to speak live. Up to 5 at a time.", color: "text-primary" },
      { icon: MessageSquare, title: "Audience", desc: "Listeners who vote, react, and can request to speak.", color: "text-muted-foreground" },
    ]
  : [
      { icon: Crown, title: "Host", desc: "Creates the battle room, manages rounds, runs the X Space for live audio, and declares results.", color: "text-neon-gold" },
      { icon: Shield, title: "Co-Host", desc: "Assists the host by keeping the chat in order and hyping the battle.", color: "text-neon-cyan" },
      { icon: Radio, title: "X Space", desc: "The host goes live on an X Space for battle commentary. Tap Listen on X in the room to hear it.", color: "text-primary" },
      { icon: MessageSquare, title: "Audience", desc: "Fans who vote, react, and chat live while listening on the X Space.", color: "text-muted-foreground" },
    ];

const HowItWorks = () => {
  const { isEmbedded } = useEmbedMode();

  return (
    <div className="min-h-screen bg-background">
      {isEmbedded ? <EmbedTopBar title="How It Works" /> : <Navbar />}
      <div className={`mx-auto max-w-4xl px-4 ${isEmbedded ? "py-8" : "py-16"} space-y-16`}>
      <div className="text-center">
        <h1 className="text-4xl font-display font-black text-foreground mb-4">How WaveWarz Africa Works</h1>
        <p className="text-lg text-muted-foreground">Join live music battles, vote for your favorites, and discover Africa's hottest talent.</p>
      </div>

      {/* Steps */}
      <div className="grid gap-8 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="rounded-2xl border border-border bg-card/80 p-6 text-center backdrop-blur">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-display font-bold text-xl">
              {i + 1}
            </div>
            <s.icon className="mx-auto h-8 w-8 text-primary mb-3" />
            <h3 className="font-bold text-foreground mb-2">{s.title}</h3>
            <p className="text-sm text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Roles */}
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground mb-6 text-center">Participant Roles</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {roles.map((r) => (
            <div key={r.title} className="rounded-2xl border border-border bg-card/80 p-6 backdrop-blur flex gap-4">
              <r.icon className={`h-8 w-8 shrink-0 ${r.color}`} />
              <div>
                <h3 className={`font-bold ${r.color} mb-1`}>{r.title}</h3>
                <p className="text-sm text-muted-foreground">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Voting */}
      <div className="rounded-2xl border border-border bg-card/80 p-8 text-center backdrop-blur">
        <h2 className="text-2xl font-display font-bold text-foreground mb-4">Live Voting</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          During each round, audience members vote for Artist A or Artist B. Votes are tallied live with real-time percentage bars. The artist with the most votes wins the round.
        </p>
      </div>

      {/* Countries */}
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-display font-bold text-foreground">Available Countries</h2>
        <CountryChips />
      </div>

      {/* CTA */}
      <div className="flex flex-wrap justify-center gap-4">
        <AppLink to="/battles/live" className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary/90 transition-all">
          Browse Live Battles
        </AppLink>
        <AppLink to="/host/create" className="rounded-xl border border-border bg-card px-6 py-3 font-bold text-foreground hover:bg-muted transition-colors">
          Become a Host
        </AppLink>
        <AppLink to="/" className="rounded-xl border border-border bg-card px-6 py-3 font-medium text-muted-foreground hover:bg-muted transition-colors">
          Back to Home
        </AppLink>
      </div>
      </div>
      {!isEmbedded && <Footer />}
    </div>
  );
};

export default HowItWorks;
