// $HIKULU - the AI judge of WaveWarz Africa.
// Two actions:
//   { action: "chat", battleId, message }  -> in-character reply posted to the room chat
//   { action: "verdict", battleId }        -> one-time post-battle verdict, awards judge points
// Uses ANTHROPIC_API_KEY when set, otherwise falls back to the Lovable AI gateway.

import { createClient } from "npm:@supabase/supabase-js@2";

const HIKULU_USER_ID = "b0b00000-0000-4000-a000-000000000001";
const HIKULU_NAME = "$HIKULU";
const CHAT_COOLDOWN_MS = 12_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const PERSONA = `You are $HIKULU, the wisest man on the planet of music and the resident AI judge of WaveWarz Africa, a live music battle arena for African artists. You have heard every kick, every snare and every lie ever told on a beat. You speak with the weight of an elder and the wit of a battle MC: warm, sharp, a little theatrical, never cruel and never boring. You love African music deeply and you respect every artist who dares to step in the ring.

Rules for everything you write:
- Never use the em dash character. Use commas or periods instead.
- Never invent lyrics, quotes or facts about the songs. Judge from the evidence you are given: the vote race, the chat energy, the song titles and how the crowd moved.
- Keep it PG-13. War the songs, respect the people.`;

interface BattleRow {
  id: string;
  title: string;
  status: string;
  artist_a_name: string;
  artist_b_name: string;
  song_a: string;
  song_b: string;
  songs_a: Array<{ id: string; title: string }> | null;
  songs_b: Array<{ id: string; title: string }> | null;
  region: string;
  round: number;
  total_rounds: number;
  battle_type: string;
  winner: string | null;
  hikulu_verdict: string | null;
  hikulu_verdict_at: string | null;
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// Strip em dashes (UI copy rule) and keep replies chat-sized.
function tidy(text: string, maxLen = 420): string {
  const cleaned = text.replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 3).trimEnd()}...` : cleaned;
}

async function askLlm(system: string, user: string, maxTokens: number): Promise<string> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("HIKULU_MODEL") || "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text ?? "";
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.8,
      }),
    });
    if (!res.ok) throw new Error(`Lovable gateway ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  throw new Error("NO_LLM_KEY");
}

async function loadBattle(db: ReturnType<typeof admin>, battleId: string): Promise<BattleRow | null> {
  const { data } = await db.from("battles").select("*").eq("id", battleId).maybeSingle();
  return data as BattleRow | null;
}

async function battleContext(db: ReturnType<typeof admin>, battle: BattleRow): Promise<string> {
  const [{ data: votes }, { data: messages }, { data: participants }] = await Promise.all([
    db.from("battle_votes").select("side, round").eq("battle_id", battle.id),
    db
      .from("room_messages")
      .select("user_id, message, created_at")
      .eq("room_name", battle.id)
      .order("created_at", { ascending: false })
      .limit(40),
    db.from("battle_rooms").select("user_id, display_name").eq("battle_id", battle.id),
  ]);

  const names = new Map((participants ?? []).map((p) => [p.user_id, p.display_name || "Listener"]));
  names.set(HIKULU_USER_ID, HIKULU_NAME);

  const tally = new Map<number, { A: number; B: number }>();
  for (const v of votes ?? []) {
    const row = tally.get(v.round) ?? { A: 0, B: 0 };
    row[v.side as "A" | "B"] += 1;
    tally.set(v.round, row);
  }
  const voteLines = [...tally.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, t]) => `Round ${round}: ${battle.artist_a_name} ${t.A} votes vs ${battle.artist_b_name} ${t.B} votes`);

  const chatLines = (messages ?? [])
    .reverse()
    .map((m) => `${names.get(m.user_id) || "Listener"}: ${String(m.message).slice(0, 160)}`);

  const songsA = battle.songs_a?.length ? battle.songs_a.map((s) => s.title).join(", ") : battle.song_a;
  const songsB = battle.songs_b?.length ? battle.songs_b.map((s) => s.title).join(", ") : battle.song_b;

  return [
    `Battle: "${battle.title}" (${battle.battle_type} battle, ${battle.total_rounds} round(s), region: ${battle.region}, status: ${battle.status})`,
    `Side A: ${battle.artist_a_name}, song(s): ${songsA}`,
    `Side B: ${battle.artist_b_name}, song(s): ${songsB}`,
    voteLines.length ? `Vote race so far:\n${voteLines.join("\n")}` : "No votes recorded yet.",
    chatLines.length ? `Recent room chat (oldest first):\n${chatLines.join("\n")}` : "The chat has been quiet.",
  ].join("\n\n");
}

async function speakInRoom(db: ReturnType<typeof admin>, battleId: string, text: string) {
  // Presence row makes the room UI resolve his display name.
  await db.from("battle_rooms").upsert(
    {
      battle_id: battleId,
      user_id: HIKULU_USER_ID,
      role: "audience",
      display_name: HIKULU_NAME,
      is_muted: true,
      is_speaking: false,
    },
    { onConflict: "battle_id,user_id", ignoreDuplicates: true },
  );
  const { error } = await db
    .from("room_messages")
    .insert({ room_name: battleId, user_id: HIKULU_USER_ID, message: text });
  if (error) throw new Error(`room_messages insert: ${error.message}`);
}

async function handleChat(db: ReturnType<typeof admin>, battle: BattleRow, message: string, userName: string) {
  if (battle.status !== "live" && battle.status !== "ended") {
    return json({ skipped: true, reason: "Battle is not open" });
  }

  const { data: lastBot } = await db
    .from("room_messages")
    .select("created_at")
    .eq("room_name", battle.id)
    .eq("user_id", HIKULU_USER_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastBot && Date.now() - new Date(lastBot.created_at).getTime() < CHAT_COOLDOWN_MS) {
    return json({ skipped: true, reason: "cooldown" });
  }

  const context = await battleContext(db, battle);
  const reply = await askLlm(
    PERSONA,
    `${context}\n\nA listener named ${userName} just said to you in the room chat: "${message.slice(0, 500)}"\n\nReply to them in character as $HIKULU. One or two sentences, chat-message length, no preamble, no quotation marks around your reply.`,
    200,
  );

  const text = tidy(reply, 300);
  if (!text) return json({ skipped: true, reason: "empty reply" });
  await speakInRoom(db, battle.id, text);
  return json({ ok: true, reply: text });
}

async function handleVerdict(db: ReturnType<typeof admin>, battle: BattleRow) {
  if (battle.status !== "ended") return json({ error: "Battle has not ended yet" }, 400);
  if (battle.hikulu_verdict) {
    return json({ ok: true, existing: true, verdict: battle.hikulu_verdict });
  }

  // Claim lock so concurrent callers (host + results page) generate only once.
  const { data: claimed } = await db
    .from("battles")
    .update({ hikulu_verdict_at: new Date().toISOString() })
    .eq("id", battle.id)
    .is("hikulu_verdict_at", null)
    .select("id");
  if (!claimed?.length) return json({ ok: true, pending: true }, 202);

  try {
    const context = await battleContext(db, battle);
    const raw = await askLlm(
      PERSONA,
      `${context}\n\nThe battle has ended. As $HIKULU, deliver your final verdict. Weigh how each side moved the crowd across the rounds. Award each side judge points from 0 to 10 (they cannot be equal). Respond with ONLY a JSON object, no markdown fences, in this exact shape:\n{"points_a": <0-10>, "points_b": <0-10>, "verdict": "<2 to 4 sentences naming both artists, what won you over and what fell flat>", "one_liner": "<one punchy sentence you would shout to the room>"}`,
      600,
    );

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Unparseable verdict: ${raw.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]);
    const clamp = (n: unknown) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));
    let pointsA = clamp(parsed.points_a);
    let pointsB = clamp(parsed.points_b);
    if (pointsA === pointsB) pointsA = Math.min(10, pointsA + 1);
    const verdict = tidy(String(parsed.verdict || ""), 700);
    const oneLiner = tidy(String(parsed.one_liner || ""), 200);
    if (!verdict) throw new Error("Empty verdict text");

    const { data: votes } = await db.from("battle_votes").select("side").eq("battle_id", battle.id);
    const votesA = (votes ?? []).filter((v) => v.side === "A").length;
    const votesB = (votes ?? []).filter((v) => v.side === "B").length;

    const update: Record<string, unknown> = {
      hikulu_points_a: pointsA,
      hikulu_points_b: pointsB,
      hikulu_verdict: verdict,
      hikulu_verdict_at: new Date().toISOString(),
    };
    // The host's declared winner stands; otherwise votes + judge points decide.
    if (!battle.winner) {
      const scoreA = votesA + pointsA;
      const scoreB = votesB + pointsB;
      update.winner = scoreA === scoreB ? (pointsA > pointsB ? "A" : "B") : scoreA > scoreB ? "A" : "B";
    }
    const { error: updateError } = await db.from("battles").update(update).eq("id", battle.id);
    if (updateError) throw new Error(`battles update: ${updateError.message}`);

    const announcement = tidy(
      `THE VERDICT IS IN. ${oneLiner || verdict} My scorecard: ${battle.artist_a_name} ${pointsA}, ${battle.artist_b_name} ${pointsB}. ${verdict}`,
      900,
    );
    await speakInRoom(db, battle.id, announcement);

    return json({
      ok: true,
      verdict,
      one_liner: oneLiner,
      points_a: pointsA,
      points_b: pointsB,
      winner: (update.winner as string) ?? battle.winner,
    });
  } catch (err) {
    // Release the lock so a later call can retry.
    await db.from("battles").update({ hikulu_verdict_at: null }).eq("id", battle.id).is("hikulu_verdict", null);
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const { action, battleId } = body as { action?: string; battleId?: string };
    if (!battleId || !/^[0-9a-f-]{36}$/i.test(battleId)) return json({ error: "Invalid battleId" }, 400);

    const db = admin();
    const battle = await loadBattle(db, battleId);
    if (!battle) return json({ error: "Battle not found" }, 404);

    if (action === "chat") {
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return json({ error: "Message required" }, 400);
      const userName = typeof body.userName === "string" && body.userName.trim() ? body.userName.trim().slice(0, 60) : "a listener";
      return await handleChat(db, battle, message, userName);
    }
    if (action === "verdict") {
      return await handleVerdict(db, battle);
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hikulu-judge]", message);
    if (message === "NO_LLM_KEY") {
      return json({ error: "HIKULU is not configured: set ANTHROPIC_API_KEY or LOVABLE_API_KEY as an edge function secret" }, 503);
    }
    return json({ error: "HIKULU lost his train of thought. Try again." }, 500);
  }
});
