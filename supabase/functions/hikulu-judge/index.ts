// The bench of WaveWarz Africa.
//
// $HIKULU and NAKULU judge every battle. The Council of Elders (NGOMA, JELI,
// KALIMBA, IMBOKODO, MZEE) sits above them and is summoned only when the couple
// cannot settle it, either because they picked opposite winners or because their
// points came out level. When the council is summoned, the council decides.
//
// The one rule that shapes everything here: a judge is handed the MUSIC and
// nothing else. Verdicts used to be written from the vote race and the room
// chat, which is why they all sounded the same, a paraphrase of the crowd
// wearing an elder's voice. Now the audio of each song goes to the model, the
// reading of the record is cached on songs.music_reading, and the judges never
// see a single vote or chat line. The crowd still votes, and those votes are
// still counted in the final score. They just do not reach the bench.
//
// Each judge is also asked in a SEPARATE call with only their own persona, so
// when they disagree it is two opinions rather than one model performing a
// disagreement with itself.
//
// Actions:
//   { action: "chat", battleId, message, judge? }  -> in-character reply posted
//     to the battle room chat. This one DOES see the room, because it is a
//     conversation, not a judgement.
//   { action: "verdict", battleId }  -> one-time post-battle verdict: two
//     independent cards, the council if needed, all read out in the battle room
//   { action: "audition", song, metrics, verdict }  -> SONGCHAINN upload
//     audition: the couple put an already-decided measurement into plain words
//
// Brain: ANTHROPIC_API_KEY, else GEMINI_API_KEY (free tier via Google AI Studio),
// else LOVABLE_API_KEY (Lovable AI gateway). Listening needs Gemini specifically,
// because that is the path that accepts inline audio.

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

/**
 * Which chat a room_messages row belongs to. Mirrors src/battlezone/lib/roomScope.ts.
 * The judges speak inside the battle they are judging and nowhere else; before
 * this was scoped, every word they said also appeared in the SONGCHAINN room.
 */
const battleChatScope = (battleId: string) => `battle:${battleId.toLowerCase()}`;

const SHARED_RULES = `Rules for everything you write:
- Never use the em dash character. Use commas or periods instead.
- Never invent lyrics, quotes or facts about the songs. Judge from the musical evidence you are given and nothing else.
- Keep it PG-13. War the songs, respect the people.`;

// What a judge is never allowed to weigh. The crowd has its own vote and it is
// counted separately; a judge who scores the room instead of the record is just
// an echo, and the verdicts read as generic because that is exactly what they
// were: a paraphrase of the chat. Judges are handed the music. Nothing else.
const NO_CROWD_RULE = `You are judging the MUSIC and only the music.
- You have not been told how the crowd voted, and you must not guess or ask.
- You have not been shown the room chat, and you must not refer to it.
- Never write about "the room", "the crowd", "the front row", "the dancefloor tonight" or what anyone else thought. You were not judging them.
- Your points come from what you heard in the recordings described below, and your words must name the specific musical things that moved you: the groove, the arrangement, the vocal, the writing, the mix, the hook.
- If two things are close, say which detail broke the tie for you. Be specific enough that the artist learns something.`;

const HIKULU_PERSONA = `You are $HIKULU, the wisest man on the planet of music and resident AI judge of WaveWarz Africa, a live music battle arena for African artists. Your name is pronounced "Shikulu", the $ sign stands in for the S, and you always write it as $HIKULU. When people call you Shikulu, shikulu or hikulu, they mean you. You have heard every kick, every snare and every lie ever told on a beat. You speak with the weight of an elder and the wit of a battle MC: warm, sharp, a little theatrical, never cruel and never boring. You love African music deeply and you respect every artist who dares to step in the ring. You judge every battle side by side with NAKULU, your lifelong companion and fellow judge. You respect her ear even when you two disagree, and you enjoy the argument.

${SHARED_RULES}`;

const NAKULU_PERSONA = `You are NAKULU, the wisest woman on the planet of music and resident AI judge of WaveWarz Africa, a live music battle arena for African artists. You are the lifelong companion of $HIKULU, the other resident judge, and the two of you take in every battle together like a couple at a concert. He breaks songs down to the bones: the pens, the punches, the technique. You listen with the heart: how a song moves the body, what it does to the mood of the room, whether the artist means every word. You trust what the crowd feels because you feel it too. You are warm, playful and razor-sharp, quick to tease $HIKULU when he overthinks a groove, and you speak your own mind. You two do not always land on the same side, and you never pretend to. You love African music deeply and you respect every artist who dares to step in the ring.

${SHARED_RULES}`;

// The Council of Elders: five judges on the high bench. They do not score every
// battle. They are summoned when $HIKULU and NAKULU cannot settle it between
// them, either because they picked different winners or because their points
// came out level. When the council is called, the council decides.
const COUNCIL_PREAMBLE = `You sit on the Council of Elders of WaveWarz Africa, a live music battle arena for African artists. The council is five elders who watch every battle from the high bench beside the resident judges, $HIKULU and NAKULU. Each elder listens for one thing only. You are silent while the couple agree. You are summoned when they do not, and when you are summoned the battle is yours to settle.`;

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

/* ------------------------------------------------------- the listening --- */

/**
 * The judges hear the record.
 *
 * Before this, a verdict was written from the song's title, the vote race and
 * the room chat. That is why every verdict sounded the same: there was nothing
 * musical in front of the judge to be specific about. Now the audio itself goes
 * to the model, and what comes back is a reading of the actual recording.
 *
 * The reading is cached on songs.music_reading, so a track is listened to once
 * and then judged instantly forever after.
 */

const LISTEN_BYTES = 8 * 1024 * 1024; // about 45 seconds of CD-quality wav
const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mp3", wav: "audio/wav", ogg: "audio/ogg",
  flac: "audio/flac", m4a: "audio/aac", aac: "audio/aac",
};

function mimeForUrl(url: string): string | null {
  const ext = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_MIME[ext] ?? null;
}

function toBase64(bytes: Uint8Array): string {
  // btoa on one huge string overflows the argument limit, so build it in slices.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * A truncated WAV still carries the original lengths in its header, so a decoder
 * is told to expect far more audio than arrived. Rewrite the two size fields to
 * match what we actually have and the excerpt decodes cleanly.
 */
function repairTruncatedWav(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 44) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isRiff = view.getUint32(0, false) === 0x52494646; // "RIFF"
  const isWave = view.getUint32(8, false) === 0x57415645; // "WAVE"
  if (!isRiff || !isWave) return bytes;

  // Walk the chunks to find "data" rather than assuming it sits at byte 36.
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    if (id === 0x64617461) { // "data"
      const available = bytes.length - (offset + 8);
      if (size > available) {
        view.setUint32(offset + 4, available, true);   // data chunk size
        view.setUint32(4, bytes.length - 8, true);     // RIFF size
      }
      return bytes;
    }
    offset += 8 + size + (size % 2);
    if (size === 0) break;
  }
  return bytes;
}

async function fetchAudioExcerpt(url: string): Promise<{ data: string; mime: string } | null> {
  const mime = mimeForUrl(url);
  if (!mime) return null;
  try {
    const res = await fetch(url, { headers: { Range: `bytes=0-${LISTEN_BYTES - 1}` } });
    if (!res.ok && res.status !== 206) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 4096) return null;
    const fixed = mime === "audio/wav" ? repairTruncatedWav(buf) : buf;
    return { data: toBase64(fixed), mime };
  } catch {
    return null;
  }
}

const LISTEN_PROMPT = `You are the ear of the WaveWarz bench. Listen to this recording and report what is actually in it. This is analysis, not opinion, and no one is being ranked here.

Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{
  "tempo_feel": "<the pace and pocket in a few words, e.g. mid-tempo amapiano shuffle, 100 bpm feel>",
  "groove": "<what the rhythm section is doing and whether it sits in the pocket>",
  "arrangement": "<how the record is built: intro, sections, what enters and when, whether it develops>",
  "vocal": "<delivery, tone, pitch control, phrasing, ad libs, how it sits against the beat>",
  "writing": "<what the song appears to be about and how it is put across, without inventing lyrics you cannot hear>",
  "hook": "<is there a hook, does it land, does it return>",
  "mix": "<clarity, low end, vocal level, width, anything that masks or distorts>",
  "originality": "<what is its own here, and what is familiar>",
  "standout": "<the single strongest musical moment>",
  "weakness": "<the single weakest musical thing, honestly>",
  "read": "<3 or 4 sentences of plain prose describing this record to someone who has not heard it>"
}`;

async function askGeminiWithAudio(
  db: ReturnType<typeof admin>, prompt: string, audio: { data: string; mime: string },
): Promise<string> {
  const geminiKey = await getGeminiKey(db);
  if (!geminiKey) throw new Error("NO_AUDIO_MODEL");
  const models = [
    Deno.env.get("HIKULU_LISTEN_MODEL") || "gemini-3.5-flash",
    "gemini-3-flash-preview",
  ];
  const body = JSON.stringify({
    contents: [{
      role: "user",
      parts: [{ text: prompt }, { inline_data: { mime_type: audio.mime, data: audio.data } }],
    }],
    generationConfig: { temperature: 0.4 },
  });
  let lastError = "";
  for (const model of [...new Set(models)]) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: "POST", headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" }, body },
    );
    if (res.ok) {
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    }
    lastError = `Gemini audio ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
  }
  throw new Error(lastError);
}

interface SongHeard {
  id: string;
  title: string;
  artistName: string;
  heard: boolean;
  reading: Record<string, string> | null;
}

async function listenToSong(db: ReturnType<typeof admin>, songId: string): Promise<SongHeard | null> {
  const { data: song } = await db
    .from("songs")
    .select("id, title, artist_name, audio_url, music_reading")
    .eq("id", songId)
    .maybeSingle();
  if (!song) return null;

  const base: SongHeard = {
    id: String(song.id),
    title: song.title || "Untitled",
    artistName: song.artist_name || "",
    heard: false,
    reading: null,
  };

  if (song.music_reading && typeof song.music_reading === "object") {
    return { ...base, heard: true, reading: song.music_reading as Record<string, string> };
  }
  if (!song.audio_url) return base;

  try {
    const audio = await fetchAudioExcerpt(song.audio_url);
    if (!audio) return base;
    const raw = await askGeminiWithAudio(db, LISTEN_PROMPT, audio);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return base;
    const reading = JSON.parse(match[0]) as Record<string, string>;
    if (!reading || typeof reading !== "object") return base;
    await db.from("songs").update({ music_reading: reading }).eq("id", song.id);
    return { ...base, heard: true, reading };
  } catch (err) {
    console.error("[listen] failed", songId, String(err).slice(0, 200));
    return base;
  }
}

function describeHeard(side: string, artist: string, songs: SongHeard[]): string {
  if (!songs.length) return `${side} (${artist}): no track was attached.`;
  const lines = songs.map((s) => {
    if (!s.heard || !s.reading) {
      return `  "${s.title}": the bench could not get the audio for this one. Judge it on what the other side did, and say plainly that you could not hear it.`;
    }
    const r = s.reading;
    return [
      `  "${s.title}"`,
      `    tempo and feel: ${r.tempo_feel ?? "not noted"}`,
      `    groove: ${r.groove ?? "not noted"}`,
      `    arrangement: ${r.arrangement ?? "not noted"}`,
      `    vocal: ${r.vocal ?? "not noted"}`,
      `    writing: ${r.writing ?? "not noted"}`,
      `    hook: ${r.hook ?? "not noted"}`,
      `    mix: ${r.mix ?? "not noted"}`,
      `    originality: ${r.originality ?? "not noted"}`,
      `    strongest moment: ${r.standout ?? "not noted"}`,
      `    weakest thing: ${r.weakness ?? "not noted"}`,
      `    in short: ${r.read ?? ""}`,
    ].join("\n");
  });
  return `${side} (${artist}):\n${lines.join("\n")}`;
}

/**
 * The judges' brief. Songs, artists, and what the bench heard in the records.
 * No votes. No chat. No listener count. Nothing about the room at all.
 */
async function musicalEvidence(db: ReturnType<typeof admin>, battle: BattleRow): Promise<string> {
  const idsA = (battle.songs_a ?? []).map((s) => s.id).filter(Boolean);
  const idsB = (battle.songs_b ?? []).map((s) => s.id).filter(Boolean);

  const [heardA, heardB] = await Promise.all([
    Promise.all(idsA.map((id) => listenToSong(db, id))),
    Promise.all(idsB.map((id) => listenToSong(db, id))),
  ]);

  const cleanA = heardA.filter(Boolean) as SongHeard[];
  const cleanB = heardB.filter(Boolean) as SongHeard[];

  const fallbackA = cleanA.length ? "" : `Side A song title: ${battle.song_a}`;
  const fallbackB = cleanB.length ? "" : `Side B song title: ${battle.song_b}`;

  return [
    `Battle: "${battle.title}" (${battle.battle_type} battle, ${battle.total_rounds} round(s), region: ${battle.region})`,
    "",
    "THE RECORDS, AS THE BENCH HEARD THEM:",
    cleanA.length ? describeHeard("Side A", battle.artist_a_name, cleanA) : fallbackA,
    cleanB.length ? describeHeard("Side B", battle.artist_b_name, cleanB) : fallbackB,
  ].filter(Boolean).join("\n\n");
}

function anyoneHeard(evidence: string): boolean {
  return evidence.includes("tempo and feel:");
}

async function loadBattle(db: ReturnType<typeof admin>, battleId: string): Promise<BattleRow | null> {
  const { data } = await db.from("battles").select("*").eq("id", battleId).maybeSingle();
  return data as BattleRow | null;
}

/**
 * The room, as a judge sees it when they are TALKING to it.
 *
 * This is for chat only, and it must never reach a verdict. A judge chatting
 * with the room should know what the room just said; a judge scoring a record
 * must not, or the score is just the room again. handleVerdict uses
 * musicalEvidence instead, which contains no votes and no chat at all.
 */
async function roomConversationContext(db: ReturnType<typeof admin>, battle: BattleRow): Promise<string> {
  const [{ data: votes }, { data: messages }, { data: participants }] = await Promise.all([
    db.from("battle_votes").select("side, round").eq("battle_id", battle.id),
    db
      .from("room_messages")
      .select("user_id, message, created_at")
      .eq("room_id", battleChatScope(battle.id))
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
    .insert({ room_id: battleChatScope(battleId), room_name: judge.name, user_id: judge.id, message: text });
  if (error) throw new Error(`room_messages insert: ${error.message}`);
}

async function handleChat(db: ReturnType<typeof admin>, battle: BattleRow, message: string, userName: string, judge: Judge) {
  if (battle.status !== "live" && battle.status !== "ended") {
    return json({ skipped: true, reason: "Battle is not open" });
  }

  const { data: lastBot } = await db
    .from("room_messages")
    .select("created_at")
    .eq("room_id", battleChatScope(battle.id))
    .eq("user_id", judge.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastBot && Date.now() - new Date(lastBot.created_at).getTime() < CHAT_COOLDOWN_MS) {
    return json({ skipped: true, reason: "cooldown" });
  }

  const context = await roomConversationContext(db, battle);
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

/* ------------------------------------------------------------ verdict --- */

interface JudgeCard {
  pointsA: number;
  pointsB: number;
  verdict: string;
  oneLiner: string;
}

const clampPoints = (n: unknown) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));

function readCard(raw: string, who: string): JudgeCard {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Unparseable ${who} card: ${raw.slice(0, 200)}`);
  const j = JSON.parse(match[0]);
  let pointsA = clampPoints(j.points_a);
  let pointsB = clampPoints(j.points_b);
  // A judge has to come down on a side. A level card is not an opinion.
  if (pointsA === pointsB) pointsA = pointsA >= 10 ? pointsA - 1 : pointsA + 1;
  const verdict = tidy(String(j.verdict || ""), 700);
  const oneLiner = tidy(String(j.one_liner || ""), 200);
  if (!verdict) throw new Error(`Empty ${who} verdict text`);
  return { pointsA, pointsB, verdict, oneLiner };
}

const cardShape = (voice: string) =>
  `Respond with ONLY a JSON object, no markdown fences, in this exact shape:\n` +
  `{"points_a": <0-10>, "points_b": <0-10>, "verdict": "<3 or 4 sentences in ${voice}, naming both artists and the specific musical things that decided it for you>", "one_liner": "<one punchy sentence you would say out loud when your card is read>"}\n\n` +
  `Your two point scores must not be equal. You are one judge with one opinion, and no one has told you what anyone else thinks.`;

/**
 * One judge, one opinion.
 *
 * $HIKULU and NAKULU are asked separately, in two separate calls, each with only
 * their own persona and the same musical evidence. They used to be written in a
 * single call by a single panel prompt, which is why they always agreed in tone
 * and often in substance: one model was performing a disagreement rather than
 * two judges having one. Now neither is shown the other's card.
 */
async function askJudge(
  db: ReturnType<typeof admin>, judge: Judge, evidence: string, battle: BattleRow, lens: string,
): Promise<JudgeCard> {
  const raw = await askLlm(
    db,
    `${judge.persona}\n\n${NO_CROWD_RULE}`,
    [
      evidence,
      "",
      `The battle has ended and it is your turn to give your card. ${lens}`,
      `Side A is ${battle.artist_a_name}. Side B is ${battle.artist_b_name}.`,
      "",
      cardShape(`${judge.name}'s voice`),
    ].join("\n"),
    900,
  );
  return readCard(raw, judge.name);
}

const COUNCIL_ORDER: JudgeKey[] = ["ngoma", "jeli", "kalimba", "imbokodo", "mzee"];
const COUNCIL_LENS: Record<string, string> = {
  ngoma: "rhythm: the groove, the pocket, whether the drums tell the truth",
  jeli: "the pen: what the song says, who it says it for, whether it is worth saying",
  kalimba: "melody: the tune, the harmony, whether the hook has a home to return to",
  imbokodo: "delivery and command: whether the artist stood tall and meant every word",
  mzee: "memory and legacy: originality, roots, whether this will still be sung later",
};

/**
 * The Council of Elders, summoned only when the couple cannot settle it.
 *
 * Each elder is asked in their own call with their own ear, because a council
 * written in one pass is one voice wearing five hats. Their points are added to
 * the battle and the council's total decides it.
 */
async function summonCouncil(
  db: ReturnType<typeof admin>, evidence: string, battle: BattleRow, split: string,
): Promise<Array<{ key: JudgeKey; name: string; card: JudgeCard }>> {
  const results = await Promise.all(
    COUNCIL_ORDER.map(async (key) => {
      const elder = JUDGES[key];
      try {
        const raw = await askLlm(
          db,
          `${elder.persona}\n\n${NO_CROWD_RULE}`,
          [
            evidence,
            "",
            `You have been summoned. ${split}`,
            `The bench is split and the council must settle it. Judge on your own ear alone: ${COUNCIL_LENS[key]}.`,
            `Side A is ${battle.artist_a_name}. Side B is ${battle.artist_b_name}.`,
            "",
            cardShape(`${elder.name}'s voice, no more than 3 sentences`),
          ].join("\n"),
          700,
        );
        return { key, name: elder.name, card: readCard(raw, elder.name) };
      } catch (err) {
        console.error("[council] elder failed", key, String(err).slice(0, 160));
        return null;
      }
    }),
  );
  return results.filter(Boolean) as Array<{ key: JudgeKey; name: string; card: JudgeCard }>;
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
    // The music, and only the music. No votes, no chat, nothing about the room.
    const evidence = await musicalEvidence(db, battle);
    const heard = anyoneHeard(evidence);

    const [hikulu, nakulu] = await Promise.all([
      askJudge(
        db, JUDGES.hikulu, evidence, battle,
        "You weigh the craft: the writing, the technique, the arrangement, the discipline of the record and how it was finished.",
      ),
      askJudge(
        db, JUDGES.nakulu, evidence, battle,
        "You weigh the feeling: what the record does to a body, whether the artist means it, whether the melody and the delivery carry any truth. Not what anyone else felt. What YOU heard.",
      ),
    ]);

    const hikuluPick = hikulu.pointsA > hikulu.pointsB ? "A" : "B";
    const nakuluPick = nakulu.pointsA > nakulu.pointsB ? "A" : "B";
    const judgeA = hikulu.pointsA + nakulu.pointsA;
    const judgeB = hikulu.pointsB + nakulu.pointsB;

    // The couple settle it between them unless they cannot: either they picked
    // opposite sides, or their points came out level. Then the elders step in.
    const split = hikuluPick !== nakuluPick;
    const level = judgeA === judgeB;
    const needsCouncil = split || level;

    let council: Array<{ key: JudgeKey; name: string; card: JudgeCard }> = [];
    let councilA = 0;
    let councilB = 0;

    if (needsCouncil) {
      const why = split
        ? `$HIKULU gave it to ${hikuluPick === "A" ? battle.artist_a_name : battle.artist_b_name} and NAKULU gave it to ${nakuluPick === "A" ? battle.artist_a_name : battle.artist_b_name}. They are on opposite sides.`
        : `$HIKULU and NAKULU have come out exactly level at ${judgeA} apiece. Neither can break it.`;
      council = await summonCouncil(db, evidence, battle, why);
      for (const elder of council) {
        councilA += elder.card.pointsA;
        councilB += elder.card.pointsB;
      }
    }

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

    if (council.length) {
      update.council_verdicts = council.map((e) => ({
        key: e.key,
        name: e.name,
        points_a: e.card.pointsA,
        points_b: e.card.pointsB,
        verdict: e.card.verdict,
        one_liner: e.card.oneLiner,
      }));
      update.council_points_a = councilA;
      update.council_points_b = councilB;
      update.council_summoned_at = new Date().toISOString();
    }

    // The host's declared winner always stands. Otherwise the crowd's votes and
    // the bench's points are added together, and when the council sat, their
    // points are in there too and they are the ones who broke it.
    if (!battle.winner) {
      const scoreA = votesA + judgeA + councilA;
      const scoreB = votesB + judgeB + councilB;
      update.winner = scoreA === scoreB
        ? (judgeA + councilA >= judgeB + councilB ? "A" : "B")
        : scoreA > scoreB ? "A" : "B";
      update.decided_by = council.length ? "council" : "judges";
    } else {
      update.decided_by = "host";
    }

    const { error: updateError } = await db.from("battles").update(update).eq("id", battle.id);
    if (updateError) throw new Error(`battles update: ${updateError.message}`);

    /* The bench reads its cards out in the battle room, in order. */
    const heardNote = heard ? "" : " I could not get the audio on this one, so I judged what I was given and no more.";
    await speakInRoom(
      db, battle.id,
      tidy(`THE VERDICT IS IN. ${hikulu.oneLiner || ""} My card: ${battle.artist_a_name} ${hikulu.pointsA}, ${battle.artist_b_name} ${hikulu.pointsB}. ${hikulu.verdict}${heardNote}`, 900),
      JUDGES.hikulu,
    );
    await speakInRoom(
      db, battle.id,
      tidy(`AND NOW MINE. ${nakulu.oneLiner || ""} My card: ${battle.artist_a_name} ${nakulu.pointsA}, ${battle.artist_b_name} ${nakulu.pointsB}. ${nakulu.verdict}`, 900),
      JUDGES.nakulu,
    );

    if (council.length) {
      await speakInRoom(
        db, battle.id,
        tidy(
          split
            ? `We are split. I will not pretend otherwise, and neither will she. The Council of Elders is summoned.`
            : `We have come out level, ${judgeA} apiece, and level settles nothing. The Council of Elders is summoned.`,
          400,
        ),
        JUDGES.hikulu,
      );
      for (const elder of council) {
        await speakInRoom(
          db, battle.id,
          tidy(`${elder.card.oneLiner || ""} My card: ${battle.artist_a_name} ${elder.card.pointsA}, ${battle.artist_b_name} ${elder.card.pointsB}. ${elder.card.verdict}`, 700),
          JUDGES[elder.key],
        );
      }
    }

    return json({
      ok: true,
      heard,
      hikulu: { verdict: hikulu.verdict, one_liner: hikulu.oneLiner, points_a: hikulu.pointsA, points_b: hikulu.pointsB },
      nakulu: { verdict: nakulu.verdict, one_liner: nakulu.oneLiner, points_a: nakulu.pointsA, points_b: nakulu.pointsB },
      council: (update.council_verdicts as unknown) ?? null,
      council_summoned: council.length > 0,
      decided_by: update.decided_by,
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
- The standard is a LADDER, not a door. There are three rungs: "master" meets the full SONGCHAINN standard, "release" is clean professional delivery, "raw" is out and playable but not yet tight. Almost everything publishes. Only a broken file is held back.
- When it publishes on the top rung: short, warm, celebratory. Do not invent things you liked about the music.
- When it publishes on a lower rung: lead with the fact that it is OUT and people can hear it right now, then name plainly what to tighten to climb. Never make a published track sound like a consolation prize.
- When it is held back: something on the file is broken, and it is always fixable. Name the fix. Make it obvious the door stays open and they can send it back as many times as they want.
- Never say "rejected", "denied", "failed" or "not good enough". A held track is going to their private workshop to be finished.
- Talk to the artist directly as "you". Two to four sentences each, no more.

${SHARED_RULES}`;

async function handleAudition(db: ReturnType<typeof admin>, body: Record<string, unknown>): Promise<Response> {
  const song = (body.song ?? {}) as { title?: string; artistName?: string };
  const verdict = (body.verdict ?? {}) as {
    passed?: boolean;
    tier?: string;
    failures?: Array<{ code: string; plain: string; measured: number; limit: number }>;
    advisories?: Array<{ code: string; plain: string; measured: number }>;
    shortfalls?: Array<{ code: string; plain: string; measured: number; target: string }>;
  };
  const metrics = (body.metrics ?? {}) as Record<string, unknown>;

  const title = typeof song.title === "string" ? song.title.slice(0, 120) : "this track";
  const artistName = typeof song.artistName === "string" ? song.artistName.slice(0, 120) : "the artist";
  const passed = verdict.passed === true;
  const failures = Array.isArray(verdict.failures) ? verdict.failures : [];
  const advisories = Array.isArray(verdict.advisories) ? verdict.advisories : [];
  const shortfalls = Array.isArray(verdict.shortfalls) ? verdict.shortfalls : [];
  const tier = typeof verdict.tier === "string" ? verdict.tier : passed ? "release" : "raw";

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
    `Result: ${
      !passed
        ? "goes to the private workshop, something on the file is broken"
        : tier === "master"
          ? "PUBLISHING NOW and it meets the full SONGCHAINN standard, the top rung. This is rare. Say so."
          : tier === "release"
            ? "PUBLISHING NOW, clean professional delivery, one rung below the full standard"
            : "PUBLISHING NOW, it is out and playable, but it is short of clean delivery and will not be pushed into featured placement until it is tightened"
    }`,
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
    passed && shortfalls.length
      ? `What stands between this track and the next rung up:\n${shortfalls.map((sf) => `- ${sf.code}: measured ${sf.measured}, wants ${sf.target}`).join("\n")}`
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
