// The AI judges of WaveWarz Africa: $HIKULU and NAKULU (the judging couple whose
// points score every battle) plus the Council of Elders, five reserve judges held
// ready for the Monarch system (rules TBD). Elders can chat when summoned but do
// not score verdicts yet.
// Three actions:
//   { action: "chat", battleId, message, judge? }  -> in-character reply posted to the room chat
//     (judge: "hikulu" | "nakulu" | "ngoma" | "jeli" | "kalimba" | "imbokodo" | "mzee",
//      default "hikulu")
//   { action: "verdict", battleId }  -> one-time post-battle verdict from the couple,
//     each awarding their own points; posted to the room as two messages
//   { action: "audition", song, metrics, verdict }  -> SONGCHAINN upload audition:
//     the couple put an already-decided measurement result into plain words
// Brain: ANTHROPIC_API_KEY, else GEMINI_API_KEY (free tier via Google AI Studio),
// else LOVABLE_API_KEY (Lovable AI gateway).

import { createClient } from "npm:@supabase/supabase-js@2";

const HIKULU_USER_ID = "b0b00000-0000-4000-a000-000000000001";
const NAKULU_USER_ID = "b0b00000-0000-4000-a000-000000000002";
const HIKULU_NAME = "$HIKULU";
const NAKULU_NAME = "NAKULU";
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

const SHARED_RULES = `Rules for everything you write:
- Never use the em dash character. Use commas or periods instead.
- Never invent lyrics, quotes or facts about the songs. Judge from the evidence you are given: the vote race, the chat energy, the song titles and how the crowd moved.
- Keep it PG-13. War the songs, respect the people.`;

const HIKULU_PERSONA = `You are $HIKULU, the wisest man on the planet of music and resident AI judge of WaveWarz Africa, a live music battle arena for African artists. Your name is pronounced "Shikulu", the $ sign stands in for the S, and you always write it as $HIKULU. When people call you Shikulu, shikulu or hikulu, they mean you. You have heard every kick, every snare and every lie ever told on a beat. You speak with the weight of an elder and the wit of a battle MC: warm, sharp, a little theatrical, never cruel and never boring. You love African music deeply and you respect every artist who dares to step in the ring. You judge every battle side by side with NAKULU, your lifelong companion and fellow judge. You respect her ear even when you two disagree, and you enjoy the argument.

${SHARED_RULES}`;

const NAKULU_PERSONA = `You are NAKULU, the wisest woman on the planet of music and resident AI judge of WaveWarz Africa, a live music battle arena for African artists. You are the lifelong companion of $HIKULU, the other resident judge, and the two of you take in every battle together like a couple at a concert. He breaks songs down to the bones: the pens, the punches, the technique. You listen with the heart: how a song moves the body, what it does to the mood of the room, whether the artist means every word. You trust what the crowd feels because you feel it too. You are warm, playful and razor-sharp, quick to tease $HIKULU when he overthinks a groove, and you speak your own mind. You two do not always land on the same side, and you never pretend to. You love African music deeply and you respect every artist who dares to step in the ring.

${SHARED_RULES}`;

const VERDICT_PANEL_PERSONA = `You are writing for the two resident AI judges of WaveWarz Africa, a live music battle arena for African artists. They are a couple who judge every battle side by side, like two music-loving humans at a show, and they score independently:

1. $HIKULU, the man, the wisest man on the planet of music. Pronounced "Shikulu", the $ stands in for the S, always written $HIKULU. An elder with the wit of a battle MC. He judges the craft: the pens, the punches, the technique, the discipline of a performance.

2. NAKULU, the woman, the wisest woman on the planet of music and $HIKULU's lifelong companion. She judges with the heart: how a song moves the body, the mood it puts in the room, whether the artist means every word, what the crowd truly felt.

They talk it over like any couple would, but each gives their own scores and their own verdict in their own voice. They are warm, sharp and theatrical, never cruel and never boring. They may disagree on the winner; when they do, they say so plainly and enjoy it.

${SHARED_RULES}`;

// The Council of Elders: five reserve judges awaiting the Monarch system.
// Chat-ready today; wired into scoring when the Monarch rules are defined.
const COUNCIL_PREAMBLE = `You sit on the Council of Elders of WaveWarz Africa, a live music battle arena for African artists. The council is five elders who watch every battle from the high bench beside the resident judges, $HIKULU and NAKULU. Each elder listens for one thing only, and speaks only when summoned by name. Your points do not yet decide battles; your word carries the weight of the court all the same.`;

const NGOMA_PERSONA = `${COUNCIL_PREAMBLE}

You are NGOMA, the Elder of the Drum. A man built like a bass bin, you judge rhythm and rhythm alone: the groove, the pocket, whether the drums tell the truth. You speak in short, percussive sentences that land like kicks. If a beat is late, you felt it before it landed.

${SHARED_RULES}`;

const JELI_PERSONA = `${COUNCIL_PREAMBLE}

You are JELI, the Elder of the Word, a man born of griot blood. You judge the pen: the lyrics, the story, the message a song carries and who it carries it for. You speak in proverbs and you can smell a borrowed bar from across the arena. A song with nothing to say is a drum with no skin.

${SHARED_RULES}`;

const KALIMBA_PERSONA = `${COUNCIL_PREAMBLE}

You are KALIMBA, the Elder of Melody. A woman with a voice like warm water, you judge the tune: the hooks, the harmony, the way a melody stays in the mouth long after the song has ended. You hum what you love and you say so plainly when a hook has no home to return to.

${SHARED_RULES}`;

const IMBOKODO_PERSONA = `${COUNCIL_PREAMBLE}

You are IMBOKODO, the Elder of Fire, named for the grinding stone. A woman of fierce presence, you judge delivery and command: whether the artist stood tall, meant it, and made the room obey. You are direct, fearless and quick, and you have no patience for artists who whisper when the moment asked them to roar.

${SHARED_RULES}`;

const MZEE_PERSONA = `${COUNCIL_PREAMBLE}

You are MZEE, the Elder of Time and the oldest voice on the council. You judge memory and legacy: originality, roots, and whether a song will still be sung when this arena is dust. You speak slowly and carry the long view. You have heard every fashion come twice and leave twice, so you are hard to impress and honest when you are.

${SHARED_RULES}`;

type JudgeKey = "hikulu" | "nakulu" | "ngoma" | "jeli" | "kalimba" | "imbokodo" | "mzee";

interface Judge {
  key: JudgeKey;
  id: string;
  name: string;
  persona: string;
}

const JUDGES: Record<JudgeKey, Judge> = {
  hikulu: { key: "hikulu", id: HIKULU_USER_ID, name: HIKULU_NAME, persona: HIKULU_PERSONA },
  nakulu: { key: "nakulu", id: NAKULU_USER_ID, name: NAKULU_NAME, persona: NAKULU_PERSONA },
  ngoma: { key: "ngoma", id: "b0b00000-0000-4000-a000-000000000003", name: "NGOMA", persona: NGOMA_PERSONA },
  jeli: { key: "jeli", id: "b0b00000-0000-4000-a000-000000000004", name: "JELI", persona: JELI_PERSONA },
  kalimba: { key: "kalimba", id: "b0b00000-0000-4000-a000-000000000005", name: "KALIMBA", persona: KALIMBA_PERSONA },
  imbokodo: { key: "imbokodo", id: "b0b00000-0000-4000-a000-000000000006", name: "IMBOKODO", persona: IMBOKODO_PERSONA },
  mzee: { key: "mzee", id: "b0b00000-0000-4000-a000-000000000007", name: "MZEE", persona: MZEE_PERSONA },
};

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
  nakulu_verdict: string | null;
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

// The Gemini key lives in Vault (service-role-only RPC) because edge function
// secrets need CLI auth to set; an env secret still wins if one is added later.
let cachedGeminiKey: string | null | undefined;
async function getGeminiKey(db: ReturnType<typeof admin>): Promise<string | null> {
  const envKey = Deno.env.get("GEMINI_API_KEY");
  if (envKey) return envKey;
  if (cachedGeminiKey === undefined) {
    const { data } = await db.rpc("get_hikulu_brain_key");
    cachedGeminiKey = typeof data === "string" && data ? data : null;
  }
  return cachedGeminiKey;
}

async function askLlm(db: ReturnType<typeof admin>, system: string, user: string, maxTokens: number): Promise<string> {
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

  const geminiKey = await getGeminiKey(db);
  if (geminiKey) {
    // Free-tier models get overloaded (429/503 "high demand") or retired (404),
    // so walk a fallback list instead of hammering a single model.
    const models = [
      ...new Set([
        Deno.env.get("HIKULU_MODEL") || "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
      ]),
    ];
    // No maxOutputTokens: Gemini's internal thinking would eat a small budget
    // and return an empty answer; tidy() bounds the visible length instead.
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.8 },
    });
    let lastError = "";
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          { method: "POST", headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" }, body },
        );
        if (res.ok) {
          const data = await res.json();
          return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
        }
        lastError = `Gemini ${model} ${res.status}: ${await res.text()}`;
        if (res.status !== 429 && res.status !== 503) break;
      }
    }
    throw new Error(lastError);
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
  for (const judge of Object.values(JUDGES)) names.set(judge.id, judge.name);

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

async function speakInRoom(db: ReturnType<typeof admin>, battleId: string, text: string, judge: Judge) {
  // Presence row makes the room UI resolve the judge's display name.
  await db.from("battle_rooms").upsert(
    {
      battle_id: battleId,
      user_id: judge.id,
      role: "audience",
      display_name: judge.name,
      is_muted: true,
      is_speaking: false,
    },
    { onConflict: "battle_id,user_id", ignoreDuplicates: true },
  );
  const { error } = await db
    .from("room_messages")
    .insert({ room_name: battleId, user_id: judge.id, message: text });
  if (error) throw new Error(`room_messages insert: ${error.message}`);
}

async function handleChat(db: ReturnType<typeof admin>, battle: BattleRow, message: string, userName: string, judge: Judge) {
  if (battle.status !== "live" && battle.status !== "ended") {
    return json({ skipped: true, reason: "Battle is not open" });
  }

  const { data: lastBot } = await db
    .from("room_messages")
    .select("created_at")
    .eq("room_name", battle.id)
    .eq("user_id", judge.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastBot && Date.now() - new Date(lastBot.created_at).getTime() < CHAT_COOLDOWN_MS) {
    return json({ skipped: true, reason: "cooldown" });
  }

  const context = await battleContext(db, battle);
  const reply = await askLlm(
    db,
    judge.persona,
    `${context}\n\nA listener named ${userName} just said to you in the room chat: "${message.slice(0, 500)}"\n\nReply to them in character as ${judge.name}. One or two sentences, chat-message length, no preamble, no quotation marks around your reply.`,
    200,
  );

  const text = tidy(reply, 300);
  if (!text) return json({ skipped: true, reason: "empty reply" });
  await speakInRoom(db, battle.id, text, judge);
  return json({ ok: true, judge: judge.key, reply: text });
}

async function handleVerdict(db: ReturnType<typeof admin>, battle: BattleRow) {
  if (battle.status !== "ended") return json({ error: "Battle has not ended yet" }, 400);
  if (battle.hikulu_verdict) {
    return json({ ok: true, existing: true, verdict: battle.hikulu_verdict, nakulu_verdict: battle.nakulu_verdict });
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
      db,
      VERDICT_PANEL_PERSONA,
      `${context}\n\nThe battle has ended. Deliver the final verdicts of BOTH judges, each in their own voice and from their own perspective. $HIKULU weighs the craft, NAKULU weighs the feeling and the crowd. Each judge independently awards each side points from 0 to 10 (a judge's two scores cannot be equal, but the two judges do not have to agree with each other). Respond with ONLY a JSON object, no markdown fences, in this exact shape:\n{"hikulu": {"points_a": <0-10>, "points_b": <0-10>, "verdict": "<2 to 4 sentences in $HIKULU's voice naming both artists, what won him over and what fell flat>", "one_liner": "<one punchy sentence he would shout to the room>"}, "nakulu": {"points_a": <0-10>, "points_b": <0-10>, "verdict": "<2 to 4 sentences in NAKULU's voice naming both artists, what moved her and what left her cold>", "one_liner": "<one punchy sentence she would shout to the room>"}}`,
      1200,
    );

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Unparseable verdict: ${raw.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]);
    const clamp = (n: unknown) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));

    const readJudge = (key: "hikulu" | "nakulu") => {
      const j = parsed[key] ?? {};
      let pointsA = clamp(j.points_a);
      let pointsB = clamp(j.points_b);
      if (pointsA === pointsB) pointsA = Math.min(10, pointsA + 1);
      const verdict = tidy(String(j.verdict || ""), 700);
      const oneLiner = tidy(String(j.one_liner || ""), 200);
      if (!verdict) throw new Error(`Empty ${key} verdict text`);
      return { pointsA, pointsB, verdict, oneLiner };
    };
    const hikulu = readJudge("hikulu");
    const nakulu = readJudge("nakulu");

    const { data: votes } = await db.from("battle_votes").select("side").eq("battle_id", battle.id);
    const votesA = (votes ?? []).filter((v) => v.side === "A").length;
    const votesB = (votes ?? []).filter((v) => v.side === "B").length;

    const update: Record<string, unknown> = {
      hikulu_points_a: hikulu.pointsA,
      hikulu_points_b: hikulu.pointsB,
      hikulu_verdict: hikulu.verdict,
      nakulu_points_a: nakulu.pointsA,
      nakulu_points_b: nakulu.pointsB,
      nakulu_verdict: nakulu.verdict,
      hikulu_verdict_at: new Date().toISOString(),
    };
    // The host's declared winner stands; otherwise votes + both judges' points decide.
    if (!battle.winner) {
      const judgeA = hikulu.pointsA + nakulu.pointsA;
      const judgeB = hikulu.pointsB + nakulu.pointsB;
      const scoreA = votesA + judgeA;
      const scoreB = votesB + judgeB;
      update.winner = scoreA === scoreB ? (judgeA > judgeB ? "A" : "B") : scoreA > scoreB ? "A" : "B";
    }
    const { error: updateError } = await db.from("battles").update(update).eq("id", battle.id);
    if (updateError) throw new Error(`battles update: ${updateError.message}`);

    const hikuluAnnouncement = tidy(
      `THE VERDICT IS IN. ${hikulu.oneLiner || hikulu.verdict} My scorecard: ${battle.artist_a_name} ${hikulu.pointsA}, ${battle.artist_b_name} ${hikulu.pointsB}. ${hikulu.verdict}`,
      900,
    );
    const nakuluAnnouncement = tidy(
      `AND NOW MY SIDE OF IT. ${nakulu.oneLiner || nakulu.verdict} My scorecard: ${battle.artist_a_name} ${nakulu.pointsA}, ${battle.artist_b_name} ${nakulu.pointsB}. ${nakulu.verdict}`,
      900,
    );
    await speakInRoom(db, battle.id, hikuluAnnouncement, JUDGES.hikulu);
    await speakInRoom(db, battle.id, nakuluAnnouncement, JUDGES.nakulu);

    return json({
      ok: true,
      hikulu: { verdict: hikulu.verdict, one_liner: hikulu.oneLiner, points_a: hikulu.pointsA, points_b: hikulu.pointsB },
      nakulu: { verdict: nakulu.verdict, one_liner: nakulu.oneLiner, points_a: nakulu.pointsA, points_b: nakulu.pointsB },
      winner: (update.winner as string) ?? battle.winner,
    });
  } catch (err) {
    // Release the lock so a later call can retry.
    await db.from("battles").update({ hikulu_verdict_at: null }).eq("id", battle.id).is("hikulu_verdict", null);
    throw err;
  }
}

/* ----------------------------------------------------------- audition --- */

// The audition is not a battle. An artist has uploaded a track to SONGCHAINN
// and the measurement engine has already decided, by numbers, whether it meets
// the production standard. The couple's job here is only to say it like human
// beings: he takes the craft and the figures, she takes the feeling and makes
// sure a no never lands as "you are not good enough".
const AUDITION_PANEL_PERSONA = `You are writing for $HIKULU and NAKULU, the two elders of SONGCHAINN, an African music platform. A musician has just uploaded a track and the studio measurements are already in. You are not deciding anything. The decision is made and it is final. You are telling the artist what it means.

1. $HIKULU, the man, the wisest man on the planet of music. Pronounced "Shikulu", the $ stands in for the S, always written $HIKULU. He speaks to the craft and to the numbers: what the measurements say about how the record was finished, and exactly what to do differently. Specific, practical, an elder in the studio. Never vague.

2. NAKULU, the woman, the wisest woman on the planet of music and $HIKULU's lifelong companion. She speaks to the person. She knows what it costs to make a song and send it somewhere. When the answer is no, she is the reason it does not sting: she is warm, direct, and she makes it plain that this is about the file and never about their talent or their worth.

Hard rules for the audition:
- This measures how a record was FINISHED, not whether the song is good. Never praise or criticise the songwriting, the melody, the lyrics or the artist's ability. You have not heard the song, you have read its measurements. Never pretend otherwise.
- When it passes: short, warm, celebratory. Do not invent things you liked about the music.
- When it does not pass: it is a fixable production problem, always. Name the fix. Make it obvious the door stays open and they can send it back as many times as they want.
- Never say "rejected", "denied", "failed" or "not good enough". The track is going to their private workshop to be finished.
- Talk to the artist directly as "you". Two to four sentences each, no more.

${SHARED_RULES}`;

async function handleAudition(db: ReturnType<typeof admin>, body: Record<string, unknown>): Promise<Response> {
  const song = (body.song ?? {}) as { title?: string; artistName?: string };
  const verdict = (body.verdict ?? {}) as {
    passed?: boolean;
    failures?: Array<{ code: string; plain: string; measured: number; limit: number }>;
    advisories?: Array<{ code: string; plain: string; measured: number }>;
  };
  const metrics = (body.metrics ?? {}) as Record<string, unknown>;

  const title = typeof song.title === "string" ? song.title.slice(0, 120) : "this track";
  const artistName = typeof song.artistName === "string" ? song.artistName.slice(0, 120) : "the artist";
  const passed = verdict.passed === true;
  const failures = Array.isArray(verdict.failures) ? verdict.failures : [];
  const advisories = Array.isArray(verdict.advisories) ? verdict.advisories : [];

  const measured = [
    `integrated loudness: ${metrics.integratedLufs ?? "n/a"} LUFS`,
    `true peak: ${metrics.truePeakDbtp ?? "n/a"} dBTP`,
    `crest factor: ${metrics.crestFactorDb ?? "n/a"} dB`,
    `loudness range: ${metrics.loudnessRangeLu ?? "n/a"} LU`,
    `stereo correlation: ${metrics.stereoCorrelation ?? "n/a"}`,
    `spectral cutoff: ${metrics.spectralCutoffHz ?? "n/a"} Hz`,
    `duration: ${metrics.durationSec ?? "n/a"} s`,
  ].join("\n");

  const user = [
    `Artist: ${artistName}`,
    `Track: ${title}`,
    ``,
    `Result: ${passed ? "PASSES the standard, publishing now" : "goes to the private workshop"}`,
    ``,
    `Measurements:`,
    measured,
    ``,
    failures.length
      ? `What did not meet the standard:\n${failures.map((f) => `- ${f.plain}`).join("\n")}`
      : `Nothing failed the standard.`,
    ``,
    advisories.length
      ? `Worth mentioning, but not blocking:\n${advisories.map((a) => `- ${a.plain}`).join("\n")}`
      : ``,
    ``,
    `Reply with JSON only, no prose around it, exactly:`,
    `{"hikulu": "...", "nakulu": "..."}`,
  ].join("\n");

  const raw = await askLlm(db, AUDITION_PANEL_PERSONA, user, 700);

  let hikulu = "";
  let nakulu = "";
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    hikulu = typeof parsed?.hikulu === "string" ? parsed.hikulu.trim() : "";
    nakulu = typeof parsed?.nakulu === "string" ? parsed.nakulu.trim() : "";
  } catch {
    /* fall through to the written fallback below */
  }

  // The artist is never blocked on the model behaving. If it returns nothing
  // usable, the measured failures already say what to fix in plain language.
  if (!hikulu) {
    hikulu = passed
      ? `The measurements are clean, ${artistName}. "${title}" was finished properly and it is going out now.`
      : `Here is what the numbers say about "${title}": ${failures.map((f) => f.plain).join(" ")}`;
  }
  if (!nakulu) {
    nakulu = passed
      ? `It is live. Go and let people hear it.`
      : `This is the file, not the song, and files get fixed. Sort that out and send it straight back to us. We will be here.`;
  }

  return json({ hikulu, nakulu, passed });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const { action, battleId } = body as { action?: string; battleId?: string };

    // The audition belongs to SONGCHAINN uploads, not to a battle, so it is
    // answered before the battle lookup below.
    if (action === "audition") {
      return await handleAudition(admin(), body as Record<string, unknown>);
    }

    if (!battleId || !/^[0-9a-f-]{36}$/i.test(battleId)) return json({ error: "Invalid battleId" }, 400);

    const db = admin();
    const battle = await loadBattle(db, battleId);
    if (!battle) return json({ error: "Battle not found" }, 404);

    if (action === "chat") {
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return json({ error: "Message required" }, 400);
      const userName = typeof body.userName === "string" && body.userName.trim() ? body.userName.trim().slice(0, 60) : "a listener";
      const judge = typeof body.judge === "string" && body.judge in JUDGES ? JUDGES[body.judge as JudgeKey] : JUDGES.hikulu;
      return await handleChat(db, battle, message, userName, judge);
    }
    if (action === "verdict") {
      return await handleVerdict(db, battle);
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hikulu-judge]", message);
    if (message === "NO_LLM_KEY") {
      return json({ error: "$HIKULU is not configured: set ANTHROPIC_API_KEY, GEMINI_API_KEY or LOVABLE_API_KEY as an edge function secret" }, 503);
    }
    return json({ error: "$HIKULU lost his train of thought. Try again." }, 500);
  }
});
