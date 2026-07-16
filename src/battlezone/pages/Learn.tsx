import {
  Zap, Play, Crown, Mic, Flame, Radio, MessageSquare, Trophy,
  TrendingUp, Lock, Lightbulb, HandHeart, Send, GraduationCap,
} from "lucide-react";
import Navbar from "@/battlezone/components/Navbar";
import Footer from "@/battlezone/components/Footer";
import AppLink from "@/battlezone/components/AppLink";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";

/* Learn WaveWarz Africa Battle Zone: the onboarding guide as a live page.
   Content mirrors the published onboarding PDF, keep the two in sync. */

const flowSteps = [
  { emoji: "\u{1F451}", title: "Host creates", desc: "A host sets up the battle: artists, songs, region" },
  { emoji: "\u{1F534}", title: "Room goes live", desc: "Voice runs on the host's X Space" },
  { emoji: "\u{1F525}", title: "Crowd votes", desc: "Audience votes and chats in real time" },
  { emoji: "⚖️", title: "$HIKULU speaks", desc: "The AI judge drops his verdict" },
  { emoji: "\u{1F3C6}", title: "Results drop", desc: "Winner posted to the feed and results page" },
];

const roomGuide = [
  { title: "Live badge and round tracker", desc: "Quick battles are one round. Community battles run three rounds, one song per round from each artist." },
  { title: "Listen on X is your speaker", desc: "The live voice room runs on the host's X Space. Tap it to hear the songs, the commentary and the trash talk. Keep this tab open to vote and chat while you listen." },
  { title: "The face-off", desc: "Both artists, their songs and the live vote meter. Watch it swing in real time as votes land." },
  { title: "The vote buttons", desc: "One vote per round, and you can change it any time before the round ends. Vote with your ears, not your friendships." },
  { title: "View Battle Charts", desc: "Opens the live trading screen for both battle songs. Totally optional, totally fun to watch." },
  { title: "The chat is the stadium", desc: "Hype your artist, react to bars, welcome newcomers. $HIKULU reads the room too. Keep it spicy, keep it respectful." },
];

const hostSteps = [
  { title: "Tap Host a Battle and name it", desc: "Give it a title with flavor (\"Lusaka Heat: The Zambian Showdown\") and pick the region." },
  { title: "Choose your battle type", desc: "Quick Battle: one song each, single round, winner takes it. Community Battle: three songs each, one per round across 3 rounds." },
  { title: "Pick the fighters", desc: "Select Artist A and Artist B from the $ongChainn catalog, then their battle songs. Quick needs one song each, Community needs three." },
  { title: "Start your X Space and paste the link", desc: "Open X, start a Space (you can schedule it too), copy its link into X Space Link. Listeners get the Listen on X button automatically while voting and chat stay in the room." },
  { title: "Launch now or schedule", desc: "Launch Battle Now goes live instantly and notifies the community feed. Or schedule it and it sits in Upcoming until showtime." },
  { title: "Run the show from Host Controls", desc: "Advance rounds, watch the vote race, and end the battle when it is done (early if you must). Results post automatically." },
];

const cheatSheet = [
  { label: "Get in", audience: "Live Battles, then View Battle", host: "Host a Battle, then fill the form", speaker: "Listen on X, then request the mic" },
  { label: "Your job", audience: "Vote, chat, spread the word", host: "Launch, run rounds, declare results", speaker: "Commentate and hype the Space" },
  { label: "Voice", audience: "Listen on X", host: "Run the X Space", speaker: "Speak on the X Space" },
  { label: "Optional", audience: "Buy song coins, watch charts", host: "Schedule ahead, invite co-hosts", speaker: "Rep an artist's side" },
];

const StepNum = ({ n, color = "primary" }: { n: number; color?: "primary" | "accent" }) => (
  <div
    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-sm ${
      color === "accent" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"
    }`}
  >
    {n}
  </div>
);

/* A faithful miniature of the live battle room so newcomers recognise it instantly */
const RoomMock = () => (
  <div className="w-full max-w-sm mx-auto rounded-3xl border-4 border-muted bg-background overflow-hidden shadow-2xl box-glow-green text-left">
    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
      <span className="text-muted-foreground">&larr;</span>
      <span className="font-bold text-sm text-foreground">Lusaka Heat</span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Round 1/3</span>
      <span className="ml-auto text-[10px] font-bold text-red-500 pulse-live">&#9679; LIVE</span>
    </div>
    <div className="m-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold text-foreground">Live audio is on X Spaces</p>
          <p className="text-[9px] text-muted-foreground leading-snug mt-0.5">Join the Space to hear the battle. Vote and chat right here while you listen.</p>
        </div>
        <span className="shrink-0 rounded-lg border border-border bg-black px-2.5 py-1.5 text-[10px] font-bold text-white whitespace-nowrap">&#120143; Listen on X</span>
      </div>
    </div>
    <div className="flex items-center justify-around px-2 pt-1">
      <div className="text-center">
        <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-sm font-black text-primary">SA</div>
        <p className="text-[11px] font-bold text-foreground">SAMMIE</p>
        <p className="text-[9px] text-muted-foreground">EYES ON ME</p>
      </div>
      <span className="text-sm font-black text-muted-foreground">VS</span>
      <div className="text-center">
        <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full border-2 border-secondary bg-secondary/10 text-sm font-black text-secondary">PR</div>
        <p className="text-[11px] font-bold text-foreground">PRP</p>
        <p className="text-[9px] text-muted-foreground">PANADO</p>
      </div>
    </div>
    <div className="mx-4 mt-2 flex h-2 overflow-hidden rounded-full">
      <div className="w-[58%] bg-primary" />
      <div className="w-[42%] bg-secondary" />
    </div>
    <div className="flex justify-between px-4 pt-1 text-[9px] text-muted-foreground">
      <span>124 votes</span><span>89 votes</span>
    </div>
    <div className="flex gap-2 px-3 pt-2">
      <div className="flex-1 rounded-lg bg-primary py-2 text-center text-[11px] font-black text-primary-foreground">Vote SAMMIE</div>
      <div className="flex-1 rounded-lg bg-secondary py-2 text-center text-[11px] font-black text-secondary-foreground">Vote PRP</div>
    </div>
    <div className="mx-3 mt-2 rounded-full border border-dashed border-accent/60 bg-accent/5 py-1.5 text-center text-[10px] font-bold text-accent">
      &#128200; View Battle Charts
    </div>
    <div className="mt-2 border-t border-border p-3">
      <p className="mb-2 text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Live chat</p>
      <div className="mb-1.5 flex items-start gap-1.5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary/20 text-[8px] font-black text-secondary">ZF</div>
        <div className="rounded-lg bg-muted px-2 py-1 text-[10px] text-foreground"><span className="block text-[8px] font-bold text-secondary">ZambiaFire</span>PRP is cooking this round &#128293;&#128293;</div>
      </div>
      <div className="mb-1.5 flex items-start gap-1.5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[8px] font-black text-primary">MW</div>
        <div className="rounded-lg bg-muted px-2 py-1 text-[10px] text-foreground"><span className="block text-[8px] font-bold text-primary">MoWave</span>nah that SAMMIE hook is different, changed my vote</div>
      </div>
      <div className="mb-2 flex items-start gap-1.5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[9px]">&#128081;</div>
        <div className="rounded-lg border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] text-foreground"><span className="block text-[8px] font-bold text-accent">$HIKULU</span>I am listening. Both of you brought heat today...</div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 rounded-full border border-border bg-muted px-3 py-1.5 text-[10px] text-muted-foreground">Say something...</div>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"><Send className="h-3 w-3" /></div>
      </div>
    </div>
  </div>
);

const Learn = () => {
  const { isEmbedded } = useEmbedMode();

  return (
    <div className="min-h-screen bg-background">
      {isEmbedded ? <EmbedTopBar title="Learn the Battle Zone" /> : <Navbar />}

      <div className={`mx-auto max-w-5xl px-4 ${isEmbedded ? "py-8" : "py-16"} space-y-16`}>

        {/* Hero */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
            <GraduationCap className="h-3 w-3" /> Learn WaveWarz Africa Battle Zone
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-foreground mb-4">
            Learn how to <span className="text-primary text-glow-green">battle</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Two artists, their best songs, one crowd, one verdict. You listen live, you vote live, you talk your talk in the chat, and the artist you back walks away with the crown. Here is everything, button by button.
          </p>
        </div>

        {/* Battle flow */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">How a battle flows</h2>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
            {flowSteps.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-border bg-card/80 p-4 text-center backdrop-blur">
                <div className="text-3xl mb-2">{s.emoji}</div>
                <h3 className="text-sm font-bold text-foreground mb-1">{i + 1}. {s.title}</h3>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Roles */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-2 text-center">Pick your role. Or play all three.</h2>
          <div className="grid gap-6 md:grid-cols-3 mt-6">
            <div className="rounded-2xl border border-accent/40 bg-accent/5 p-6">
              <Crown className="h-8 w-8 text-accent mb-3" />
              <h3 className="text-lg font-black text-accent mb-2">The Host</h3>
              <p className="text-sm text-muted-foreground">You are the ringmaster. You create the battle, choose the artists and songs, run the X Space for live commentary, control the rounds, and declare the results. The room moves at your pace.</p>
            </div>
            <div className="rounded-2xl border border-secondary/40 bg-secondary/5 p-6">
              <Mic className="h-8 w-8 text-secondary mb-3" />
              <h3 className="text-lg font-black text-secondary mb-2">The Speaker</h3>
              <p className="text-sm text-muted-foreground">You are the voice. Join the host's X Space as a speaker to commentate, hype the crowd, break down the bars, or rep your artist on the mic while the battle plays out.</p>
            </div>
            <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
              <Flame className="h-8 w-8 text-primary mb-3" />
              <h3 className="text-lg font-black text-primary mb-2">The Audience</h3>
              <p className="text-sm text-muted-foreground">You are the judge and jury. Join any live room free, listen on X, vote for the song that moves you, talk in the chat, and if you really believe, own a piece of the song itself.</p>
            </div>
          </div>
        </section>

        {/* Inside the battle room */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-2 text-center">Inside the battle room</h2>
          <p className="text-muted-foreground text-center mb-8">This is where it all goes down. Every button, explained.</p>
          <div className="grid gap-10 lg:grid-cols-2 items-start">
            <RoomMock />
            <div className="space-y-5">
              {roomGuide.map((g, i) => (
                <div key={g.title} className="flex gap-4">
                  <StepNum n={i + 1} color="accent" />
                  <div>
                    <h3 className="font-bold text-foreground mb-1">{g.title}</h3>
                    <p className="text-sm text-muted-foreground">{g.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How winning works */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">How winning works</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
              <Flame className="h-7 w-7 text-primary mb-3" />
              <h3 className="font-bold text-foreground mb-2">1. Audience votes (the heavyweight)</h3>
              <p className="text-sm text-muted-foreground">One vote per round, changeable until the round closes. Last tap counts. Most total votes across all rounds wins. The host can end a battle early, and votes at the buzzer are final.</p>
            </div>
            <div className="rounded-2xl border border-accent/40 bg-accent/5 p-6">
              <Crown className="h-7 w-7 text-accent mb-3" />
              <h3 className="font-bold text-foreground mb-2">2. $HIKULU's verdict (the wildcard)</h3>
              <p className="text-sm text-muted-foreground">The AI judge listens to every round and weighs in after the battle. His verdict adds judge points to the final score.</p>
            </div>
            <div className="rounded-2xl border border-secondary/40 bg-secondary/5 p-6">
              <TrendingUp className="h-7 w-7 text-secondary mb-3" />
              <h3 className="font-bold text-foreground mb-2">3. Coin support (the booster)</h3>
              <p className="text-sm text-muted-foreground">Every battle song is an onchain asset. When fans buy a song's coin during the battle, that support adds score points to its side. Believers move markets, markets move scores.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-border bg-card/80 p-5 text-sm font-bold">
            <span className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-primary">&#128293; Crowd votes</span>
            <span className="text-muted-foreground">+</span>
            <span className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-accent">&#128081; $HIKULU points</span>
            <span className="text-muted-foreground">+</span>
            <span className="rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-2 text-secondary">&#128200; Coin support</span>
            <span className="text-primary">=</span>
            <span className="rounded-xl bg-primary px-4 py-2 text-primary-foreground">&#127942; Final score</span>
          </div>
        </section>

        {/* $HIKULU */}
        <section className="rounded-3xl border-2 border-accent/50 bg-gradient-to-b from-accent/10 to-transparent p-8 md:p-12 text-center">
          <div className="text-5xl mb-3">&#128081;</div>
          <h2 className="text-4xl font-black text-accent text-glow-gold mb-1">$HIKULU</h2>
          <p className="text-sm font-bold uppercase tracking-widest text-accent/80 mb-6">The wisest man on the planet of music</p>
          <p className="text-lg italic text-foreground max-w-xl mx-auto mb-8">
            "I have heard every kick, every snare and every lie ever told on a beat. Play your song. I will tell you the truth."
          </p>
          <div className="grid gap-4 md:grid-cols-3 text-left">
            <div className="rounded-2xl border border-accent/30 bg-card/80 p-5">
              <h3 className="font-bold text-foreground mb-2">&#127911; He listens in</h3>
              <p className="text-sm text-muted-foreground">$HIKULU sits in every battle, taking in both songs round by round: the pen, the production, the energy, and how the crowd is moving.</p>
            </div>
            <div className="rounded-2xl border border-accent/30 bg-card/80 p-5">
              <h3 className="font-bold text-foreground mb-2">&#9878;&#65039; He speaks after</h3>
              <p className="text-sm text-muted-foreground">When the battle ends, $HIKULU drops his verdict in the room and on the results page: what won him over, what fell flat, and who earned his points.</p>
            </div>
            <div className="rounded-2xl border border-accent/30 bg-card/80 p-5">
              <h3 className="font-bold text-foreground mb-2">&#128172; He talks back</h3>
              <p className="text-sm text-muted-foreground">Chat with him in the battle room. Ask him what he thinks mid-battle. He might humble you, he might crown you. He is never boring.</p>
            </div>
          </div>
        </section>

        {/* Onchain, by the way */}
        <section>
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-semibold text-accent mb-4">
            By the way...
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">Every battle song is <span className="text-accent">onchain</span></h2>
          <p className="text-muted-foreground mb-8 max-w-3xl">
            Here is the quiet superpower of WaveWarz Africa: the songs battling on stage are real onchain assets on $ongChainn. This part is 100% optional. You can vote, chat and enjoy every battle without ever touching it. But if you truly believe in a song...
          </p>
          <div className="grid gap-10 lg:grid-cols-5">
            <div className="lg:col-span-3 space-y-5">
              {[
                { title: "Every battle song has a song coin", desc: "Both songs in a battle exist as onchain assets. Anyone in the room can buy the song coin of the track they believe in, right from the app." },
                { title: "Buying support adds score points", desc: "Coin buys during the battle count toward that song's final score. Your money literally talks: it backs the artist and boosts their side of the scoreboard." },
                { title: "Watch it live with View Battle Charts", desc: "Tap the button in the battle room to open the live trading screen for both songs. Watch the charts race each other while the votes roll in. Two scoreboards, one battle." },
                { title: "Grow with your artist", desc: "You are not just a fan in the crowd, you are early. When the artist you backed in a battle blows up, you were there onchain, receipts and all." },
              ].map((s, i) => (
                <div key={s.title} className="flex gap-4">
                  <StepNum n={i + 1} color="accent" />
                  <div>
                    <h3 className="font-bold text-foreground mb-1">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
                <Lock className="h-6 w-6 text-accent mb-2" />
                <h3 className="font-bold text-foreground mb-1">Your keys, your coins</h3>
                <p className="text-sm text-muted-foreground">Trading on $ongChainn is non-custodial. You connect your own wallet, you hold your own assets. The app never holds your funds.</p>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-5">
                <HandHeart className="h-6 w-6 text-primary mb-2" />
                <h3 className="font-bold text-foreground mb-1">Zero pressure</h3>
                <p className="text-sm text-muted-foreground">Nothing here is locked behind buying anything. Voting is free. Rooms are free. The coin layer is there for the day you hear a song and think "the world needs to know".</p>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-5">
                <Lightbulb className="h-6 w-6 text-accent mb-2" />
                <h3 className="font-bold text-foreground mb-1">Golden rule</h3>
                <p className="text-sm text-muted-foreground">Back songs you love with amounts you are comfortable with. The best portfolio in WaveWarz is a good ear.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Hosting */}
        <section>
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-semibold text-accent mb-4">
            <Crown className="h-3 w-3" /> For ringmasters
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">How to <span className="text-accent">host</span> a battle</h2>
          <p className="text-muted-foreground mb-8">Anyone signed in can host. From zero to live room in about two minutes.</p>
          <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
            {hostSteps.map((s, i) => (
              <div key={s.title} className="flex gap-4">
                <StepNum n={i + 1} />
                <div>
                  <h3 className="font-bold text-foreground mb-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-accent/40 bg-accent/5 p-6">
            <h3 className="font-bold text-accent mb-2">&#128081; Host pro tips</h3>
            <p className="text-sm text-muted-foreground">
              Start your Space 10 minutes early to warm up the room. Invite speakers before round one. Announce vote swings out loud, it drives voting. The zone holds 5 live battles at once, so if launch is blocked, one must end first.
            </p>
          </div>
        </section>

        {/* Speakers + after the battle */}
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-secondary/40 bg-secondary/5 p-6">
            <Radio className="h-7 w-7 text-secondary mb-3" />
            <h3 className="text-lg font-bold text-secondary mb-3">Speaking on a battle</h3>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
              <li>Voice lives on the host's X Space. Tap Listen on X, then request to speak in the Space, or get invited by the host.</li>
              <li>Artists, managers and superfans all make great speakers. Commentate rounds, break down lyrics, rep your side.</li>
              <li>Keep the battle room chat open next to the Space: that is where the votes and the crowd reactions live.</li>
              <li>Golden rule of the mic: war the songs, respect the people.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-card/80 p-6">
            <Trophy className="h-7 w-7 text-accent mb-3" />
            <h3 className="text-lg font-bold text-foreground mb-3">After the battle</h3>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
              <li>Check the Results tab for final scores and $HIKULU's verdict.</li>
              <li>Winners hit the $ongChainn feed automatically. Share the result card to X and tag the artists.</li>
              <li>Voting, joining rooms and showing up earn you loyalty points on the $ongChainn leaderboard.</li>
              <li>When you lose a round, take it like a champ: there is always a rematch.</li>
            </ul>
          </div>
        </section>

        {/* Cheat sheet */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">Your cheat sheet</h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-card/80">
                  <th className="px-4 py-3 text-left text-muted-foreground"></th>
                  <th className="px-4 py-3 text-left font-bold text-primary">&#128293; Audience</th>
                  <th className="px-4 py-3 text-left font-bold text-accent">&#128081; Host</th>
                  <th className="px-4 py-3 text-left font-bold text-secondary">&#127908; Speaker</th>
                </tr>
              </thead>
              <tbody>
                {cheatSheet.map((row) => (
                  <tr key={row.label} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-bold text-foreground whitespace-nowrap">{row.label}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.audience}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.host}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.speaker}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5 p-10 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-3">See you in the Zone</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Support and grow with your favorite artists and songs. Pick a battle and jump in.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <AppLink to="/battles/live" className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary/90 transition-all hover:shadow-[0_0_25px_hsl(var(--neon-green)/0.3)]">
              <Play className="h-4 w-4" /> Join Live Battle
            </AppLink>
            <AppLink to="/host/create" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-bold text-foreground hover:bg-muted transition-colors">
              <Zap className="h-4 w-4" /> Host a Battle
            </AppLink>
            <AppLink to="/how-it-works" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-medium text-muted-foreground hover:bg-muted transition-colors">
              <MessageSquare className="h-4 w-4" /> Quick Refresher
            </AppLink>
          </div>
        </section>

      </div>
      {!isEmbedded && <Footer />}
    </div>
  );
};

export default Learn;
