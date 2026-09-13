import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/battlezone/integrations/supabase/client";

/**
 * Profile pictures for everyone in a battle room, in ONE query.
 *
 * battle_rooms carries no avatar column, so pictures come from
 * audience_profiles: profile_picture_url first, then avatar_url. The query key
 * is the sorted set of user ids, so it refetches when somebody joins or leaves
 * and is shared (cached) between LiveRoom and SpeakerManagement. The previous
 * map is kept while a new one loads so faces do not flicker back to letters
 * every time the room changes.
 */

const EMPTY = new Map<string, string>();

export function useParticipantAvatars(userIds: string[]): Map<string, string> {
  const ids = Array.from(new Set(userIds.filter(Boolean))).sort();
  const key = ids.join(",");
  const last = useRef<Map<string, string>>(EMPTY);

  const { data } = useQuery({
    queryKey: ["battle-room-avatars", key],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("audience_profiles")
        .select("user_id, profile_picture_url, avatar_url")
        .in("user_id", key.split(","));
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of rows ?? []) {
        const url = (row.profile_picture_url || row.avatar_url || "").trim();
        if (row.user_id && url && !map.has(row.user_id)) map.set(row.user_id, url);
      }
      return map;
    },
  });

  if (data) last.current = data;
  return data ?? last.current;
}
