import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/battlezone/integrations/supabase/client";
import type { BattleStage } from "@/battlezone/lib/battleStages";

export interface BattleRow {
  id: string;
  title: string;
  status: string;
  artist_a_name: string;
  artist_a_image: string | null;
  artist_a_region: string | null;
  artist_b_name: string;
  artist_b_image: string | null;
  artist_b_region: string | null;
  song_a: string;
  song_b: string;
  host_user_id: string | null;
  host_name: string;
  co_hosts: string[] | null;
  region: string;
  round: number;
  total_rounds: number;
  winner: string | null;
  scheduled_time: string | null;
  ended_time: string | null;
  x_space_url: string | null;
  battle_type: string | null;
  songs_a: Array<{ id: string; title: string }> | null;
  songs_b: Array<{ id: string; title: string }> | null;
  hikulu_points_a: number;
  hikulu_points_b: number;
  hikulu_verdict: string | null;
  nakulu_points_a: number;
  nakulu_points_b: number;
  nakulu_verdict: string | null;
  council_verdicts: CouncilVerdict[] | null;
  council_points_a: number | null;
  council_points_b: number | null;
  decided_by: string | null;
  voting_open: boolean | null;
  stage: string | null;
  music_ends_at: string | null;
  closes_at: string | null;
  launched_at?: string | null;
  voice_enabled?: boolean | null;
  created_at: string;
  updated_at: string;
}

/** One elder's card, written only when the couple could not settle the battle. */
export interface CouncilVerdict {
  key: string;
  name: string;
  points_a: number;
  points_b: number;
  verdict: string;
  one_liner: string;
}

// Adapted Battle type for UI compatibility with BattleCard
export interface Battle {
  id: string;
  title: string;
  status: "live" | "upcoming" | "ended";
  artistA: { name: string; image: string; region: string };
  artistB: { name: string; image: string; region: string };
  songA: string;
  songB: string;
  host: string;
  hostUserId?: string;
  coHosts: string[];
  listeners: number;
  votesA: number;
  votesB: number;
  region: string;
  scheduledTime?: string;
  endedTime?: string;
  winner?: "A" | "B";
  round: number;
  totalRounds: number;
  xSpaceUrl?: string;
  battleType: "quick" | "community";
  songsA: Array<{ id: string; title: string }>;
  songsB: Array<{ id: string; title: string }>;
  hikuluPointsA: number;
  hikuluPointsB: number;
  hikuluVerdict?: string;
  nakuluPointsA: number;
  nakuluPointsB: number;
  nakuluVerdict?: string;
  councilVerdicts: CouncilVerdict[];
  councilPointsA: number;
  councilPointsB: number;
  decidedBy?: "host" | "judges" | "council";
  votingOpen: boolean;
  /** Which room this battle is in. Decides whether anything in it is worth money. */
  stage: BattleStage;
  /** When the last song is due to finish. Null on a battle that never went live. */
  musicEndsAt?: string;
  /** When the poll and the trading ground both close. */
  closesAt?: string;
  /** When the host pressed go live, when the row has it. The music clock anchors here. */
  launchedAt?: string;
  /** In-app voice is on for this battle. Only the server turns it on. */
  voiceEnabled: boolean;
  createdAt: string;
}

function rowToBattle(row: BattleRow, votesA = 0, votesB = 0, listeners = 0): Battle {
  return {
    id: row.id,
    title: row.title,
    status: row.status as Battle["status"],
    artistA: {
      name: row.artist_a_name,
      image: row.artist_a_image || "",
      region: row.artist_a_region || row.region,
    },
    artistB: {
      name: row.artist_b_name,
      image: row.artist_b_image || "",
      region: row.artist_b_region || row.region,
    },
    songA: row.song_a,
    songB: row.song_b,
    host: row.host_name,
    hostUserId: row.host_user_id || undefined,
    coHosts: row.co_hosts || [],
    listeners,
    votesA,
    votesB,
    region: row.region,
    scheduledTime: row.scheduled_time || undefined,
    endedTime: row.ended_time || undefined,
    winner: (row.winner as Battle["winner"]) || undefined,
    round: row.round,
    totalRounds: row.total_rounds,
    xSpaceUrl: row.x_space_url || undefined,
    battleType: row.battle_type === "community" ? "community" : "quick",
    songsA: Array.isArray(row.songs_a) ? row.songs_a : [],
    songsB: Array.isArray(row.songs_b) ? row.songs_b : [],
    hikuluPointsA: row.hikulu_points_a || 0,
    hikuluPointsB: row.hikulu_points_b || 0,
    hikuluVerdict: row.hikulu_verdict || undefined,
    nakuluPointsA: row.nakulu_points_a || 0,
    nakuluPointsB: row.nakulu_points_b || 0,
    nakuluVerdict: row.nakulu_verdict || undefined,
    councilVerdicts: Array.isArray(row.council_verdicts) ? row.council_verdicts : [],
    councilPointsA: row.council_points_a || 0,
    councilPointsB: row.council_points_b || 0,
    decidedBy: (row.decided_by as Battle["decidedBy"]) || undefined,
    votingOpen: row.voting_open !== false,
    // Anything created before the split existed is a Main Stage battle, which
    // is what the column default says too.
    stage: row.stage === "open_mic" ? "open_mic" : "main_stage",
    musicEndsAt: row.music_ends_at || undefined,
    closesAt: row.closes_at || undefined,
    launchedAt: row.launched_at || undefined,
    voiceEnabled: row.voice_enabled === true,
    createdAt: row.created_at,
  };
}

async function fetchBattles(status?: string): Promise<Battle[]> {
  let query = supabase
    .from("battles")
    .select("*");

  // A battle kept in history is off every board. Only the artists testing
  // WaveWarz Africa can put one there, and its page still works for anyone
  // holding the link.
  query = query.is("hidden_at", null);

  if (status) query = query.eq("status", status);
  query = query.order("created_at", { ascending: false });

  const { data: battles, error } = await query;
  if (error) throw error;
  if (!battles?.length) return [];

  const battleIds = battles.map((b) => b.id);

  // Fetch vote counts
  const { data: voteCounts } = await supabase
    .from("battle_vote_counts")
    .select("*")
    .in("battle_id", battleIds);

  // Fetch listener counts
  const { data: listenerCounts } = await supabase
    .from("battle_listener_counts")
    .select("*")
    .in("battle_id", battleIds);

  const voteMap = new Map<string, { A: number; B: number }>();
  voteCounts?.forEach((v: any) => {
    const existing = voteMap.get(v.battle_id) || { A: 0, B: 0 };
    existing[v.side as "A" | "B"] = v.vote_count;
    voteMap.set(v.battle_id, existing);
  });

  const listenerMap = new Map<string, number>();
  listenerCounts?.forEach((l: any) => {
    listenerMap.set(l.battle_id, l.listener_count);
  });

  return battles.map((row: any) => {
    const votes = voteMap.get(row.id) || { A: 0, B: 0 };
    return rowToBattle(row, votes.A, votes.B, listenerMap.get(row.id) || 0);
  });
}

export function useBattles(status?: string) {
  return useQuery({
    queryKey: ["battles", status],
    queryFn: () => fetchBattles(status),
    refetchInterval: status === "live" ? 5000 : 15000,
  });
}

async function fetchBattle(id: string): Promise<Battle | null> {
  const { data: row, error } = await supabase
    .from("battles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const [{ data: voteCounts }, { data: listenerCounts }] = await Promise.all([
    supabase.from("battle_vote_counts").select("side, vote_count").eq("battle_id", id),
    supabase.from("battle_listener_counts").select("listener_count").eq("battle_id", id),
  ]);

  const votesA = voteCounts?.find((v) => v.side === "A")?.vote_count ?? 0;
  const votesB = voteCounts?.find((v) => v.side === "B")?.vote_count ?? 0;
  const listeners = listenerCounts?.[0]?.listener_count ?? 0;

  return rowToBattle(row as unknown as BattleRow, votesA, votesB, listeners);
}

// Polled, not one-shot: the live room reads round / status / winner / voting_open
// off this row, so without a refetch the audience never sees the host advance a
// round or end the battle -- they keep voting into a round that already closed.
export function useBattle(id: string | undefined) {
  return useQuery({
    queryKey: ["battle", id],
    queryFn: () => (id ? fetchBattle(id) : Promise.resolve(null)),
    enabled: !!id,
    refetchInterval: 5000,
  });
}
