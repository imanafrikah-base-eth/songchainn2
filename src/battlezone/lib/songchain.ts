import { supabase } from "@/battlezone/integrations/supabase/client";

export async function fetchSongchainUserIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from("audience_profiles")
    .select("user_id, onboarding_completed")
    .not("user_id", "is", null)
    .eq("onboarding_completed", true)
    .limit(5000);

  if (error || !data) return [];

  const ids = data
    .map((row) => row.user_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  return [...new Set(ids)];
}

export async function fetchSongchainUserIdSet(): Promise<Set<string>> {
  return new Set(await fetchSongchainUserIds());
}
