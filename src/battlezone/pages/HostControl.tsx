import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Play, UserCheck, UserPlus, BarChart3, Square, CheckCircle, Pause, ExternalLink,
} from "lucide-react";
import Navbar from "@/battlezone/components/Navbar";
import { useBattle } from "@/battlezone/hooks/useBattles";
import { supabase } from "@/battlezone/integrations/supabase/client";
import { fetchSongchainUserIdSet } from "@/battlezone/lib/songchain";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";

const HostControl = () => {
  const { isEmbedded } = useEmbedMode();
  const { roomId } = useParams();
  const { data: battle, isLoading } = useBattle(roomId);

  const [isLive, setIsLive] = useState(true);
  const [votingOpen, setVotingOpen] = useState(true);
  const [round, setRound] = useState(1);
  const [ended, setEnded] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);

  useEffect(() => {
    if (battle) setRound(battle.round || 1);
  }, [battle]);

  // Fetch room participants from battle_rooms
  useEffect(() => {
    if (!roomId) return;
    const fetchParticipants = async () => {
      const songchainUserIds = await fetchSongchainUserIdSet();
      const { data } = await supabase
        .from("battle_rooms")
        .select("*")
        .eq("battle_id", roomId)
        .eq("is_active", true);
      if (data) {
        setParticipants(data.filter((participant) => songchainUserIds.has(participant.user_id)));
      }
    };
    fetchParticipants();
  }, [roomId]);

  if (isLoading || !battle) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{isLoading ? "Loading..." : "Battle not found."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {isEmbedded ? <EmbedTopBar title="Host Control" /> : <Navbar />}
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link to="/wavewarz-africa" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-black text-foreground">{battle.title}</h1>
            <p className="text-muted-foreground text-sm">Host Control Panel</p>
          </div>
          <Link to={`/wavewarz-africa/entry/${battle.id}`} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <ExternalLink className="h-4 w-4" /> Open Room View
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Status */}
          <div className="rounded-2xl border border-border bg-card/80 p-6 backdrop-blur space-y-3">
            <h3 className="font-bold text-foreground">Room Status</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className={`font-bold ${ended ? "text-muted-foreground" : isLive ? "text-live" : "text-neon-gold"}`}>
                {ended ? "Ended" : isLive ? "LIVE" : "Paused"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Round</span>
              <span className="text-foreground">{round}/{battle.totalRounds}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Voting</span>
              <span className={votingOpen ? "text-primary" : "text-muted-foreground"}>{votingOpen ? "Open" : "Closed"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Listeners</span>
              <span className="text-foreground">{battle.listeners.toLocaleString()}</span>
            </div>
          </div>

          {/* Votes */}
          <div className="rounded-2xl border border-border bg-card/80 p-6 backdrop-blur space-y-3">
            <h3 className="font-bold text-foreground">Votes</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{battle.artistA.name}</span>
              <span className="font-bold text-primary">{battle.votesA.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{battle.artistB.name}</span>
              <span className="font-bold text-secondary">{battle.votesB.toLocaleString()}</span>
            </div>
          </div>

          {/* Participants */}
          <div className="rounded-2xl border border-border bg-card/80 p-6 backdrop-blur space-y-3">
            <h3 className="font-bold text-foreground">Participants ({participants.length})</h3>
            <div className="space-y-2">
              {participants.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {(p.display_name || "?").charAt(0)}
                    </div>
                    <span className="text-sm text-foreground">{p.display_name || "Anonymous"}</span>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">{p.role}</span>
                </div>
              ))}
              {participants.length === 0 && (
                <p className="text-sm text-muted-foreground">No participants yet</p>
              )}
            </div>
          </div>

          {/* Speaker Queue placeholder */}
          <div className="rounded-2xl border border-border bg-card/80 p-6 backdrop-blur space-y-3">
            <h3 className="font-bold text-foreground">Speaker Queue</h3>
            <p className="text-sm text-muted-foreground">No speaker requests</p>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-8 rounded-2xl border border-border bg-card/80 p-6 backdrop-blur space-y-4">
          <h3 className="font-bold text-foreground">Controls</h3>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setIsLive(!isLive)} className="rounded-lg bg-primary/10 border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-all flex items-center gap-2">
              {isLive ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Go Live</>}
            </button>
            <button className="rounded-lg bg-primary/10 border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary flex items-center gap-2">
              <UserCheck className="h-4 w-4" /> Approve Speaker
            </button>
            <button className="rounded-lg bg-secondary/10 border border-secondary/30 px-4 py-2.5 text-sm font-semibold text-secondary flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Assign Co-Host
            </button>
            <button onClick={() => setVotingOpen(!votingOpen)} className="rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> {votingOpen ? "End Voting" : "Start Voting"}
            </button>
            <button onClick={() => setRound((r) => Math.min(r + 1, battle.totalRounds))} className="rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-3">
              Next Round
            </button>
            <button className="rounded-lg bg-neon-gold/10 border border-neon-gold/30 px-4 py-2.5 text-sm font-semibold text-neon-gold flex items-center gap-2">
              <CheckCircle className="h-4 w-4" /> Declare Result
            </button>
            <button onClick={() => { setEnded(true); setIsLive(false); }} className="ml-auto rounded-lg bg-live/10 border border-live/30 px-4 py-2.5 text-sm font-semibold text-live hover:bg-live/20 transition-all flex items-center gap-2">
              <Square className="h-4 w-4" /> End Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostControl;
