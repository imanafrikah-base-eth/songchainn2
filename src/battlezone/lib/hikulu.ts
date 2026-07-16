import { supabase } from "@/battlezone/integrations/supabase/client";

/* $HIKULU, the AI judge. Fixed bot identity created by the
   20260716000000_hikulu_ai_judge migration; the hikulu-judge edge function
   posts to room chat and writes verdicts as this user. */

export const HIKULU_USER_ID = "b0b00000-0000-4000-a000-000000000001";
export const HIKULU_NAME = "$HIKULU";

export function mentionsHikulu(text: string): boolean {
  return /(\$|@)?hikulu/i.test(text);
}

/** Fire-and-forget: ask $HIKULU to reply in the battle room chat. */
export function pingHikuluChat(battleId: string, message: string, userName?: string): void {
  void supabase.functions
    .invoke("hikulu-judge", { body: { action: "chat", battleId, message, userName } })
    .catch(() => undefined);
}

/** Idempotent: generate (or fetch) the post-battle verdict. */
export async function requestHikuluVerdict(battleId: string): Promise<void> {
  try {
    await supabase.functions.invoke("hikulu-judge", { body: { action: "verdict", battleId } });
  } catch {
    /* verdict is best-effort; the results page retries on view */
  }
}
