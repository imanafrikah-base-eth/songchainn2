import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Mic, MicOff, Hand, Send, Play, Pause, SkipForward,
  Square, UserPlus, Volume2, ExternalLink, Crown, Shield, Smile, Music, X, Radio,
} from "lucide-react";
import { VOICE_ENABLED } from "@/battlezone/config";
import LiveBadge from "@/battlezone/components/LiveBadge";
import { useBattle } from "@/battlezone/hooks/useBattles";
import { useBattles } from "@/battlezone/hooks/useBattles";
import { useBattleRoles, type BattleParticipant } from "@/battlezone/hooks/useBattleRoles";
import { supabase } from "@/battlezone/integrations/supabase/client";
import type { Tables } from "@/battlezone/integrations/supabase/types";
import { useAuth } from "@/battlezone/contexts/AuthContext";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";
import { useToast } from "@/battlezone/hooks/use-toast";
import { Room, RoomEvent } from "livekit-client";
import { getLiveKitToken } from "@/battlezone/lib/livekit";
import MicControls from "@/battlezone/components/MicControls";
import SpeakerManagement from "@/battlezone/components/SpeakerManagement";
import wavewarzLogo from "@/battlezone/assets/WaveWarz Africa music logo transparent.png";
import { useHostAudio } from "@/battlezone/hooks/useHostAudio";
import { SONGS } from "@/data/musicData";

interface ChatMessage {
  id: string;
  userName: string;
  text: string;
  timestamp: Date;
  type: "message" | "system" | "reaction";
}

// RoomParticipant interface is now imported from useBattleRoles hook
type SidebarTab = "audience" | "requests" | "chat";
type RoomMessageRow = Tables<"room_messages">;

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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isVerySmallMobile, setIsVerySmallMobile] = useState(false);
  const [audioConnected, setAudioConnected] = useState(false);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const liveKitRoomRef = useRef<Room | null>(null);

  const hostAudio = useHostAudio();
  
  // Use new role management system
  const {
    participants,
    myRole,
    hasPermission,
    getParticipantsByRole,
    approveSpeakerRequest,
  } = useBattleRoles(roomId || '');

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

  // Restore this user's vote for the current round so a refresh doesn't
  // pretend they haven't voted; also resets choice when the round advances.
  useEffect(() => {
    if (!user || !roomId) {
      setVotedFor(null);
      return;
    }
    let cancelled = false;
    const loadMyVote = async () => {
      const { data } = await supabase
        .from("battle_votes")
        .select("side")
        .eq("battle_id", roomId)
        .eq("user_id", user.id)
        .eq("round", round)
        .maybeSingle();
      if (!cancelled) setVotedFor((data?.side as "A" | "B") ?? null);
    };
    void loadMyVote();
    return () => {
      cancelled = true;
    };
  }, [user, roomId, round]);

  // Participant management is now handled by useBattleRoles hook

  // Real-time participant management is now handled by useBattleRoles hook

  const [chatInput, setChatInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const totalVotes = localVotesA + localVotesB;
  const pctA = totalVotes ? Math.round((localVotesA / totalVotes) * 100) : 50;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const participantsRef = useRef(participants);
  participantsRef.current = participants;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const userRef = useRef(user);
  userRef.current = user;

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
      const currentParticipants = participantsRef.current;
      const currentProfile = profileRef.current;
      const currentUser = userRef.current;
      const names = new Map(currentParticipants.map((p) => [p.user_id, p.display_name || "Listener"]));
      const nextMessages: ChatMessage[] = data.map((msg: RoomMessageRow) => ({
        id: msg.id,
        userName:
          names.get(msg.user_id) ||
          (msg.user_id === currentUser?.id ? currentProfile?.display_name || currentProfile?.username || "You" : "Listener"),
        text: msg.message,
        timestamp: new Date(msg.created_at),
        type: "message",
      }));
      setChatMessages(nextMessages);
    };

    void fetchMessages();
    const chatChannel = supabase
      .channel(`battle-room-chat-${roomId}-${Date.now()}`)
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
  }, [roomId]);

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

  // Speaker request functionality is now handled by MicControls component

  // Speaker approval functionality is now handled by SpeakerManagement component

  // Speaker muting functionality is now handled by SpeakerManagement component

  const shareRoomLink = async () => {
    if (!roomId || typeof window === "undefined") return;
    const url = `${window.location.origin}/wavewarz-africa/entry/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      void 0;
    }
  };

  const advanceRound = async () => {
    if (!roomId || !battle) return;
    const newRound = Math.min(round + 1, battle.totalRounds);
    setRound(newRound);
    await supabase.from("battles").update({ round: newRound }).eq("id", roomId);
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

  // Votes are editable while the round is open: one row per user per round,
  // upserted so tapping the other artist switches the vote.
  const vote = async (side: "A" | "B") => {
    if (!user || !roomId || votedFor === side) return;
    const previous = votedFor;
    setVotedFor(side);
    if (side === "A") {
      setLocalVotesA((v) => v + 1);
      if (previous === "B") setLocalVotesB((v) => Math.max(0, v - 1));
    } else {
      setLocalVotesB((v) => v + 1);
      if (previous === "A") setLocalVotesA((v) => Math.max(0, v - 1));
    }

    const { error } = await supabase.from("battle_votes").upsert(
      { battle_id: roomId, user_id: user.id, side, round },
      { onConflict: "battle_id,user_id,round" }
    );
    if (error) {
      setVotedFor(previous);
      if (side === "A") {
        setLocalVotesA((v) => Math.max(0, v - 1));
        if (previous === "B") setLocalVotesB((v) => v + 1);
      } else {
        setLocalVotesB((v) => Math.max(0, v - 1));
        if (previous === "A") setLocalVotesA((v) => v + 1);
      }
      toast({ title: "Vote not saved", description: "Please try again." });
    }
  };

  // Publish host mixed audio (mic + song) to LiveKit room when state changes
  const { audioState: hostAudioState, publishToRoom: hostPublish, unpublishFromRoom: hostUnpublish } = hostAudio;
  useEffect(() => {
    if (!VOICE_ENABLED) return;
    const room = liveKitRoomRef.current;
    if (!room || myRole !== 'host') return;
    if (hostAudioState === 'idle') {
      hostUnpublish(room);
    } else {
      void hostPublish(room);
    }
  }, [hostAudioState, myRole, hostPublish, hostUnpublish]);

  const host = getParticipantsByRole('host')[0];
  const coHosts = getParticipantsByRole('co-host');
  const speakers = getParticipantsByRole('speaker');
  const audience = getParticipantsByRole('audience');
  const iAmHostOrCoHost = hasPermission('canApproveSpeakers');
  const canPublishAudio = hasPermission('canPublishAudio');

  useEffect(() => {
    if (!roomId || !user) return;
    let active = true;

    const ensurePresence = async () => {
      const { data: existing } = await supabase
        .from("battle_rooms")
        .select("id, role")
        .eq("battle_id", roomId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;

      const displayName = profile?.display_name || profile?.username || "Listener";

      if (existing?.id) {
        await supabase
          .from("battle_rooms")
          .update({ display_name: displayName, last_seen_at: new Date().toISOString() })
          .eq("id", existing.id);
        return;
      }

      await supabase.from("battle_rooms").insert({
        battle_id: roomId,
        user_id: user.id,
        role: "audience",
        display_name: displayName,
        is_muted: true,
        is_speaking: false,
      });
    };

    void ensurePresence();
    return () => {
      active = false;
    };
  }, [roomId, user, profile?.display_name, profile?.username]);

  useEffect(() => {
    if (!VOICE_ENABLED) return;
    if (!roomId || !user) return;
    let cancelled = false;
    const participantName = profile?.display_name || profile?.username || "WaveWarz Listener";

    const connectLiveKit = async () => {
      try {
        const { token, wsUrl } = await getLiveKitToken(roomId, user.id, participantName);
        if (cancelled) return;

        if (!wsUrl || !token) {
          toast({
            title: "Voice connection unavailable",
            description: "Live audio is not configured for this deployment. Contact support.",
          });
          return;
        }

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          stopLocalTrackOnUnpublish: true,
        });
        liveKitRoomRef.current = room;

        room
          .on(RoomEvent.Connected, () => {
            if (cancelled) return;
            setAudioConnected(true);
          })
          .on(RoomEvent.Disconnected, () => {
            if (cancelled) return;
            setAudioConnected(false);
          });

        await room.connect(wsUrl, token, { autoSubscribe: true });
      } catch (error) {
        console.error("[LiveKit] connect failed", error);
        if (!cancelled) setAudioConnected(false);
      }
    };

    void connectLiveKit();

    return () => {
      cancelled = true;
      const room = liveKitRoomRef.current;
      liveKitRoomRef.current = null;
      if (room) room.disconnect();
      setAudioConnected(false);
    };
    // canPublishAudio is included so that when a host approves a speaker request
    // (battle_rooms.role flips, picked up via realtime subscription in useBattleRoles),
    // this reconnects with a freshly-minted LiveKit token carrying the new publish grant --
    // the initial token is minted before approval and LiveKit doesn't let a grant be
    // upgraded in place, so without this a newly-approved speaker couldn't be heard until
    // they manually left and rejoined the room.
  }, [roomId, user, profile?.display_name, profile?.username, canPublishAudio]);


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


  const getSidebarTabs = () => {
    if (!VOICE_ENABLED) return ["audience", "chat"] as const;
    if (!hasPermission('canApproveSpeakers')) return ["audience", "chat"] as const;
    return ["audience", "requests", "chat"] as const;
  };

  const sidebarTabs = getSidebarTabs();
  const switchableBattles = liveBattles.filter((b) => b.id !== roomId).slice(0, 4);

  const ParticipantCircle = ({ p, size = "md" }: { p: BattleParticipant; size?: "sm" | "md" | "lg" }) => {
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
              {myRole === "host" ? "Host" : myRole === "co-host" ? "Co-Host" : myRole === "speaker" ? "Speaker" : "Audience"}
            </div>
            {VOICE_ENABLED ? (
              <div className={`rounded-lg border ${audioConnected ? "border-primary/40 text-primary" : "border-border text-muted-foreground"} bg-card ${isVerySmallMobile ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"}`}>
                {audioConnected ? "Audio On" : "Audio Reconnecting"}
              </div>
            ) : battle.xSpaceUrl ? (
              <a
                href={battle.xSpaceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 ${isVerySmallMobile ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"}`}
              >
                <Radio className="h-3.5 w-3.5" /> Listen on X
              </a>
            ) : null}
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
          {/* Speaking Area (in-app voice) */}
          {VOICE_ENABLED && (
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
          )}

          {/* Live audio on X Spaces */}
          {!VOICE_ENABLED && battle.xSpaceUrl && (
            <div className={`rounded-2xl border border-primary/30 bg-primary/5 ${isVerySmallMobile ? "p-3.5" : "p-4 sm:p-5"} backdrop-blur flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
              <div className="flex items-start gap-3">
                <Radio className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-foreground">Live audio is on X Spaces</p>
                  <p className="text-xs text-muted-foreground">Join the Space to hear the battle. Vote and chat right here while you listen.</p>
                </div>
              </div>
              <a
                href={battle.xSpaceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shrink-0"
              >
                Listen on X <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}

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
                <span className="text-[10px] text-muted-foreground">{battle.songsA[round - 1]?.title || battle.songA}</span>
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
                <span className="text-[10px] text-muted-foreground">{battle.songsB[round - 1]?.title || battle.songB}</span>
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
                  className={`flex-1 rounded-2xl ${isVerySmallMobile ? "py-3 text-sm" : "py-4 text-base sm:text-lg"} font-bold transition-all duration-300 ${
                    votedFor === "A"
                      ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_0_25px_hsl(var(--neon-green)/0.4)]"
                      : "bg-primary/10 border-2 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50"
                  }`}
                >
                  Vote {battle.artistA.name}
                </button>
                <button
                  onClick={() => vote("B")}
                  className={`flex-1 rounded-2xl ${isVerySmallMobile ? "mt-2 py-3 text-sm" : "py-4 text-base sm:text-lg"} font-bold transition-all duration-300 ${
                    votedFor === "B"
                      ? "bg-gradient-to-br from-secondary to-secondary/80 text-secondary-foreground shadow-[0_0_25px_hsl(var(--cyan)/0.4)]"
                      : "bg-secondary/10 border-2 border-secondary/30 text-secondary hover:bg-secondary/20 hover:border-secondary/50"
                  }`}
                >
                  Vote {battle.artistB.name}
                </button>
              </div>

              {votedFor && (
                <p className="text-center text-sm text-primary">
                  You voted for {votedFor === "A" ? battle.artistA.name : battle.artistB.name}. Tap the other artist to change your vote before the round ends.
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

          {/* Microphone Controls */}
          {VOICE_ENABLED && (
            <div className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur">
              <h3 className="text-sm font-bold text-muted-foreground mb-3">Audio Controls</h3>
              <MicControls
                battleId={roomId || ''}
                liveKitRoom={liveKitRoomRef.current}
              />
            </div>
          )}

          {/* Speaker Management */}
          {VOICE_ENABLED && hasPermission('canApproveSpeakers') && (
            <div className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur">
              <h3 className="text-sm font-bold text-muted-foreground mb-3">Speaker Management</h3>
              <SpeakerManagement battleId={roomId || ''} maxSpeakers={10} />
            </div>
          )}

          {/* Host Controls */}
          {myRole === "host" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setIsPaused(!isPaused)} className="w-full sm:w-auto rounded-xl bg-primary/10 border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-all flex items-center justify-center gap-2">
                  {isPaused ? <><Play className="h-4 w-4" /> Resume</> : <><Pause className="h-4 w-4" /> Pause Round</>}
                </button>
                <button onClick={advanceRound} className="w-full sm:w-auto rounded-xl bg-secondary/10 border border-secondary/30 px-4 py-2.5 text-sm font-semibold text-secondary hover:bg-secondary/20 transition-all flex items-center justify-center gap-2">
                  <SkipForward className="h-4 w-4" /> Next Round
                </button>
                <button onClick={endBattle} className="w-full sm:w-auto rounded-xl bg-live/10 border border-live/30 px-4 py-2.5 text-sm font-semibold text-live hover:bg-live/20 transition-all flex items-center justify-center gap-2">
                  <Square className="h-4 w-4" /> End Battle
                </button>
              </div>

              {/* Host Music Broadcast */}
              {VOICE_ENABLED && (
              <div className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                    <Music className="h-4 w-4" /> Broadcast Music
                  </h3>
                  {hostAudio.isSongPlaying && (
                    <span className="text-xs font-semibold text-primary animate-pulse">● LIVE</span>
                  )}
                </div>

                {hostAudio.error && (
                  <p className="text-xs text-live">{hostAudio.error}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {/* Mic toggle for host broadcast */}
                  {!hostAudio.isMicEnabled ? (
                    <button
                      onClick={() => hostAudio.startMic()}
                      className="rounded-xl bg-card border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted transition-all flex items-center gap-2"
                    >
                      <MicOff className="h-4 w-4" /> Enable Mic
                    </button>
                  ) : (
                    <button
                      onClick={() => hostAudio.stopMic()}
                      className="rounded-xl bg-primary/10 border border-primary/30 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 transition-all flex items-center gap-2"
                    >
                      <Mic className="h-4 w-4" /> Mic On
                    </button>
                  )}
                  {/* Song toggle */}
                  {!hostAudio.isSongPlaying ? (
                    <button
                      onClick={() => setShowSongPicker(true)}
                      className="rounded-xl bg-primary/10 border border-primary/30 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 transition-all flex items-center gap-2"
                    >
                      <Music className="h-4 w-4" /> Play Song to Room
                    </button>
                  ) : (
                    <button
                      onClick={() => hostAudio.stopSong()}
                      className="rounded-xl bg-live/10 border border-live/30 px-4 py-2 text-sm font-semibold text-live hover:bg-live/20 transition-all flex items-center gap-2"
                    >
                      <Square className="h-3 w-3" /> Stop Music
                    </button>
                  )}
                </div>

                {/* Volume slider for song */}
                {hostAudio.isSongPlaying && (
                  <div className="flex items-center gap-3">
                    <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                      type="range" min={0} max={1} step={0.05}
                      value={hostAudio.songVolume}
                      onChange={(e) => hostAudio.setSongVolume(parseFloat(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground w-8">{Math.round(hostAudio.songVolume * 100)}%</span>
                  </div>
                )}

                {/* Song picker overlay */}
                {showSongPicker && (
                  <div className="rounded-xl border border-border bg-background p-3 space-y-2 max-h-64 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-muted-foreground">Choose a song to broadcast</span>
                      <button onClick={() => setShowSongPicker(false)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {SONGS.slice(0, 15).map((song) => (
                      <button
                        key={song.id}
                        onClick={async () => {
                          setShowSongPicker(false);
                          await hostAudio.playSong(song.audioUrl);
                          const room = liveKitRoomRef.current;
                          if (room) await hostAudio.publishToRoom(room);
                        }}
                        className="w-full text-left rounded-lg px-3 py-2 hover:bg-primary/10 transition-colors flex items-center gap-3"
                      >
                        <Music className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          {/* Share Link */}
          <button onClick={shareRoomLink} className="w-full sm:w-auto rounded-xl bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground flex items-center justify-center gap-2">
            <ExternalLink className="h-4 w-4" /> Share Room
          </button>
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
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  In Room ({participants.length})
                </p>
                {participants.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No participants yet</p>
                )}
                {participants.map((p) => (
                  <div key={p.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30">
                    <div className={`relative h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 ${p.is_speaking && !p.is_muted ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}>
                      {(p.display_name || "?").charAt(0).toUpperCase()}
                      {p.role === "host" && <Crown className="absolute -top-1 -right-1 h-3 w-3 text-neon-gold" />}
                      {p.role === "co-host" && <Shield className="absolute -top-1 -right-1 h-3 w-3 text-neon-cyan" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{p.display_name || "Anonymous"}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{p.role}</p>
                    </div>
                    {VOICE_ENABLED && p.is_speaking && !p.is_muted
                      ? <Volume2 className="h-3 w-3 text-primary shrink-0" />
                      : VOICE_ENABLED && p.is_muted && p.role !== "audience"
                      ? <MicOff className="h-3 w-3 text-muted-foreground shrink-0" />
                      : null
                    }
                  </div>
                ))}
              </div>
            )}

            {sidebarTab === "requests" && (
              <div className="space-y-2">
                {hasPermission('canApproveSpeakers') ? (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Speaker Requests
                    </p>
                    {participants.filter((p) => p.requested_to_speak && p.role === "audience").length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No pending requests</p>
                    )}
                    {participants
                      .filter((p) => p.requested_to_speak && p.role === "audience")
                      .map((p) => (
                        <div key={p.user_id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                              {(p.display_name || "?").charAt(0).toUpperCase()}
                            </div>
                            <p className="text-sm font-medium text-foreground truncate">{p.display_name || "Anonymous"}</p>
                          </div>
                          <button
                            onClick={() => approveSpeakerRequest(p.user_id)}
                            className="text-xs font-semibold text-primary hover:text-primary/80 shrink-0 ml-2"
                          >
                            Approve
                          </button>
                        </div>
                      ))
                    }
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    <Hand className="h-4 w-4 mx-auto mb-1" />
                    Tap "Request to Speak" below to join the stage
                  </p>
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
                        {["🔥", "💯", "👏", "❤️", "😮", "😂", "💪", "🎵"].map((e) => (
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
