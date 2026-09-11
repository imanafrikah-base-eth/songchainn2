import { artistPath } from '@/lib/slugRoutes';
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Users, Share2, Play, Trophy, Crown, Heart, Radio, SlidersHorizontal, Gavel } from "lucide-react";
import Navbar from "@/battlezone/components/Navbar";
import Footer from "@/battlezone/components/Footer";
import LiveBadge from "@/battlezone/components/LiveBadge";
import { useBattle, useBattles } from "@/battlezone/hooks/useBattles";
import { supabase } from "@/battlezone/integrations/supabase/client";
import { useAuth } from "@/battlezone/contexts/AuthContext";
import { useToast } from "@/battlezone/hooks/use-toast";
import { requestHikuluVerdict } from "@/battlezone/lib/hikulu";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";
import AppLink from "@/battlezone/components/AppLink";
import wavewarzLogo from "@/battlezone/assets/WaveWarz Africa music logo transparent.webp";
import { BattleCountdown } from "@/battlezone/components/BattleCountdown";
import { STAGES, buildClock } from "@/battlezone/lib/battleStages";
import { ARTISTS, SONGS } from "@/data/musicData";

const BattleDetail = () => {
  const { isEmbedded, embedTo } = useEmbedMode();
  const { battleId } = useParams();
  const navigate = useNavigate();
  const { data: battle, isLoading } = useBattle(battleId);
  const { data: liveBattles = [] } = useBattles("live");
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const verdictRequested = useRef(false);
  const [isGoingLive, setIsGoingLive] = useState(false);

  // Self-heal: an ended battle without a verdict asks $HIKULU once, then refetches.
  useEffect(() => {
    if (!battle || battle.status !== "ended" || battle.hikuluVerdict || verdictRequested.current) return;
    verdictRequested.current = true;
    void requestHikuluVerdict(battle.id).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["battle", battle.id] });
    });
  }, [battle, queryClient]);

  const handleVote = () => {
    if (!battle) return;
    if (battle.status === "live") {
      // Straight into the room. This page already knows the battle is live, so
      // routing through /entry only added a second fetch before anything moved.
      navigate(embedTo(`/room/${battle.id}`));
    }
  };

  // A battle saved as a draft or scheduled for later had no way to actually
  // start: nothing flips status to 'live' on a schedule and no screen offered
  // the host a launch control. This is that control.
  const goLive = async () => {
    if (!battle || !user || isGoingLive) return;

    const stillLive = liveBattles.filter((b) => {
      const startedAt = new Date(b.createdAt).getTime();
      return Date.now() - startedAt < 24 * 60 * 60 * 1000;
    });
    if (stillLive.length >= 5) {
      toast({
        title: "Live capacity reached",
        description: "BattleZone supports 5 concurrent live battles. End one first, then launch this one.",
      });
      return;
    }

    setIsGoingLive(true);
    const displayName = profile?.display_name || profile?.username || battle.host;

    /* The clock starts now, not when the battle was created, and it is written
       as timestamps so every viewer counts down to the same instant rather than
       to their own device. */
    const clock = buildClock(
      [...battle.songsA, ...battle.songsB].map(
        (s) => SONGS.find((catalogue) => catalogue.id === s.id)?.duration,
      ),
    );
    const startedAt = Date.now();

    const { error } = await supabase
      .from("battles")
      .update({
        status: "live",
        voting_open: true,
        round: battle.round || 1,
        launched_at: new Date().toISOString(),
        music_ends_at: new Date(startedAt + clock.musicEndsAt * 1000).toISOString(),
        closes_at: new Date(startedAt + clock.closesAt * 1000).toISOString(),
      })
      .eq("id", battle.id);

    if (error) {
      setIsGoingLive(false);
      // The Open Mic is charged in points at exactly this moment, so a refusal
      // here is usually the database saying the host cannot afford it. Passing
      // its own words on is more use than "please try again".
      toast({
        title: "Could not go live",
        description: error.message?.includes("Open Mic")
          ? error.message
          : "Please try again.",
      });
      return;
    }

    // Seat the host in their own room, otherwise they enter as audience and
    // the host controls never appear.
    await supabase.from("battle_rooms").delete().eq("battle_id", battle.id).eq("user_id", user.id);
    await supabase.from("battle_rooms").insert({
      battle_id: battle.id,
      user_id: user.id,
      role: "host",
      display_name: displayName,
      is_muted: false,
      is_speaking: true,
    });

    await queryClient.invalidateQueries({ queryKey: ["battle", battle.id] });
    navigate(embedTo(`/room/${battle.id}`));
  };

  const handleShare = async () => {
    if (!battle) return;
    const url = `${window.location.origin}/wavewarz-africa/battle/${battle.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: battle.title, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      void 0;
    }
  };

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
  const isHost = !!user && !!battle.hostUserId && battle.hostUserId === user.id;

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
          <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
            {STAGES[battle.stage].name}
          </span>
          <span className="text-xs text-muted-foreground">{battle.region}</span>
        </div>

        {battle.stage === "open_mic" && (
          <p className="text-sm text-muted-foreground">
            This one is on the Open Mic. The judges and the poll decide it exactly as they
            do on the Main Stage, and nothing in it is worth money: there is no backing and
            nobody is paid.
          </p>
        )}

        {battle.status === "live" && battle.closesAt && (
          <BattleCountdown
            musicEndsAt={battle.musicEndsAt ?? null}
            closesAt={battle.closesAt}
          />
        )}

        <h1 className="text-3xl font-display font-black text-foreground">{battle.title}</h1>

        {isHost && battle.status === "upcoming" && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
            You are the host of this battle.
            {battle.scheduledTime
              ? ` It is scheduled for ${new Date(battle.scheduledTime).toLocaleString()}, and it stays in Upcoming until you start it yourself.`
              : " It stays in Upcoming until you start it."}{" "}
            Hit Go Live Now when you are ready and the room opens for your audience.
          </div>
        )}

        {/* A name on a battle card is the artist, and a title is the record.
            Tapping either used to do nothing, which is the app showing you
            something and then refusing to let you follow it. */}
        <div className="grid grid-cols-3 gap-6 items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <img
              src={battle.artistA.image}
              alt={battle.artistA.name}
              className="h-24 w-24 rounded-full object-cover border-2 border-primary/50"
              onError={(event) => {
                const target = event.currentTarget;
                if (target.dataset.fallbackApplied === "true") return;
                target.dataset.fallbackApplied = "true";
                target.src = wavewarzLogo;
              }}
            />
            <BattleArtistName name={battle.artistA.name} />
            <BattleSongTitle title={battle.songA} artistName={battle.artistA.name} />
            <span className="text-xs text-muted-foreground">{battle.artistA.region}</span>
            {battle.winner === "A" && <span className="rounded-full bg-neon-gold/20 px-3 py-1 text-xs font-bold text-neon-gold">Winner</span>}
          </div>
          <div className="flex flex-col items-center">
            <span className="text-2xl font-display font-bold text-muted-foreground">VS</span>
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <img
              src={battle.artistB.image}
              alt={battle.artistB.name}
              className="h-24 w-24 rounded-full object-cover border-2 border-secondary/50"
              onError={(event) => {
                const target = event.currentTarget;
                if (target.dataset.fallbackApplied === "true") return;
                target.dataset.fallbackApplied = "true";
                target.src = wavewarzLogo;
              }}
            />
            <BattleArtistName name={battle.artistB.name} />
            <BattleSongTitle title={battle.songB} artistName={battle.artistB.name} />
            <span className="text-xs text-muted-foreground">{battle.artistB.region}</span>
            {battle.winner === "B" && <span className="rounded-full bg-neon-gold/20 px-3 py-1 text-xs font-bold text-neon-gold">Winner</span>}
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

        {/* The judges' verdicts */}
        {battle.status === "ended" && (
          battle.hikuluVerdict ? (
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
          ) : (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 flex items-center gap-3">
              <Crown className="h-5 w-5 text-amber-400 shrink-0" />
              <p className="text-sm text-muted-foreground">$HIKULU and NAKULU are weighing their verdicts on this battle. Check back in a moment.</p>
            </div>
          )
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
            <li>
              {battle.battleType === "community"
                ? "Community battle: 3 rounds, one song from each artist per round"
                : "Quick battle: one round, one song from each artist"}
            </li>
            <li>Audience votes live each round and can change their vote before the round ends</li>
            <li>Crowd votes plus judge points from $HIKULU and NAKULU decide the final score</li>
            <li>Host can end the battle early</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-4">
          {isHost && battle.status === "upcoming" && (
            <button
              type="button"
              onClick={() => void goLive()}
              disabled={isGoingLive}
              className="inline-flex items-center gap-2 rounded-xl bg-live px-6 py-3 font-bold text-white hover:bg-live/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Radio className="h-4 w-4" /> {isGoingLive ? "Going live..." : "Go Live Now"}
            </button>
          )}
          {isHost && battle.status === "live" && (
            <AppLink to={`/host/control/${battle.id}`} className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-6 py-3 font-bold text-primary hover:bg-primary/20 transition-colors">
              <SlidersHorizontal className="h-4 w-4" /> Host Controls
            </AppLink>
          )}
          {battle.status === "live" && (
            <AppLink to={`/room/${battle.id}`} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary/90 transition-all">
              <Play className="h-4 w-4" /> Enter Room
            </AppLink>
          )}
          {battle.status === "live" && (
            <button
              type="button"
              onClick={handleVote}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-bold text-foreground hover:bg-muted transition-colors"
            >
              <Trophy className="h-4 w-4" /> Vote Now
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleShare()}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>
      </div>
      {!isEmbedded && <Footer />}
    </div>
  );
};

export default BattleDetail;

/* ------------------------------------------------- names that go somewhere --- */

/** Look up a catalogue artist by the name a battle stored. */
function artistIdFor(name: string | null | undefined): string | null {
  const wanted = (name ?? '').trim().toLowerCase();
  if (!wanted) return null;
  return ARTISTS.find((a) => a.name.trim().toLowerCase() === wanted)?.id ?? null;
}

/** Look up a record by its title, preferring the one by this artist. */
function songIdFor(title: string | null | undefined, artistName: string | null | undefined): string | null {
  const wanted = (title ?? '').trim().toLowerCase();
  if (!wanted || wanted === 'tbd') return null;
  const byArtist = (artistName ?? '').trim().toLowerCase();
  const matches = SONGS.filter((s) => s.title.trim().toLowerCase() === wanted);
  const mine = matches.find((s) => s.artist.trim().toLowerCase() === byArtist);
  return (mine ?? matches[0])?.id ?? null;
}

function BattleArtistName({ name }: { name: string }) {
  const id = artistIdFor(name);
  if (!id) return <h3 className="font-bold text-foreground">{name}</h3>;
  return (
    <AppLink to={artistPath(id)} className="font-bold text-foreground hover:text-primary transition-colors">
      {name}
    </AppLink>
  );
}

function BattleSongTitle({ title, artistName }: { title: string; artistName: string }) {
  const id = songIdFor(title, artistName);
  if (!id) return <span className="text-xs text-muted-foreground">{title}</span>;
  return (
    <AppLink to={`/song/${id}`} className="text-xs text-muted-foreground hover:text-primary transition-colors">
      {title}
    </AppLink>
  );
}
