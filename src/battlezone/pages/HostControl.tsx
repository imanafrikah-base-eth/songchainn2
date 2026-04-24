import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const { data: battle, isLoading } = useBattle(roomId);

  const [isLive, setIsLive] = useState(true);
  const [votingOpen, setVotingOpen] = useState(true);
  const [round, setRound] = useState(1);
  const [ended, setEnded] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (battle) setRound(battle.round || 1);
  }, [battle]);

  const fetchParticipants = useCallback(async () => {
    if (!roomId) return;
    const songchainUserIds = await fetchSongchainUserIdSet();
    const { data } = await supabase
      .from("battle_rooms")
      .select("*")
      .eq("battle_id", roomId)
      .eq("is_active", true);
    if (data) {
      setParticipants(data.filter((p) => songchainUserIds.has(p.user_id)));
    }
  }, [roomId]);

  useEffect(() => {
    void fetchParticipants();
  }, [fetchParticipants]);

  const handleApproveSpeaker = async () => {
    if (!selectedUserId || !roomId) return;
    await supabase
      .from("battle_rooms")
      .update({ role: "speaker", is_muted: false, is_speaking: true, requested_to_speak: false })
      .eq("battle_id", roomId)
      .eq("user_id", selectedUserId);
    setSelectedUserId(null);
    void fetchParticipants();
  };

  const handleAssignCoHost = async () => {
    if (!selectedUserId || !roomId) return;
    await supabase
      .from("battle_rooms")
      .update({ role: "co-host", is_muted: false, is_speaking: true, requested_to_speak: false })
      .eq("battle_id", roomId)
      .eq("user_id", selectedUserId);
    setSelectedUserId(null);
    void fetchParticipants();
  };

  const handleDeclareResult = async (winner: "A" | "B") => {
    if (!roomId) return;
    await supabase
      .from("battles")
      .update({ status: "ended", winner, ended_time: new Date().toISOString() })
      .eq("id", roomId);
    setEnded(true);
    setIsLive(false);
  };

  const handleEndRoom = async () => {
    if (!roomId) return;
    await supabase
      .from("battles")
      .update({ status: "ended", ended_time: new Date().toISOString() })
      .eq("id", roomId);
    setEnded(true);
    setIsLive(false);
    navigate("/wavewarz-africa");
  };

  if (isLoading || !battle) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{isLoading ? "Loading..." : "Battle not found."}</p>
      </div>
    );
  }

  const selectedParticipant = participants.find((p) => p.user_id === selectedUserId);

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
            {selectedParticipant && (
              <p className="text-xs text-primary">Selected: {selectedParticipant.display_name || "Anonymous"}</p>
            )}
            <div className="space-y-2">
              {participants.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedUserId(p.user_id === selectedUserId ? null : p.user_id)}
                  className={`w-full flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors text-left ${
                    p.user_id === selectedUserId
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {(p.display_name || "?").charAt(0)}
                    </div>
                    <span className="text-sm text-foreground">{p.display_name || "Anonymous"}</span>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">{p.role}</span>
                </button>
              ))}
              {participants.length === 0 && (
                <p className="text-sm text-muted-foreground">No participants yet</p>
              )}
            </div>
            {participants.length > 0 && !selectedUserId && (
              <p className="text-xs text-muted-foreground">Tap a participant to select them for role actions.</p>
            )}
          </div>

          {/* Speaker Queue */}
          <div className="rounded-2xl border border-border bg-card/80 p-6 backdrop-blur space-y-3">
            <h3 className="font-bold text-foreground">Speaker Queue</h3>
            {participants.filter((p) => p.requested_to_speak && p.role === "audience").length === 0 ? (
              <p className="text-sm text-muted-foreground">No speaker requests</p>
            ) : (
              participants
                .filter((p) => p.requested_to_speak && p.role === "audience")
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{p.display_name || "Anonymous"}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await supabase
                          .from("battle_rooms")
                          .update({ role: "speaker", is_muted: false, is_speaking: true, requested_to_speak: false })
                          .eq("battle_id", roomId)
                          .eq("user_id", p.user_id);
                        void fetchParticipants();
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Approve
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="mt-8 rounded-2xl border border-border bg-card/80 p-6 backdrop-blur space-y-4">
          <h3 className="font-bold text-foreground">Controls</h3>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setIsLive(!isLive)}
              className="rounded-lg bg-primary/10 border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-all flex items-center gap-2"
            >
              {isLive ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Go Live</>}
            </button>
            <button
              type="button"
              onClick={handleApproveSpeaker}
              disabled={!selectedUserId}
              className="rounded-lg bg-primary/10 border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserCheck className="h-4 w-4" /> Approve Speaker
            </button>
            <button
              type="button"
              onClick={handleAssignCoHost}
              disabled={!selectedUserId}
              className="rounded-lg bg-secondary/10 border border-secondary/30 px-4 py-2.5 text-sm font-semibold text-secondary hover:bg-secondary/20 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserPlus className="h-4 w-4" /> Assign Co-Host
            </button>
            <button
              type="button"
              onClick={() => setVotingOpen(!votingOpen)}
              className="rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/80 flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" /> {votingOpen ? "End Voting" : "Start Voting"}
            </button>
            <button
              type="button"
              onClick={() => setRound((r) => Math.min(r + 1, battle.totalRounds))}
              className="rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/80"
            >
              Next Round
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleDeclareResult("A")}
                disabled={ended}
                className="rounded-l-lg bg-neon-gold/10 border border-neon-gold/30 px-3 py-2.5 text-sm font-semibold text-neon-gold hover:bg-neon-gold/20 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle className="h-4 w-4" /> {battle.artistA.name} Wins
              </button>
              <button
                type="button"
                onClick={() => void handleDeclareResult("B")}
                disabled={ended}
                className="rounded-r-lg bg-neon-gold/10 border border-neon-gold/30 px-3 py-2.5 text-sm font-semibold text-neon-gold hover:bg-neon-gold/20 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {battle.artistB.name} Wins
              </button>
            </div>
            <button
              type="button"
              onClick={() => void handleEndRoom()}
              disabled={ended}
              className="ml-auto rounded-lg bg-live/10 border border-live/30 px-4 py-2.5 text-sm font-semibold text-live hover:bg-live/20 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Square className="h-4 w-4" /> End Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostControl;
