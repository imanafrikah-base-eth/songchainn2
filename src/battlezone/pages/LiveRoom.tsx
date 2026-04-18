import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Mic, MicOff, Hand, Send, Play, Pause, SkipForward,
  Square, UserPlus, Volume2, ExternalLink, Crown, Shield, Smile,
} from "lucide-react";
import LiveBadge from "@/battlezone/components/LiveBadge";
import { useBattle } from "@/battlezone/hooks/useBattles";
import { useBattles } from "@/battlezone/hooks/useBattles";
import { supabase } from "@/battlezone/integrations/supabase/client";
import type { Tables } from "@/battlezone/integrations/supabase/types";
import { useAuth } from "@/battlezone/contexts/AuthContext";
import { fetchSongchainUserIdSet } from "@/battlezone/lib/songchain";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";
import { useToast } from "@/battlezone/hooks/use-toast";
import wavewarzLogo from "@/battlezone/assets/WaveWarz Africa music logo transparent.png";

interface ChatMessage {
  id: string;
  userName: string;
  text: string;
  timestamp: Date;
  type: "message" | "system" | "reaction";
}

interface RoomParticipant {
  id: string;
  display_name: string | null;
  role: string;
  is_muted: boolean;
  is_speaking: boolean;
  user_id: string;
}

type ViewRole = "host" | "co-host" | "speaker" | "audience";
type SidebarTab = "audience" | "requests" | "chat";
type RoomMessageRow = Tables<"room_messages">;
type MicPermissionState = "unknown" | "granted" | "denied";

const LiveRoom = () => {
  const { isEmbedded, embedTo } = useEmbedMode();
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const { data: battle, isLoading } = useBattle(roomId);
  const { data: liveBattles = [] } = useBattles("live");

  const [votedFor, setVotedFor] = useState<"A" | "B" | null>(null);
  const [localVotesA, setLocalVotesA] = useState(0);
  const [localVotesB, setLocalVotesB] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [round, setRound] = useState(1);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const [requestedToSpeak, setRequestedToSpeak] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [isVerySmallMobile, setIsVerySmallMobile] = useState(false);
  const [micPermission, setMicPermission] = useState<MicPermissionState>("unknown");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const evaluateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
      // Compact mode only for very constrained phone screens.
      const compact = coarsePointer && (width <= 380 || (width <= 430 && height <= 760));
      setIsVerySmallMobile(compact);
    };

    evaluateViewport();
    window.addEventListener("resize", evaluateViewport);
    window.addEventListener("orientationchange", evaluateViewport);
    return () => {
      window.removeEventListener("resize", evaluateViewport);
      window.removeEventListener("orientationchange", evaluateViewport);
    };
  }, []);

  useEffect(() => {
    if (battle) {
      setLocalVotesA(battle.votesA);
      setLocalVotesB(battle.votesB);
      setRound(battle.round || 1);
    }
  }, [battle]);

  useEffect(() => {
    if (!roomId || !user) return;

    const displayName = profile?.display_name || profile?.username || "Listener";
    void supabase.from("battle_rooms").upsert(
      {
        battle_id: roomId,
        user_id: user.id,
        role: "audience",
        display_name: displayName,
        is_active: true,
        is_muted: true,
        is_speaking: false,
      },
      { onConflict: "battle_id,user_id" },
    );

    const heartbeat = window.setInterval(() => {
      void supabase
        .from("battle_rooms")
        .update({ is_active: true, last_seen_at: new Date().toISOString() })
        .eq("battle_id", roomId)
        .eq("user_id", user.id);
    }, 20000);

    return () => {
      window.clearInterval(heartbeat);
      void supabase
        .from("battle_rooms")
        .update({ is_active: false, is_speaking: false, last_seen_at: new Date().toISOString() })
        .eq("battle_id", roomId)
        .eq("user_id", user.id);
    };
  }, [roomId, user, profile?.display_name, profile?.username]);

  useEffect(() => {
    if (!roomId) return;
    let mounted = true;

    const fetchParticipants = async () => {
      const songchainUserIds = await fetchSongchainUserIdSet();
      const { data } = await supabase
        .from("battle_rooms")
        .select("id, display_name, role, is_muted, is_speaking, user_id")
        .eq("battle_id", roomId)
        .eq("is_active", true);
      if (!mounted || !data) return;
      setParticipants(data.filter((participant) => songchainUserIds.has(participant.user_id)));
    };

    void fetchParticipants();
    const participantChannel = supabase
      .channel(`battle-room-participants-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_rooms", filter: `battle_id=eq.${roomId}` },
        () => void fetchParticipants(),
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(participantChannel);
    };
  }, [roomId]);

  const [chatInput, setChatInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const totalVotes = localVotesA + localVotesB;
  const pctA = totalVotes ? Math.round((localVotesA / totalVotes) * 100) : 50;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!roomId) return;
    let mounted = true;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("room_messages")
        .select("id, message, user_id, created_at")
        .eq("room_name", roomId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (!mounted || !data) return;
      const names = new Map(participants.map((p) => [p.user_id, p.display_name || "Listener"]));
      const nextMessages: ChatMessage[] = data.map((msg: RoomMessageRow) => ({
        id: msg.id,
        userName:
          names.get(msg.user_id) ||
          (msg.user_id === user?.id ? profile?.display_name || profile?.username || "You" : "Listener"),
        text: msg.message,
        timestamp: new Date(msg.created_at),
        type: "message",
      }));
      setChatMessages(nextMessages);
    };

    void fetchMessages();
    const chatChannel = supabase
      .channel(`battle-room-chat-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_messages", filter: `room_name=eq.${roomId}` },
        () => void fetchMessages(),
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(chatChannel);
    };
  }, [roomId, participants, profile?.display_name, profile?.username, user?.id]);

  const sendMessage = async () => {
    if (!chatInput.trim() || !roomId || !user) return;
    const messageText = chatInput.trim();
    setChatInput("");
    setShowEmojiPicker(false);

    const { error } = await supabase.from("room_messages").insert({
      room_name: roomId,
      user_id: user.id,
      message: messageText,
    });

    if (error) {
      setChatInput(messageText);
    }
  };

  const requestToSpeak = async () => {
    if (!roomId || !user || requestedToSpeak || me?.role === "speaker" || me?.role === "co-host" || me?.role === "host") return;
    setRequestedToSpeak(true);
    await supabase
      .from("battle_rooms")
      .update({ role: "speaker-request", is_speaking: false })
      .eq("battle_id", roomId)
      .eq("user_id", user.id);
  };

  const approveSpeaker = async (requestUserId?: string) => {
    if (!roomId || !iAmHostOrCoHost) return;
    const requester = requestUserId
      ? participants.find((p) => p.role === "speaker-request" && p.user_id === requestUserId)
      : participants.find((p) => p.role === "speaker-request");
    if (!requester) return;
    await supabase
      .from("battle_rooms")
      .update({ role: "speaker", is_muted: false, is_speaking: true })
      .eq("battle_id", roomId)
      .eq("user_id", requester.user_id);
  };

  const muteActiveSpeaker = async () => {
    if (!roomId) return;
    const target = participants.find((p) => p.role === "speaker" && !p.is_muted);
    if (!target) return;
    await supabase
      .from("battle_rooms")
      .update({ is_muted: true, is_speaking: false })
      .eq("battle_id", roomId)
      .eq("user_id", target.user_id);
  };

  const shareRoomLink = async () => {
    if (!roomId || typeof window === "undefined") return;
    const url = `${window.location.origin}/wavewarz-africa/entry/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      void 0;
    }
  };

  const endBattle = async () => {
    if (!roomId) return;
    await supabase
      .from("battles")
      .update({ status: "ended", ended_time: new Date().toISOString() })
      .eq("id", roomId);
    navigate("/wavewarz-africa");
  };

  const addEmoji = (emoji: string) => {
    setChatInput((prev) => prev + emoji);
  };

  const vote = async (side: "A" | "B") => {
    if (votedFor || !user || !roomId) return;
    setVotedFor(side);
    if (side === "A") setLocalVotesA((v) => v + 1);
    else setLocalVotesB((v) => v + 1);

    await supabase.from("battle_votes").insert({
      battle_id: roomId,
      user_id: user.id,
      side,
      round,
    });
  };

  const host = participants.find((p) => p.role === "host");
  const coHosts = participants.filter((p) => p.role === "co-host");
  const speakers = participants.filter((p) => p.role === "speaker");
  const audience = participants.filter((p) => p.role === "audience");
  const speakerRequests = participants.filter((p) => p.role === "speaker-request");
  const me = user ? participants.find((p) => p.user_id === user.id) : undefined;
  const currentRole: ViewRole =
    me?.role === "host" || me?.role === "co-host" || me?.role === "speaker" ? me.role : "audience";
  const iAmHostOrCoHost = currentRole === "host" || currentRole === "co-host";
  const iCanSpeak = currentRole === "host" || currentRole === "co-host" || currentRole === "speaker";

  const requestMicAccess = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicPermission("denied");
      toast({
        title: "Microphone unavailable",
        description: "Your device/browser does not expose microphone access in this session.",
      });
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermission("granted");
      return true;
    } catch {
      setMicPermission("denied");
      toast({
        title: "Microphone permission denied",
        description: "Allow microphone access in your browser to speak live in this room.",
      });
      return false;
    }
  };

  const setStageMuted = async (muted: boolean) => {
    if (!roomId || !user || !iCanSpeak) return;
    if (!muted && micPermission !== "granted") {
      const allowed = await requestMicAccess();
      if (!allowed) return;
    }
    await supabase
      .from("battle_rooms")
      .update({ is_muted: muted, is_speaking: !muted, last_seen_at: new Date().toISOString() })
      .eq("battle_id", roomId)
      .eq("user_id", user.id);
  };

  const leaveSpeakerStage = async () => {
    if (!roomId || !user || currentRole !== "speaker") return;
    await supabase
      .from("battle_rooms")
      .update({ role: "audience", is_muted: true, is_speaking: false, last_seen_at: new Date().toISOString() })
      .eq("battle_id", roomId)
      .eq("user_id", user.id);
  };

  const removeSpeaker = async (targetUserId?: string) => {
    if (!roomId || !iAmHostOrCoHost) return;
    const target = targetUserId
      ? participants.find((p) => p.user_id === targetUserId && p.role === "speaker")
      : participants.find((p) => p.role === "speaker");
    if (!target) return;
    await supabase
      .from("battle_rooms")
      .update({ role: "audience", is_muted: true, is_speaking: false })
      .eq("battle_id", roomId)
      .eq("user_id", target.user_id);
  };

  useEffect(() => {
    if (!roomId) return;
    let mounted = true;

    const refreshVotes = async () => {
      const { data } = await supabase
        .from("battle_vote_counts")
        .select("side, vote_count")
        .eq("battle_id", roomId);
      if (!mounted || !data) return;

      const nextA = data.find((row) => row.side === "A")?.vote_count ?? 0;
      const nextB = data.find((row) => row.side === "B")?.vote_count ?? 0;
      setLocalVotesA(nextA);
      setLocalVotesB(nextB);
    };

    void refreshVotes();
    const voteChannel = supabase
      .channel(`battle-room-votes-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_votes", filter: `battle_id=eq.${roomId}` },
        () => void refreshVotes(),
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(voteChannel);
    };
  }, [roomId]);

  useEffect(() => {
    if (!user) return;
    const me = participants.find((p) => p.user_id === user.id);
    if (!me) return;
    setRequestedToSpeak(me.role === "speaker-request");
    if (!me.is_muted) setMicPermission("granted");
  }, [participants, user]);

  const getSidebarTabs = () => {
    if (!iAmHostOrCoHost) return ["audience", "chat"] as const;
    return ["audience", "requests", "chat"] as const;
  };

  const sidebarTabs = getSidebarTabs();
  const switchableBattles = liveBattles.filter((b) => b.id !== roomId).slice(0, 4);

  const ParticipantCircle = ({ p, size = "md" }: { p: RoomParticipant; size?: "sm" | "md" | "lg" }) => {
    const sizes = {
      sm: "h-10 w-10 text-xs",
      md: "h-14 w-14 text-sm",
      lg: "h-20 w-20 text-xl",
    };
    return (
      <div className="flex flex-col items-center gap-1">
        <div className={`relative rounded-full bg-muted flex items-center justify-center font-bold ${sizes[size]} ${p.is_speaking ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
          {(p.display_name || "?").charAt(0)}
          {p.role === "host" && <Crown className="absolute -top-1 -right-1 h-4 w-4 text-neon-gold" />}
          {p.role === "co-host" && <Shield className="absolute -top-1 -right-1 h-4 w-4 text-neon-cyan" />}
        </div>
        <div className="flex items-center gap-1">
          {p.is_muted ? <MicOff className="h-3 w-3 text-live" /> : <Mic className="h-3 w-3 text-primary" />}
        </div>
        <span className="text-[10px] text-muted-foreground text-center max-w-16 truncate">{p.display_name || "Anonymous"}</span>
      </div>
    );
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (isLoading || !battle) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{isLoading ? "Loading battle..." : "Battle not found."}</p>
      </div>
    );
  }

  return (
    <div className={`${isEmbedded ? "h-full min-h-full" : "min-h-screen"} bg-background flex flex-col`}>
      <EmbedTopBar title="Live Room" />
      {/* Header */}
      <div className={`border-b border-border bg-card/60 backdrop-blur-xl ${isVerySmallMobile ? "px-2.5 py-2" : "px-4 py-3"}`}>
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className={`flex items-center ${isVerySmallMobile ? "gap-2 min-w-0" : "gap-3"}`}>
            <button onClick={() => navigate("/wavewarz-africa")} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className={isVerySmallMobile ? "h-4 w-4" : "h-5 w-5"} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <LiveBadge />
                <h1 className={`font-bold text-foreground truncate ${isVerySmallMobile ? "text-xs max-w-[150px]" : "text-sm"}`}>{battle.title}</h1>
              </div>
              <p className={`${isVerySmallMobile ? "text-[11px]" : "text-xs"} text-muted-foreground truncate`}>
                {battle.listeners.toLocaleString()} listening - Round {round}/{battle.totalRounds}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`rounded-lg border border-border bg-card text-foreground ${isVerySmallMobile ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"}`}>
              {currentRole === "host" ? "Host" : currentRole === "co-host" ? "Co-Host" : currentRole === "speaker" ? "Speaker" : "Audience"}
            </div>
          </div>
        </div>
        <div className={`mx-auto max-w-7xl flex flex-wrap items-center ${isVerySmallMobile ? "mt-2 gap-1.5" : "mt-3 gap-2"}`}>
          <span className={`${isVerySmallMobile ? "text-[10px]" : "text-[11px]"} font-semibold uppercase tracking-wide text-muted-foreground`}>
            Live Rooms ({liveBattles.length}/5)
          </span>
          {switchableBattles.map((live) => (
            <button
              key={live.id}
              onClick={() => navigate(embedTo(`/entry/${live.id}`))}
              className={`rounded-lg border border-border bg-background font-medium text-foreground hover:border-primary/40 hover:text-primary ${isVerySmallMobile ? "max-w-[140px] px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs"}`}
            >
              <span className="block truncate">{live.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col lg:flex-row">
        <div className={`flex-1 ${isEmbedded ? "p-2.5 sm:p-3" : "p-3 sm:p-4"} space-y-4 sm:space-y-6 overflow-y-auto`}>
          {/* Speaking Area */}
          <div className={`rounded-2xl border border-border bg-card/60 ${isVerySmallMobile ? "p-3.5" : "p-4 sm:p-6"} backdrop-blur`}>
            <h3 className="text-sm font-bold text-muted-foreground mb-3 sm:mb-4 flex items-center gap-2">
              <Mic className="h-4 w-4" /> Speaking Now
            </h3>
            <div className={`flex flex-wrap justify-center ${isVerySmallMobile ? "gap-3" : "gap-4 sm:gap-6"}`}>
              {host && <ParticipantCircle p={host} size="lg" />}
              {coHosts.map((p) => <ParticipantCircle key={p.id} p={p} />)}
              {speakers.map((p) => <ParticipantCircle key={p.id} p={p} />)}
              {participants.length === 0 && (
                <p className="text-sm text-muted-foreground">No speakers yet - join the room!</p>
              )}
            </div>
          </div>

          {/* Battle Panel */}
          <div className={`rounded-2xl border border-border bg-card/60 ${isVerySmallMobile ? "p-3.5" : "p-4 sm:p-6"} backdrop-blur`}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-display text-muted-foreground">Round {round} of {battle.totalRounds}</span>
              <span className="text-xs text-primary flex items-center gap-1"><Play className="h-3 w-3" /> Now Playing</span>
            </div>

            <div className={`${isVerySmallMobile ? "space-y-3" : "grid grid-cols-3 gap-4 items-center"} mb-6`}>
              <div className="flex flex-col items-center gap-2 text-center">
                {battle.artistA.image && (
                  <img
                    src={battle.artistA.image}
                    alt={battle.artistA.name}
                    className={`${isVerySmallMobile ? "h-14 w-14" : "h-16 w-16"} rounded-full object-cover border-2 border-primary/50`}
                    onError={(event) => {
                      const target = event.currentTarget;
                      if (target.dataset.fallbackApplied === "true") return;
                      target.dataset.fallbackApplied = "true";
                      target.src = wavewarzLogo;
                    }}
                  />
                )}
                <span className="text-sm font-bold text-foreground">{battle.artistA.name}</span>
                <span className="text-[10px] text-muted-foreground">{battle.songA}</span>
                <a href="https://www.songchainn.xyz" target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                  $ongChainn <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <div className="text-center font-display font-bold text-muted-foreground text-lg">VS</div>
              <div className="flex flex-col items-center gap-2 text-center">
                {battle.artistB.image && (
                  <img
                    src={battle.artistB.image}
                    alt={battle.artistB.name}
                    className={`${isVerySmallMobile ? "h-14 w-14" : "h-16 w-16"} rounded-full object-cover border-2 border-secondary/50`}
                    onError={(event) => {
                      const target = event.currentTarget;
                      if (target.dataset.fallbackApplied === "true") return;
                      target.dataset.fallbackApplied = "true";
                      target.src = wavewarzLogo;
                    }}
                  />
                )}
                <span className="text-sm font-bold text-foreground">{battle.artistB.name}</span>
                <span className="text-[10px] text-muted-foreground">{battle.songB}</span>
                <a href="https://www.songchainn.xyz" target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                  $ongChainn <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>

            {/* Voting Panel */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-foreground text-center">Cast Your Vote</h3>
              <div className={`flex ${isVerySmallMobile ? "flex-col" : "gap-3"}`}>
                <button
                  onClick={() => vote("A")}
                  disabled={!!votedFor}
                  className={`flex-1 rounded-2xl ${isVerySmallMobile ? "py-3 text-sm" : "py-4 text-base sm:text-lg"} font-bold transition-all duration-300 ${
                    votedFor === "A"
                      ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_0_25px_hsl(var(--neon-green)/0.4)]"
                      : votedFor
                      ? "bg-muted text-muted-foreground opacity-40 cursor-not-allowed"
                      : "bg-primary/10 border-2 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50"
                  }`}
                >
                  Vote {battle.artistA.name}
                </button>
                <button
                  onClick={() => vote("B")}
                  disabled={!!votedFor}
                  className={`flex-1 rounded-2xl ${isVerySmallMobile ? "mt-2 py-3 text-sm" : "py-4 text-base sm:text-lg"} font-bold transition-all duration-300 ${
                    votedFor === "B"
                      ? "bg-gradient-to-br from-secondary to-secondary/80 text-secondary-foreground shadow-[0_0_25px_hsl(var(--cyan)/0.4)]"
                      : votedFor
                      ? "bg-muted text-muted-foreground opacity-40 cursor-not-allowed"
                      : "bg-secondary/10 border-2 border-secondary/30 text-secondary hover:bg-secondary/20 hover:border-secondary/50"
                  }`}
                >
                  Vote {battle.artistB.name}
                </button>
              </div>

              {votedFor && (
                <p className="text-center text-sm text-primary">
                  You voted for {votedFor === "A" ? battle.artistA.name : battle.artistB.name}
                </p>
              )}

              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{localVotesA.toLocaleString()} ({pctA}%)</span>
                <span>{localVotesB.toLocaleString()} ({100 - pctA}%)</span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden flex">
                <div className="bg-primary h-full rounded-l-full transition-all flex items-center justify-center" style={{ width: `${pctA}%` }}>
                  {pctA > 15 && <span className="text-[9px] font-bold text-primary-foreground">{pctA}%</span>}
                </div>
                <div className="bg-secondary h-full rounded-r-full transition-all flex items-center justify-center" style={{ width: `${100 - pctA}%` }}>
                  {100 - pctA > 15 && <span className="text-[9px] font-bold text-secondary-foreground">{100 - pctA}%</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex flex-wrap gap-2">
            {currentRole === "host" && (
              <>
                <button onClick={() => setIsPaused(!isPaused)} className="w-full sm:w-auto rounded-xl bg-primary/10 border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-all flex items-center justify-center gap-2">
                  {isPaused ? <><Play className="h-4 w-4" /> Resume</> : <><Pause className="h-4 w-4" /> Pause Round</>}
                </button>
                <button onClick={() => setRound((r) => Math.min(r + 1, battle.totalRounds))} className="w-full sm:w-auto rounded-xl bg-secondary/10 border border-secondary/30 px-4 py-2.5 text-sm font-semibold text-secondary hover:bg-secondary/20 transition-all flex items-center justify-center gap-2">
                  <SkipForward className="h-4 w-4" /> Next Round
                </button>
                <button className="w-full sm:w-auto rounded-xl bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-3 flex items-center justify-center gap-2">
                  <UserPlus className="h-4 w-4" /> Invite Co-Host
                </button>
                <button onClick={muteActiveSpeaker} className="w-full sm:w-auto rounded-xl bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-3 flex items-center justify-center gap-2">
                  <Volume2 className="h-4 w-4" /> Mute Speaker
                </button>
                <button onClick={() => removeSpeaker()} className="w-full sm:w-auto rounded-xl bg-live/10 border border-live/30 px-4 py-2.5 text-sm font-semibold text-live hover:bg-live/20 transition-all flex items-center justify-center gap-2">
                  <Square className="h-4 w-4" /> Remove Speaker
                </button>
                <button onClick={endBattle} className="w-full sm:ml-auto sm:w-auto rounded-xl bg-live/10 border border-live/30 px-4 py-2.5 text-sm font-semibold text-live hover:bg-live/20 transition-all flex items-center justify-center gap-2">
                  <Square className="h-4 w-4" /> End Battle
                </button>
              </>
            )}
            {currentRole === "co-host" && (
              <>
                <button onClick={() => approveSpeaker()} className="w-full sm:w-auto rounded-xl bg-primary/10 border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary flex items-center justify-center gap-2"><Hand className="h-4 w-4" /> Approve Speaker</button>
                <button onClick={muteActiveSpeaker} className="w-full sm:w-auto rounded-xl bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground flex items-center justify-center gap-2"><Volume2 className="h-4 w-4" /> Mute</button>
                <button onClick={() => removeSpeaker()} className="w-full sm:w-auto rounded-xl bg-live/10 border border-live/30 px-4 py-2.5 text-sm font-semibold text-live flex items-center justify-center gap-2"><Square className="h-4 w-4" /> Remove Speaker</button>
              </>
            )}
            {currentRole === "speaker" && (
              <>
                <button
                  onClick={() => setStageMuted(!(me?.is_muted ?? true))}
                  className="w-full sm:w-auto rounded-xl bg-primary/10 border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-all flex items-center justify-center gap-2"
                >
                  {(me?.is_muted ?? true) ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  {(me?.is_muted ?? true) ? "Unmute Mic" : "Mute Mic"}
                </button>
                <button
                  onClick={leaveSpeakerStage}
                  className="w-full sm:w-auto rounded-xl bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-3 flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" /> Leave Stage
                </button>
              </>
            )}
            {currentRole === "audience" && (
              <>
                <button
                  onClick={requestToSpeak}
                  disabled={requestedToSpeak}
                  className={`w-full sm:w-auto rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    requestedToSpeak
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20"
                  }`}
                >
                  <Hand className="h-4 w-4" /> {requestedToSpeak ? "Request Sent" : "Request to Speak"}
                </button>
                <button onClick={shareRoomLink} className="w-full sm:w-auto rounded-xl bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground flex items-center justify-center gap-2">
                  <ExternalLink className="h-4 w-4" /> Share
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card/40 flex flex-col">
          <div className="flex border-b border-border">
            {sidebarTabs.map((tab: SidebarTab) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={`flex-1 px-4 py-3 text-xs font-semibold capitalize transition-colors ${
                  sidebarTab === tab ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {sidebarTab === "audience" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">{audience.length} in audience</p>
                {audience.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/30">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{(p.display_name || "?").charAt(0)}</div>
                    <span className="text-sm text-foreground">{p.display_name || "Anonymous"}</span>
                  </div>
                ))}
                {audience.length === 0 && <p className="text-sm text-muted-foreground">No audience members yet</p>}
              </div>
            )}

            {sidebarTab === "requests" && (
              <div className="space-y-2">
                {speakerRequests.length === 0 ? (
                  <p className="text-xs text-muted-foreground mb-3">No speaker requests</p>
                ) : (
                  speakerRequests.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/30">
                      <span className="text-sm text-foreground">{p.display_name || "Anonymous"}</span>
                      <button
                        onClick={() => approveSpeaker(p.user_id)}
                        className="rounded-md bg-primary/15 px-2 py-1 text-xs text-primary hover:bg-primary/25"
                      >
                        Approve
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {sidebarTab === "chat" && (
              <div className="flex flex-col h-full">
                <div className="flex-1 space-y-2 mb-3">
                  {chatMessages.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No messages yet. Start the conversation!</p>
                  )}
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className={`text-sm ${msg.type === "system" ? "text-center text-xs text-muted-foreground italic" : ""}`}>
                      {msg.type === "message" && (
                        <>
                          <span className={`font-semibold ${msg.userName === (profile?.display_name || profile?.username || "You") ? "text-primary" : "text-foreground"}`}>{msg.userName}</span>
                          <span className="text-[10px] text-muted-foreground/50 ml-1">{formatTime(msg.timestamp)}</span>
                          <p className="text-muted-foreground">{msg.text}</p>
                        </>
                      )}
                      {msg.type === "system" && <span>{msg.text}</span>}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div className="flex gap-2 mt-auto">
                  <div className="relative flex-1">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                      placeholder="Say something..."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <button
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <Smile className="h-4 w-4" />
                    </button>
                    {showEmojiPicker && (
                      <div className="absolute bottom-full right-0 mb-2 flex gap-1 rounded-lg border border-border bg-card p-2">
                        {["FIRE", "100", "CLAP", "LOVE", "WOW", "LOL", "STRONG", "MUSIC"].map((e) => (
                          <button key={e} onClick={() => addEmoji(e)} className="text-lg hover:scale-125 transition-transform">
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={sendMessage} className="rounded-lg bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveRoom;
