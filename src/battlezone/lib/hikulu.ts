import { supabase } from "@/battlezone/integrations/supabase/client";

/* The AI judges of WaveWarz Africa. Fixed bot identities created by the
   hikulu_ai_judge, nakulu_companion_judge and council_of_elders migrations;
   the hikulu-judge edge function posts to room chat and writes verdicts as
   these users.

   $HIKULU and NAKULU are the resident judging couple; their points score
   every battle. The other five are the Council of Elders, held ready for the
   Monarch system (rules TBD): chat-ready today, no verdict scoring yet. */

export type JudgeKey = "hikulu" | "nakulu" | "ngoma" | "jeli" | "kalimba" | "imbokodo" | "mzee";

export interface AiJudge {
  key: JudgeKey;
  id: string;
  name: string;
  /** Matches when this judge is addressed in room chat. */
  mention: RegExp;
}

export const AI_JUDGES: AiJudge[] = [
  /* Pronounced "Shikulu": the $ stands in for the S, so "shikulu" (which
     contains "hikulu") and bare "hikulu" both summon him. */
  { key: "hikulu", id: "b0b00000-0000-4000-a000-000000000001", name: "$HIKULU", mention: /(\$|@)?hikulu/i },
  { key: "nakulu", id: "b0b00000-0000-4000-a000-000000000002", name: "NAKULU", mention: /(\$|@)?nakulu/i },
  /* The Council of Elders. */
  { key: "ngoma", id: "b0b00000-0000-4000-a000-000000000003", name: "NGOMA", mention: /\b(\$|@)?ngoma\b/i },
  { key: "jeli", id: "b0b00000-0000-4000-a000-000000000004", name: "JELI", mention: /\b(\$|@)?jeli\b/i },
  { key: "kalimba", id: "b0b00000-0000-4000-a000-000000000005", name: "KALIMBA", mention: /\b(\$|@)?kalimba\b/i },
  { key: "imbokodo", id: "b0b00000-0000-4000-a000-000000000006", name: "IMBOKODO", mention: /\b(\$|@)?imbokodo\b/i },
  { key: "mzee", id: "b0b00000-0000-4000-a000-000000000007", name: "MZEE", mention: /\b(\$|@)?mzee\b/i },
];

export const JUDGE_BY_USER_ID: ReadonlyMap<string, AiJudge> = new Map(AI_JUDGES.map((j) => [j.id, j]));

/** Every judge addressed in a chat message, in registry order. */
export function judgesMentioned(text: string): JudgeKey[] {
  return AI_JUDGES.filter((j) => j.mention.test(text)).map((j) => j.key);
}

/** Fire-and-forget: ask one of the judges to reply in the battle room chat. */
export function pingJudgeChat(battleId: string, message: string, judge: JudgeKey, userName?: string): void {
  void supabase.functions
    .invoke("hikulu-judge", { body: { action: "chat", battleId, message, judge, userName } })
    .catch(() => undefined);
}

/** Idempotent: generate (or fetch) the judging couple's post-battle verdicts. */
export async function requestHikuluVerdict(battleId: string): Promise<void> {
  try {
    await supabase.functions.invoke("hikulu-judge", { body: { action: "verdict", battleId } });
  } catch {
    /* verdict is best-effort; the results page retries on view */
  }
}
