import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/battlezone/integrations/supabase/client";

/**
 * Which of these songs have a coin somebody can actually buy.
 *
 * Backing a corner in a battle buys that song's coin, so a corner without a
 * live coin cannot be backed and the board has to say so rather than failing
 * at the wallet. Only a coin that really minted counts: a row that is still
 * requested or that failed is not a market.
 */
export function useSongCoinAddresses(songIds: Array<string | null | undefined>) {
  const ids = [...new Set(songIds.filter((id): id is string => Boolean(id)))].sort();

  return useQuery({
    queryKey: ["battle-song-coins", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from("song_coins")
        .select("song_id, zora_coin_address, mint_status")
        .in("song_id", ids)
        .eq("mint_status", "minted");
      if (error) throw error;

      const map = new Map<string, string>();
      for (const row of (data ?? []) as Array<{ song_id: string; zora_coin_address: string | null }>) {
        if (row.zora_coin_address && /^0x[a-fA-F0-9]{40}$/.test(row.zora_coin_address)) {
          map.set(String(row.song_id), row.zora_coin_address);
        }
      }
      return map;
    },
  });
}

export default useSongCoinAddresses;
