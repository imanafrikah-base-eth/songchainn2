import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Zap, Save, X, Search, UserPlus, ChevronDown, Music, MapPin, Calendar, FileText, Radio } from "lucide-react";
import Navbar from "@/battlezone/components/Navbar";
import Footer from "@/battlezone/components/Footer";
import { supabase } from "@/battlezone/integrations/supabase/client";
import { useAuth } from "@/battlezone/contexts/AuthContext";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";
import EmbedTopBar from "@/battlezone/components/EmbedTopBar";
import AppLink from "@/battlezone/components/AppLink";
import { toast } from "@/battlezone/hooks/use-toast";
import { ARTISTS, SONGS } from "@/data/musicData";

const regions = ["Zambia", "South Africa", "Nigeria", "Zimbabwe", "Botswana"];

interface SongchainUser {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

const SelectWrapper = ({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) => (
  <div className="relative">
    <Icon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
    {children}
    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
  </div>
);

const HostCreate = () => {
  const { isEmbedded, embedTo } = useEmbedMode();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [form, setForm] = useState({
    title: "",
    region: "Zambia",
    artistAId: "",
    artistBId: "",
    artistA: "",
    artistB: "",
    songAId: "",
    songBId: "",
    songA: "",
    songB: "",
    schedule: "",
    notes: "",
  });
  const [coHostSearch, setCoHostSearch] = useState("");
  const [selectedCoHosts, setSelectedCoHosts] = useState<SongchainUser[]>([]);
  const [showCoHostDropdown, setShowCoHostDropdown] = useState(false);
  const [users, setUsers] = useState<SongchainUser[]>([]);
  const [liveBattlesCount, setLiveBattlesCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const artistOptions = useMemo(
    () =>
      [...ARTISTS]
        .map((artist) => ({ id: artist.id, name: artist.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  const songsByArtist = useMemo(() => {
    const map = new Map<string, Array<{ id: string; title: string }>>();
    SONGS.forEach((song) => {
      const next = map.get(song.artistId) || [];
      next.push({ id: song.id, title: song.title });
      map.set(song.artistId, next);
    });
    map.forEach((songs, artistId) => {
      map.set(
        artistId,
        songs.sort((a, b) => a.title.localeCompare(b.title))
      );
    });
    return map;
  }, []);
  
  // Fetch songchainn users for co-host search
  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase
        .from("audience_profiles")
        .select("id, user_id, username, display_name, avatar_url, created_at")
        .not("user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (!data) return;

      const uniqueByUserId = new Map<string, SongchainUser>();
      (data as any[]).forEach((row) => {
        const userId = String(row?.user_id || "").trim();
        if (!userId) return;
        if (!uniqueByUserId.has(userId)) {
          uniqueByUserId.set(userId, {
            id: String(row?.id || userId),
            user_id: userId,
            username: row?.username ?? null,
            display_name: row?.display_name ?? row?.username ?? "Listener",
            avatar_url: row?.avatar_url ?? null,
          });
        }
      });

      setUsers(Array.from(uniqueByUserId.values()));
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    const fetchLiveCount = async () => {
      const { count } = await supabase
        .from("battles")
        .select("id", { count: "exact", head: true })
        .eq("status", "live");
      setLiveBattlesCount(count ?? 0);
    };
    fetchLiveCount();
  }, []);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const filteredUsers = useMemo(() => {
    if (!coHostSearch.trim()) return users.filter(u => !selectedCoHosts.find(s => s.user_id === u.user_id));
    return users.filter(
      (u) =>
        !selectedCoHosts.find((s) => s.user_id === u.user_id) &&
        ((u.username?.toLowerCase().includes(coHostSearch.toLowerCase())) ||
          (u.display_name?.toLowerCase().includes(coHostSearch.toLowerCase())))
    );
  }, [coHostSearch, selectedCoHosts, users]);

  const addCoHost = (u: SongchainUser) => {
    if (selectedCoHosts.length >= 4) return;
    setSelectedCoHosts((prev) => [...prev, u]);
    setCoHostSearch("");
    setShowCoHostDropdown(false);
  };

  const removeCoHost = (userId: string) => {
    setSelectedCoHosts((prev) => prev.filter((u) => u.user_id !== userId));
  };

  const selectArtist = (slot: "A" | "B", artistId: string) => {
    const selectedArtist = artistOptions.find((a) => a.id === artistId);
    if (slot === "A") {
      setForm((prev) => ({
        ...prev,
        artistAId: artistId,
        artistA: selectedArtist?.name || "",
        songAId: "",
        songA: "",
      }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      artistBId: artistId,
      artistB: selectedArtist?.name || "",
      songBId: "",
      songB: "",
    }));
  };

  const selectSong = (slot: "A" | "B", songId: string) => {
    const song = SONGS.find((s) => s.id === songId);
    if (slot === "A") {
      setForm((prev) => ({
        ...prev,
        songAId: songId,
        songA: song?.title || "",
      }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      songBId: songId,
      songB: song?.title || "",
    }));
  };

  const upsertHostInRoom = async (battleId: string) => {
    if (!user || !profile) return;
    await supabase
      .from("battle_rooms")
      .upsert(
        {
          battle_id: battleId,
          user_id: user.id,
          role: "host",
          display_name: profile.display_name || profile.username || "Host",
          is_active: true,
          is_muted: false,
          is_speaking: true,
        },
        { onConflict: "battle_id,user_id" },
      );
  };

  const broadcastBattleLaunch = async (battleId: string, title: string) => {
    if (!user) return;
    const { data: profiles } = await supabase
      .from("audience_profiles")
      .select("user_id")
      .eq("onboarding_completed", true)
      .not("user_id", "is", null)
      .limit(5000);

    const userIds = (profiles || [])
      .map((p) => p.user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    if (userIds.length) {
      const payload = userIds
        .filter((id) => id !== user.id)
        .map((targetId) => ({
          user_id: targetId,
          type: "battle_live",
          title: "New Live Battle",
          message: `${title} is live now. Join the room and vote.`,
          metadata: { battle_id: battleId, route: `/wavewarz-africa/entry/${battleId}` },
        }));
      if (payload.length) {
        await supabase.from("notifications").insert(payload);
      }
    }

    await supabase.from("social_posts").insert({
      user_id: user.id,
      content: `Now Live on WaveWarz Africa: ${title}. Join battle room ${battleId} and vote.`,
    });
  };

  const sendCoHostInvites = async (battleId: string, title: string) => {
    if (!selectedCoHosts.length) return;

    const roomRoute = `/wavewarz-africa/entry/${battleId}`;
    const hostRoute = `/wavewarz-africa/host/control/${battleId}`;
    const directMessages = selectedCoHosts.map((coHost) => ({
      id: crypto.randomUUID(),
      user_id: coHost.user_id,
      sender: "mosha",
      text: `You have been selected as a co-host for "${title}".\nCTA::Open Battle Room::${roomRoute}\nCTA::Open Host Controls::${hostRoute}\nCTA::BattleZone Home::/wavewarz-africa`,
      created_at: new Date().toISOString(),
    }));
    await (supabase as any).from("direct_messages").insert(directMessages);

    const notificationsPayload = selectedCoHosts.map((coHost) => ({
      user_id: coHost.user_id,
      type: "cohost_invite",
      title: "Co-host Invite",
      message: `You have been selected as a co-host for "${title}".`,
      metadata: { battle_id: battleId, route: roomRoute, host_control_route: hostRoute },
    }));
    await supabase.from("notifications").insert(notificationsPayload);
  };

  const createBattle = async (isLaunchNow: boolean) => {
    if (!user || !profile) return;
    if (!form.title.trim()) {
      toast({ title: "Battle title required", description: "Please add a title before creating a battle." });
      return;
    }
    if (isLaunchNow && liveBattlesCount >= 5) {
      toast({
        title: "Live battle limit reached",
        description: "BattleZone supports 5 concurrent live battles. End one first, then launch a new battle.",
      });
      return;
    }

    setIsSubmitting(true);
    const status = isLaunchNow ? "live" : "upcoming";
    const scheduledTime = isLaunchNow ? null : form.schedule || null;
    const { data, error } = await supabase.from("battles").insert({
      title: form.title,
      region: form.region,
      artist_a_name: form.artistA || "TBD",
      artist_b_name: form.artistB || "TBD",
      artist_a_image: null,
      artist_b_image: null,
      song_a: form.songA || "TBD",
      song_b: form.songB || "TBD",
      host_user_id: user.id,
      host_name: profile.display_name || profile.username || "Host",
      co_hosts: selectedCoHosts.map(c => c.display_name || c.username || ""),
      scheduled_time: scheduledTime,
      status,
      total_rounds: 3,
    }).select().single();

    if (error || !data) {
      toast({ title: "Failed to create battle", description: "Please try again." });
      setIsSubmitting(false);
      return;
    }

    await sendCoHostInvites(data.id, form.title);

    if (isLaunchNow) {
      await upsertHostInRoom(data.id);
      await broadcastBattleLaunch(data.id, form.title);
      toast({ title: "Battle launched", description: "Your battle is live and users have been notified." });
      setLiveBattlesCount((n) => n + 1);
      navigate(embedTo(`/entry/${data.id}`));
    } else {
      toast({ title: "Battle scheduled", description: "Your battle is now in the upcoming feed." });
      navigate(embedTo("/battles/upcoming"));
    }
    setIsSubmitting(false);
  };

  const selectClass = "w-full rounded-xl border border-border bg-card/80 backdrop-blur pl-14 pr-4 py-3.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/30 shadow-[0_2px_10px_rgba(0,0,0,0.2)] transition-all appearance-none cursor-pointer hover:border-primary/20";
  const inputClass = "w-full rounded-xl border border-border bg-card/80 backdrop-blur pl-14 pr-4 py-3.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/30 shadow-[0_2px_10px_rgba(0,0,0,0.2)] transition-all";

  return (
    <div className="min-h-screen bg-background">
      {isEmbedded ? <EmbedTopBar title="Host a Battle" /> : <Navbar />}
      <div className="mx-auto max-w-2xl px-4 py-8">
        <AppLink to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </AppLink>

        <div className="space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-display font-black text-foreground mb-2">Host a Battle</h1>
            <p className="text-muted-foreground">Set up your battle room and go live</p>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Battle Title</label>
            <div className="relative">
              <FileText className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <input
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="e.g. Lusaka Heat: The Zambian Showdown"
                className={inputClass}
              />
            </div>
          </div>

          {/* Region */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Region</label>
            <SelectWrapper icon={MapPin}>
              <select value={form.region} onChange={(e) => update("region", e.target.value)} className={selectClass}>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </SelectWrapper>
          </div>

          {/* Artist and song selection */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Artist A</label>
              <SelectWrapper icon={Music}>
                <select
                  value={form.artistAId}
                  onChange={(e) => selectArtist("A", e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select Artist A</option>
                  {artistOptions.map((artist) => (
                    <option key={artist.id} value={artist.id}>
                      {artist.name}
                    </option>
                  ))}
                </select>
              </SelectWrapper>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Artist B</label>
              <SelectWrapper icon={Music}>
                <select
                  value={form.artistBId}
                  onChange={(e) => selectArtist("B", e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select Artist B</option>
                  {artistOptions.map((artist) => (
                    <option key={artist.id} value={artist.id}>
                      {artist.name}
                    </option>
                  ))}
                </select>
              </SelectWrapper>
            </div>
          </div>

          {/* Songs */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Song A</label>
              <SelectWrapper icon={Music}>
                <select
                  value={form.songAId}
                  onChange={(e) => selectSong("A", e.target.value)}
                  className={selectClass}
                  disabled={!form.artistAId}
                >
                  <option value="">{form.artistAId ? "Select Song A" : "Select Artist A first"}</option>
                  {(songsByArtist.get(form.artistAId) || []).map((song) => (
                    <option key={song.id} value={song.id}>
                      {song.title}
                    </option>
                  ))}
                </select>
              </SelectWrapper>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Song B</label>
              <SelectWrapper icon={Music}>
                <select
                  value={form.songBId}
                  onChange={(e) => selectSong("B", e.target.value)}
                  className={selectClass}
                  disabled={!form.artistBId}
                >
                  <option value="">{form.artistBId ? "Select Song B" : "Select Artist B first"}</option>
                  {(songsByArtist.get(form.artistBId) || []).map((song) => (
                    <option key={song.id} value={song.id}>
                      {song.title}
                    </option>
                  ))}
                </select>
              </SelectWrapper>
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Schedule (optional - leave blank to go live now)</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <input type="datetime-local" value={form.schedule} onChange={(e) => update("schedule", e.target.value)} className={inputClass} />
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Radio className="h-3.5 w-3.5" />
              Live capacity: {liveBattlesCount}/5 active battles
            </p>
          </div>

          {/* Co-Host Invites */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Co-Host Invites (max 4) - $ongChainn users</label>

            {selectedCoHosts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCoHosts.map((u) => (
                  <div key={u.user_id} className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5">
                    <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {(u.display_name || u.username || "?").charAt(0)}
                    </div>
                    <div className="text-xs">
                      <span className="font-medium text-foreground">{u.display_name || u.username}</span>
                      {u.username && <span className="text-muted-foreground ml-1">@{u.username}</span>}
                    </div>
                    <button onClick={() => removeCoHost(u.user_id)} className="text-muted-foreground hover:text-live transition-colors ml-1">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <input
                value={coHostSearch}
                onChange={(e) => { setCoHostSearch(e.target.value); setShowCoHostDropdown(true); }}
                onFocus={() => setShowCoHostDropdown(true)}
                placeholder="Search $ongChainn username..."
                disabled={selectedCoHosts.length >= 4}
                className={`${inputClass} disabled:opacity-50 pr-10`}
              />
              <UserPlus className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

              {showCoHostDropdown && selectedCoHosts.length < 4 && (
                <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-border bg-card shadow-2xl max-h-48 overflow-y-auto z-10">
                  {filteredUsers.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground text-center">No $ongChainn users found</div>
                  ) : (
                    filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => addCoHost(u)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/5 transition-colors text-left border-b border-border/30 last:border-0"
                      >
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold overflow-hidden">
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt=""
                              className="h-full w-full object-cover"
                              onError={(event) => {
                                const target = event.currentTarget;
                                if (target.dataset.fallbackApplied === "true") return;
                                target.dataset.fallbackApplied = "true";
                                target.src = "/placeholder.svg";
                              }}
                            />
                          ) : (
                            (u.display_name || u.username || "?").charAt(0)
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{u.display_name || u.username}</p>
                          {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Any rules, instructions, or notes for participants..."
              rows={3}
              className="w-full rounded-xl border border-border bg-card/80 backdrop-blur px-4 py-3.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {/* Submit */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <button
                onClick={() => createBattle(false)}
                disabled={isSubmitting || !form.schedule}
                className="w-full min-h-14 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-secondary px-5 py-3.5 font-bold text-secondary-foreground text-base sm:text-lg hover:bg-secondary/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Calendar className="h-5 w-5 shrink-0" /> Schedule Battle
              </button>
              <button
                onClick={() => createBattle(true)}
                disabled={isSubmitting || liveBattlesCount >= 5}
                className="w-full min-h-14 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-5 py-3.5 font-bold text-primary-foreground text-base sm:text-lg hover:bg-primary/90 transition-all hover:shadow-[0_0_30px_hsl(var(--neon-green)/0.3)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Zap className="h-5 w-5 shrink-0" /> Launch Battle Now
              </button>
            </div>
            <button className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm sm:text-base font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Save className="h-4 w-4 sm:h-5 sm:w-5" /> Save Draft
            </button>
          </div>
        </div>
      </div>
      {!isEmbedded && <Footer />}
    </div>
  );
};

export default HostCreate;
