import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/battlezone/integrations/supabase/client";

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
  created_at: string;
  updated_at: string;
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
  };
}

async function fetchBattles(status?: string): Promise<Battle[]> {
  let query = supabase
    .from("battles")
    .select("*");

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

export function useBattle(id: string | undefined) {
  return useQuery({
    queryKey: ["battle", id],
    queryFn: async () => {
      if (!id) return null;
      const battles = await fetchBattles();
      return battles.find((b) => b.id === id) || null;
    },
    enabled: !!id,
  });
}
