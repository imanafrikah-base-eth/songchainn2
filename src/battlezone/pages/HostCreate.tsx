import { useState, useMemo, useEffect, useRef } from "react";
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
import { useBattles } from "@/battlezone/hooks/useBattles";
import { ARTISTS, SONGS, type Song } from "@/data/musicData";

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
  const { user, profile, loading } = useAuth();

  const [form, setForm] = useState({
    title: "",
    region: "Zambia",
    battleType: "quick" as "quick" | "community",
    artistAId: "",
    artistBId: "",
    artistA: "",
    artistB: "",
    songAIds: ["", "", ""],
    songBIds: ["", "", ""],
    schedule: "",
    xSpaceUrl: "",
    notes: "",
  });
  const [coHostSearch, setCoHostSearch] = useState("");
  const [selectedCoHosts, setSelectedCoHosts] = useState<SongchainUser[]>([]);
  const [showCoHostDropdown, setShowCoHostDropdown] = useState(false);
  const [users, setUsers] = useState<SongchainUser[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const coHostDropdownRef = useRef<HTMLDivElement>(null);
  const { data: liveBattles = [] } = useBattles("live");
  // Battles stuck on 'live' for over a day are stale and must not brick the
  // launch cap for new hosts
  const liveBattlesCount = liveBattles.filter((battle) => {
    const createdAt = new Date(battle.createdAt).getTime();
    return !Number.isFinite(createdAt) || Date.now() - createdAt < 24 * 60 * 60 * 1000;
  }).length;

  const requiredSongs = form.battleType === "community" ? 3 : 1;

  const artistOptions = useMemo(
    () =>
      [...ARTISTS]
        .map((artist) => ({ id: artist.id, name: artist.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  const artistById = useMemo(() => {
    const map = new Map<string, (typeof ARTISTS)[number]>();
    ARTISTS.forEach((artist) => {
      map.set(artist.id, artist);
    });
    return map;
  }, []);

  const songsByArtist = useMemo(() => {
    const map = new Map<string, Song[]>();
    SONGS.forEach((song) => {
      const current = map.get(song.artistId) || [];
      current.push(song);
      map.set(song.artistId, current);
    });
    return map;
  }, []);
  
  // Fetch songchainn users for co-host search
  useEffect(() => {
    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from("audience_profiles")
        .select(
          "id, user_id, username, display_name, profile_name, avatar_url, created_at"
        )
        .not("user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      
      if (!data || error) {
        setUsers([]);
        return;
      }

      const pickName = (row: Record<string, unknown>): string => {
        const candidates = [
          row?.display_name,
          row?.profile_name,
          row?.username,
        ];
        for (const value of candidates) {
          if (typeof value === "string" && value.trim()) return value.trim();
        }
        const userId = String(row?.user_id || "");
        if (userId) return `User ${userId.slice(0, 6)}`;
        return "Listener";
      };

      const uniqueByUserId = new Map<string, SongchainUser>();
      (data as any[]).forEach((row) => {
        const userId = String(row?.user_id || "").trim();
        if (!userId) return;
        if (!uniqueByUserId.has(userId)) {
          uniqueByUserId.set(userId, {
            id: String(row?.id || userId),
            user_id: userId,
            username: row?.username ?? null,
            display_name: pickName(row),
            avatar_url: row?.avatar_url ?? null,
          });
        }
      });

      setUsers(Array.from(uniqueByUserId.values()));
    };

    fetchUsers();

    // Set up real-time subscription for new users
    const subscription = supabase
      .channel(`audience_profiles_changes-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audience_profiles' },
        (payload) => {
          const newUser = payload.new as any;
          if (newUser.user_id) {
            setUsers(prev => {
              const existing = prev.find(u => u.user_id === newUser.user_id);
              if (!existing) {
                return [
                  {
                    id: String(newUser.id || newUser.user_id),
                    user_id: newUser.user_id,
                    username: newUser.username ?? null,
                    display_name: newUser.display_name || newUser.username || "Listener",
                    avatar_url: newUser.avatar_url ?? null,
                  },
                  ...prev
                ].slice(0, 500); // Keep latest 500 users
              }
              return prev;
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(subscription);
    };
  }, []);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (coHostDropdownRef.current && !coHostDropdownRef.current.contains(event.target as Node)) {
        setShowCoHostDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  // Live audio runs on X Spaces while in-app voice is off; store a clean absolute URL.
  const normalizedSpaceUrl = (): string | null => {
    const raw = form.xSpaceUrl.trim();
    if (!raw) return null;
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  };

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
        songAIds: ["", "", ""],
      }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      artistBId: artistId,
      artistB: selectedArtist?.name || "",
      songBIds: ["", "", ""],
    }));
  };

  const selectSong = (slot: "A" | "B", index: number, songId: string) => {
    setForm((prev) => {
      const key = slot === "A" ? "songAIds" : "songBIds";
      const next = [...prev[key]];
      next[index] = songId;
      return { ...prev, [key]: next };
    });
  };

  const selectBattleType = (battleType: "quick" | "community") => {
    setForm((prev) => ({ ...prev, battleType }));
  };

  // Songs chosen for a side, in round order, resolved to {id, title}
  const pickedSongs = (slot: "A" | "B") => {
    const ids = (slot === "A" ? form.songAIds : form.songBIds).slice(0, requiredSongs);
    return ids
      .filter(Boolean)
      .map((id) => {
        const song = SONGS.find((s) => s.id === id);
        return { id, title: song?.title || "" };
      })
      .filter((s) => s.title);
  };

  const upsertHostInRoom = async (battleId: string, displayName: string) => {
    if (!user) return;
    await supabase.from("battle_rooms").delete().eq("battle_id", battleId).eq("user_id", user.id);
    const { error } = await supabase.from("battle_rooms").insert({
      battle_id: battleId,
      user_id: user.id,
      role: "host",
      display_name: displayName,
      is_muted: false,
      is_speaking: true,
    });
    if (error) throw error;
  };

  const upsertCoHostsInRoom = async (battleId: string) => {
    if (!selectedCoHosts.length) return;
    const failed: string[] = [];
    for (const coHost of selectedCoHosts) {
      const { error } = await supabase.rpc("add_battle_cohost", {
        _battle_id: battleId,
        _user_id: coHost.user_id,
        _display_name: coHost.display_name || coHost.username || "Co-Host",
      });
      if (error) failed.push(coHost.display_name || coHost.username || "a co-host");
    }
    if (failed.length) {
      toast({
        title: "Some co-hosts weren't seated",
        description: `Couldn't add: ${failed.join(", ")}. They can still join the room from their invite and take part in the battle.`,
      });
    }
  };

  // Notifications for "battle is live" are fanned out by the notify_battle_live
  // DB trigger the moment the battles row hits status 'live' — the client only
  // posts to the feed here.
  const broadcastBattleLaunch = async (battleId: string, title: string) => {
    if (!user) return;
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
    try { await (supabase as any).from("direct_messages").insert(directMessages); } catch { void 0; }

    const notificationsPayload = selectedCoHosts.map((coHost) => ({
      user_id: coHost.user_id,
      type: "cohost_invite",
      title: "Co-host Invite",
      message: `You have been selected as a co-host for "${title}".`,
      metadata: { battle_id: battleId, route: roomRoute, host_control_route: hostRoute },
    }));
    await supabase.from("notifications").insert(notificationsPayload);
  };

  const saveDraft = async () => {
    if (!user || !profile) {
      toast({ title: "Authentication required", description: "Please log in to save drafts." });
      return;
    }
    setIsSubmitting(true);
    try {
      const artistA = artistById.get(form.artistAId);
      const artistB = artistById.get(form.artistBId);
      const songsA = pickedSongs("A");
      const songsB = pickedSongs("B");
      const { error } = await supabase.from("battles").insert({
        title: form.title || "Untitled Battle",
        region: form.region || "Africa",
        artist_a_name: form.artistA || "TBD",
        artist_b_name: form.artistB || "TBD",
        artist_a_image: artistA?.profileImage ?? null,
        artist_b_image: artistB?.profileImage ?? null,
        artist_a_region: artistA?.location ?? form.region,
        artist_b_region: artistB?.location ?? form.region,
        song_a: songsA[0]?.title || "TBD",
        song_b: songsB[0]?.title || "TBD",
        songs_a: songsA.length ? songsA : null,
        songs_b: songsB.length ? songsB : null,
        battle_type: form.battleType,
        host_user_id: user.id,
        host_name: profile?.display_name || profile?.username || (user as any).user_metadata?.display_name || (user as any).user_metadata?.username || (user.email || "").split("@")[0] || "Host",
        co_hosts: selectedCoHosts.map((c) => c.display_name || c.username || ""),
        scheduled_time: form.schedule || null,
        x_space_url: normalizedSpaceUrl(),
        status: "upcoming",
        round: 1,
        total_rounds: requiredSongs,
      });
      if (error) throw error;
      toast({ title: "Draft saved", description: "Battle draft saved. Find it in Upcoming to launch later." });
      navigate(embedTo("/battles/upcoming"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "Unknown error");
      console.error("[HostCreate] saveDraft failed:", msg);
      toast({ title: "Failed to save draft", description: msg || "Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const createBattle = async (isLaunchNow: boolean) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "You need to sign in before you can launch or schedule a battle.",
      });
      return;
    }
    const hostName =
      profile?.display_name ||
      profile?.username ||
      (user as any).user_metadata?.display_name ||
      (user as any).user_metadata?.username ||
      (user.email || "").split("@")[0] ||
      "Host";

    const songsA = pickedSongs("A");
    const songsB = pickedSongs("B");
    const missing: string[] = [];
    if (!form.title.trim()) missing.push("Battle title");
    if (!form.artistAId || !form.artistA.trim()) missing.push("Artist A");
    if (!form.artistBId || !form.artistB.trim()) missing.push("Artist B");
    if (songsA.length < requiredSongs) {
      missing.push(requiredSongs === 1 ? "Song for Artist A" : `${requiredSongs} songs for Artist A (${songsA.length}/${requiredSongs} picked)`);
    }
    if (songsB.length < requiredSongs) {
      missing.push(requiredSongs === 1 ? "Song for Artist B" : `${requiredSongs} songs for Artist B (${songsB.length}/${requiredSongs} picked)`);
    }

    if (missing.length) {
      toast({
        title: "Missing required fields",
        description: `Add ${missing.join(", ")} before ${isLaunchNow ? "launching" : "scheduling"} the battle.`,
      });
      return;
    }

    if (!isLaunchNow && !form.schedule) {
      toast({
        title: "Pick a start time",
        description: "Scheduled battles need a start time. Set one and try again.",
      });
      return;
    }

    if (isLaunchNow && liveBattlesCount >= 5) {
      toast({
        title: "Live battle limit reached",
        description:
          "BattleZone supports 5 concurrent live battles. End one first, then launch a new battle.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const status = isLaunchNow ? "live" : "upcoming";
      const scheduledTime = isLaunchNow ? null : form.schedule || null;
      const artistA = artistById.get(form.artistAId);
      const artistB = artistById.get(form.artistBId);

      const { data, error } = await supabase
        .from("battles")
        .insert({
          title: form.title,
          region: form.region,
          artist_a_name: form.artistA || "TBD",
          artist_b_name: form.artistB || "TBD",
          artist_a_image: artistA?.profileImage ?? null,
          artist_b_image: artistB?.profileImage ?? null,
          artist_a_region: artistA?.location ?? form.region,
          artist_b_region: artistB?.location ?? form.region,
          song_a: songsA[0]?.title || "TBD",
          song_b: songsB[0]?.title || "TBD",
          songs_a: songsA,
          songs_b: songsB,
          battle_type: form.battleType,
          host_user_id: user.id,
          host_name: hostName,
          co_hosts: selectedCoHosts.map((c) => c.display_name || c.username || ""),
          scheduled_time: scheduledTime,
          x_space_url: normalizedSpaceUrl(),
          status,
          round: 1,
          total_rounds: requiredSongs,
        })
        .select()
        .single();

      if (error || !data) {
        toast({
          title: "Failed to create battle",
          description: error?.message || "Supabase did not return a battle row. Please try again.",
        });
        return;
      }

      await sendCoHostInvites(data.id, form.title);

      if (isLaunchNow) {
        await upsertHostInRoom(data.id, hostName);
        await upsertCoHostsInRoom(data.id);
        await broadcastBattleLaunch(data.id, form.title);
        toast({ title: "Battle launched", description: "You are now live as host. Audience can join in real time." });
        navigate(embedTo(`/room/${data.id}`));
      } else {
        toast({ title: "Battle scheduled", description: "Your battle is now in the upcoming feed." });
        navigate(embedTo("/battles/upcoming"));
      }
    } catch (err) {
      const message = (err as any)?.message || "Unexpected error. Please try again.";
      toast({ title: "Failed to create battle", description: message });
    } finally {
      setIsSubmitting(false);
    }
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

          {/* Battle type */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Battle Type</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => selectBattleType("quick")}
                className={`rounded-xl border p-4 text-left transition-all ${
                  form.battleType === "quick"
                    ? "border-primary bg-primary/10 shadow-[0_0_20px_hsl(var(--neon-green)/0.15)]"
                    : "border-border bg-card/80 hover:border-primary/30"
                }`}
              >
                <p className="font-bold text-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" /> Quick Battle
                </p>
                <p className="text-xs text-muted-foreground mt-1">One song from each artist. Single round, winner takes it.</p>
              </button>
              <button
                type="button"
                onClick={() => selectBattleType("community")}
                className={`rounded-xl border p-4 text-left transition-all ${
                  form.battleType === "community"
                    ? "border-primary bg-primary/10 shadow-[0_0_20px_hsl(var(--neon-green)/0.15)]"
                    : "border-border bg-card/80 hover:border-primary/30"
                }`}
              >
                <p className="font-bold text-foreground flex items-center gap-2">
                  <Music className="h-4 w-4 text-primary" /> Community Battle
                </p>
                <p className="text-xs text-muted-foreground mt-1">Three songs from each artist. One song per round across 3 rounds.</p>
              </button>
            </div>
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

          {/* Songs (one select per round, per artist) */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {form.artistA ? `${form.artistA} Songs` : "Artist A Songs"}
              </label>
              {Array.from({ length: requiredSongs }).map((_, index) => (
                <SelectWrapper key={`song-a-${index}`} icon={Music}>
                  <select
                    value={form.songAIds[index] || ""}
                    onChange={(e) => selectSong("A", index, e.target.value)}
                    className={selectClass}
                    disabled={!form.artistAId}
                  >
                    <option value="">
                      {form.artistAId
                        ? requiredSongs === 1 ? "Select song" : `Select round ${index + 1} song`
                        : "Select Artist A first"}
                    </option>
                    {(songsByArtist.get(form.artistAId) || [])
                      .filter((song) => song.id === form.songAIds[index] || !form.songAIds.includes(song.id))
                      .map((song) => (
                        <option key={song.id} value={song.id}>
                          {song.title}
                        </option>
                      ))}
                  </select>
                </SelectWrapper>
              ))}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {form.artistB ? `${form.artistB} Songs` : "Artist B Songs"}
              </label>
              {Array.from({ length: requiredSongs }).map((_, index) => (
                <SelectWrapper key={`song-b-${index}`} icon={Music}>
                  <select
                    value={form.songBIds[index] || ""}
                    onChange={(e) => selectSong("B", index, e.target.value)}
                    className={selectClass}
                    disabled={!form.artistBId}
                  >
                    <option value="">
                      {form.artistBId
                        ? requiredSongs === 1 ? "Select song" : `Select round ${index + 1} song`
                        : "Select Artist B first"}
                    </option>
                    {(songsByArtist.get(form.artistBId) || [])
                      .filter((song) => song.id === form.songBIds[index] || !form.songBIds.includes(song.id))
                      .map((song) => (
                        <option key={song.id} value={song.id}>
                          {song.title}
                        </option>
                      ))}
                  </select>
                </SelectWrapper>
              ))}
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

          {/* X Space link for live audio */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">X Space Link (optional)</label>
            <div className="relative">
              <Radio className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <input
                value={form.xSpaceUrl}
                onChange={(e) => update("xSpaceUrl", e.target.value)}
                placeholder="https://x.com/i/spaces/..."
                className={inputClass}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Live audio runs on X Spaces. Paste your Space link and listeners get a "Listen on X" button in the battle room, while voting and chat stay right here.
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

            <div className="relative" ref={coHostDropdownRef}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <input
                value={coHostSearch}
                onChange={(e) => { setCoHostSearch(e.target.value); setShowCoHostDropdown(true); }}
                onFocus={() => setShowCoHostDropdown(true)}
                placeholder="Search $ongChainn username..."
                disabled={selectedCoHosts.length >= 4}
                className={`${inputClass} disabled:opacity-50 pr-20`}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowCoHostDropdown(!showCoHostDropdown)}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  disabled={selectedCoHosts.length >= 4}
                >
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showCoHostDropdown ? 'rotate-180' : ''}`} />
                </button>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </div>

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
            <button
              onClick={saveDraft}
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm sm:text-base font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
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
