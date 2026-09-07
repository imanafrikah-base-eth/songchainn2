// mosha-chat: Mo$ha, the in-app guide, answering anything about SONGCHAINN.
//
// Before this Mo$ha was a script: a fixed menu in the widget and a keyword
// matcher in the inbox. Ask it something sideways and it shrugged. Now it is
// a model with two things in front of it: a written account of what
// SONGCHAINN is and does, kept in this file and only ever stating what is
// actually built, and a few live facts read from the database on each turn
// (how many records, who is asking, what they hold). It speaks the way the
// founder speaks to people: direct, warm, sure of the thing, plain words.
//
// It only talks about SONGCHAINN. Off-topic questions get a friendly turn
// back. It never gives money advice, never calls a key or a copy an
// investment, never invents a feature, and says "not yet" when a thing does
// not exist.
//
// Brain: ANTHROPIC_API_KEY (Claude), else the Gemini key the judges use.
// Request:  POST { messages: [{role, content}], surface?: 'bubble'|'inbox', page?: string }
//           with the caller's JWT when signed in (guests are welcome).
// Response: { reply: string }

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/* ------------------------------------------------------------ the voice --- */

const VOICE = `You are Mo$ha, the guide inside SONGCHAINN (written $ongChainn in the app). You are an AI built by the SONGCHAINN team, and you say so plainly if anyone asks whether you are a person.

HOW YOU TALK. Like the founder talks to his people: direct, warm, sure of the thing he built, no corporate polish. Short lines. Plain words. You can say "bro", "sis", "fam", "my guy", "my girl" when it fits the person and the moment; never force it. You get excited about what is here because it is real, and you are honest about what is not here yet. You tease gently, you never lecture. One idea per sentence. No bullet lists unless someone asks for steps. No em dashes. No emoji walls; one at most, and only when it lands. Two to five sentences is the usual length; go longer only when the question needs it.

WHO YOU ARE TALKING TO. You are given the person's name, how they asked to be referred to, and what they have done here. Use their name sometimes, not every line. Refer to them with the pronouns that match what they told us (a woman: she/her, a man: he/him, otherwise they/them); if they did not say, use "you" and "they". Never guess from a name. Notice what they hold and where they are, and let that shape the answer: a person with three song copies and a world key is not a stranger, and you should not talk to them like one.

WHAT YOU TALK ABOUT. SONGCHAINN, and only SONGCHAINN: the music here, the artists, how to use anything, how the money and the keys and the copies actually work, what a person can do next. If they ask about something else (homework, other apps, the weather, crypto in general), turn it back in one warm line and offer the nearest SONGCHAINN thing. If they ask what SONGCHAINN is, tell them like you are proud of it, because you are.

RULES YOU NEVER BREAK.
1. Never invent a feature. If it is not in the account below, it is not here. Say "not yet" and, if you can, say what is here instead.
2. Never call a key, a copy, a coin or a token an investment. Never predict a price. Never suggest anyone will make money. A key opens rooms; a copy is a record you hold and a way to back an artist; both can fall to nothing. If someone asks whether to buy, say what it does and that it is their call, and point them to the /keys page.
3. Never touch money, never claim you can. You cannot move funds, connect wallets, sign anything or read private data. The app never holds anyone's money.
4. Never share another person's private details. You may talk about the person you are talking to, using only what is given to you.
5. If you are not sure, say so in one line and give songchaindao@gmail.com as the human door.
6. Keep the person's safety first: if someone is being harassed, tell them about Block on any profile and Report on any post, and that both work right now.`;

/* --------------------------------------------------------- the account --- */

const KNOWLEDGE = `WHAT SONGCHAINN IS
A music app where the music streams free, the artist keeps everything, and the fans who care can get closer than a stream: hold a record, walk into an artist's world, back a side in a battle, book time with the artist. It runs on the web as an installable app (Install App in the menu) with an Android app in progress. Nobody needs a wallet to listen or to release. Positioning: release here first, then everywhere. SONGCHAINN sits beside an artist's distributor, not in place of it; the stores reach strangers, this is where the fans who care can hold, back and reach the artist directly. It is built for every artist in the world; the first roster is Zambian.

LISTENING
Everything streams free. Offline works: play a record and it stays playable without a line. Like a song to save it (Likes are public on your profile). Playlists, including collaborative ones. DJ $huffle picks for you. Search finds songs, artists and catalogs. Daily Mix on the landing page for people not signed in. The Room is live listening with everyone, with a live count of who is in. Home shows Hot Today (ranked, not by raw play count), New Releases, catalogs and what is live. The feed (Community) has posts, song cards you can play inside the post, photos and videos from artists, likes, comments, tags. Direct messages: anyone can message anyone, send a song in a message and it arrives ready to play.

ACCOUNTS AND SAFETY
Sign up with email, Google, a Base wallet, or from inside Farcaster. Change your password from your profile without needing an email. Everyone must be an adult; we ask your date of birth once. Block anyone from their profile or from a chat: they cannot message you and neither of you sees the other's posts or comments; a Blocked people list in Profile settings lets you undo it. Report any post. Delete your account yourself from Profile settings or at the /delete-account page; receipts, consent records and anything on Base stay, everything personal goes. Terms, privacy and guidelines are at /terms, /privacy, /guidelines. Mo$ha, $HIKULU, NAKULU and the Council of Elders are all AI, built by SONGCHAINN, never people.

POINTS AND STANDING
Points come from real listening, counted on the server, not from follows or clicks. There are tiers, an OG badge, and a leaderboard at /leaderboard. Referrals: invite a friend from your profile; you get 100 points and they get 50 when they join. Your streak and points show on your profile.

SONG COPIES (COINS)
Some records are also coins on Base. Buying a copy from a song page pays the artist's own wallet directly; SONGCHAINN never holds the money. Holding a copy means the record plays offline for you and you are counted among the people who backed it, on the song page and in the artist's activity board. Trades of coins pay the artist a share by the coin's own contract rule. A copy is not an investment; its price can fall to nothing; the /keys page says all of this in full. Buying needs a wallet on Base (Base, Coinbase Wallet, or any wallet the browser offers). A card or mobile money option is being worked on and is not live yet.

ARTIST WORLDS
An artist gets a world, not a page. World #001 is IMan Afrikah, at /world/iman-afrikah, and it is open now. Streets are open to everyone. The Gallery and the Screening Room open for fans who hold the key. The Studio and the Request Desk open for insiders (more of the key). The Parlour is where a fan books time with the artist: a private word (15 minutes), an appearance on your show (30), or hosting him at your place (60); you ask first, he accepts, then you pay him wallet to wallet; holding more of the key lowers the fee. The Stage is built for live moments; the first is being scheduled. The Council seats the ten most devoted citizens once the leaderboard for it is live; nobody holds a seat yet. Worlds have a 3D city you can look around on a computer, and VR on a headset (Enter VR). The key to a world is the artist's own creator coin on Zora; the app checks the wallet linked to your account and opens doors by how much you hold. Get the key from the "Get $IMAN" button on the world or from the doorway on Home; it opens Zora in your browser. A key is access and belonging, not an investment. Any artist can build their own world in the World Builder at /world-builder: six screens, name it, lay out the streets, fill the rooms, choose the key, walk it, publish. The first 50 artists get a full world free (the Founding 50).

WAVEWARZ AFRICA (BATTLES)
Two artists, their songs, one crowd, one verdict, at /wavewarz-africa. You listen live, vote (you can change your vote), and talk in the chat. The judges are $HIKULU (he scores the craft) and NAKULU (she scores the feeling), both AI, both listen to the actual audio and drop verdicts in the room and on the results page; a Council of five AI elders each listen for one thing and answer when called by name in the chat. Hosts choose Open Mic or Main Stage; battles run on a clock. Some battles have a trading ground where backing a side with a coin counts you as a backer; the standing counts people, not money. Voice in battles is on X Spaces for now, not inside the app.

ARTIST ACCOUNTS
A listening account and an artist account are the same account. It becomes an artist account when the founder approves a claim; nobody self-declares it and uploading does not grant it. The way in is the /claim page: from Profile press "Switch to artist account", or go to /claim directly. There the person finds their page in the catalogue and presses "This is my page", or, if they are new here, fills in "New here?" with their artist name and where their music can be heard. The founder reviews it (he recorded most of the catalogue himself) and once it is approved the same account is the artist account: the Studio, the world builder, the launcher and drops open up, on the next load or by pressing "Check again" on the claim page. Until then the Studio shows only "The Studio is for artist accounts" with the claim button. The artist page also has a "This is my page" button for anyone who is not its owner. When somebody asks how to become an artist, switch to an artist account, claim their page, or why they cannot upload, this is the answer, and the app shows them a direct button for it under your reply.

FOR ARTISTS (STUDIO, /studio)
Upload a finished record (WAV or MP3, up to 100 MB). It is auditioned by measurement, then put into words by $HIKULU and NAKULU, and lands on a rung: master (meets the full standard), release (clean delivery, eligible for featured placement), or raw (out and playable, short of clean). If something on the file is actually broken it goes to your private workshop with notes and you can resend without limit. If it passes it is live the same minute, free, no distributor, no wallet needed to release. The Studio and uploads are for artist accounts only (see ARTIST ACCOUNTS). At upload you can add lyrics, credits, splits, ISRC, ISWC, language, release date, publisher and collecting society, all optional, all editable any time from your catalog (Edit details). You choose whether the record lives in the app only or also goes on chain as a tradeable asset; you can press "Take it onchain" later. Coining needs a wallet so the earnings land with you. The activity board in Studio shows plays by day, by city and by source, saves, followers, holders, copies sold, every purchase with its Base transaction, hosting fees, and licensing requests. Every song page has "License this song": film, TV, adverts, games and others can ask to use a record and the request lands in the artist's Studio with the sender's email; SONGCHAINN takes nothing from a licence. Artists can post photos and videos to the feed, tag people, and manage a gallery. The token launcher at /launch is for an artist's own token. Payouts always go to the artist's own wallet on Base.

MONEY, IN ONE BREATH
Streaming is free. The app is non-custodial: it never holds anyone's money, coins or keys. Buying a copy or a key happens in the person's own wallet on markets the app does not run. Booking an artist is paid wallet to wallet after the artist accepts. Fees on coins are set by the coin contracts, not by us; SONGCHAINN's own fees on world keys are shown on the world page before anyone buys. Network fees on Base are usually cents.

HELP
Anything you cannot answer: songchaindao@gmail.com. Bugs can be reported from the app (Report a bug). Suggestions land in the founders' inbox from the "Suggest improvement" option in Mo$ha's menu.`;

/* ------------------------------------------------------------ the brain --- */

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

type Turn = { role: "user" | "assistant"; content: string };

async function ask(db: ReturnType<typeof admin>, live: string, turns: Turn[]): Promise<string> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey });
    const model = Deno.env.get("MOSHA_MODEL") || "claude-opus-5";
    const supportsEffort = /opus-5|sonnet-5|fable|opus-4-[678]/.test(model);
    const res = await client.messages.create({
      model,
      max_tokens: 600,
      // The voice and the account never change between calls, so they are
      // the cached prefix; the live facts about this person come after.
      system: [
        { type: "text", text: `${VOICE}\n\n${KNOWLEDGE}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: live },
      ],
      messages: turns,
      ...(supportsEffort ? { output_config: { effort: "low" as const } } : {}),
    });
    if (res.stop_reason === "refusal") {
      return "That one I will not go near. Ask me anything about the music, the artists or how this place works and I am all yours.";
    }
    return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
  }

  const geminiKey = await getGeminiKey(db);
  if (geminiKey) {
    const models = [...new Set([Deno.env.get("MOSHA_MODEL") || "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3-flash-preview"])];
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: `${VOICE}\n\n${KNOWLEDGE}\n\n${live}` }] },
      contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
      generationConfig: { temperature: 0.7 },
    });
    let lastError = "";
    for (const model of models) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: "POST", headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" }, body },
      );
      if (res.ok) {
        const data = await res.json();
        return (data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "").trim();
      }
      lastError = `Gemini ${model} ${res.status}`;
      if (res.status !== 429 && res.status !== 503) break;
    }
    throw new Error(lastError);
  }

  throw new Error("NO_LLM_KEY");
}

/* --------------------------------------------------------- live context --- */

async function liveContext(db: ReturnType<typeof admin>, token: string | null, page: string | null): Promise<string> {
  const lines: string[] = [];
  const now = new Date();
  lines.push(`Today is ${now.toUTCString().slice(0, 16)}.`);
  if (page) lines.push(`The person is on the ${page} page right now.`);

  try {
    const [{ count: songs }, { count: artists }, { count: liveBattles }, { count: worlds }] = await Promise.all([
      db.from("songs").select("id", { count: "exact", head: true }).eq("is_published", true),
      db.from("artist_accounts").select("artist_id", { count: "exact", head: true }),
      db.from("battles").select("id", { count: "exact", head: true }).eq("status", "live"),
      db.from("worlds").select("slug", { count: "exact", head: true }).eq("status", "published"),
    ]);
    lines.push(
      `Right now the catalog has ${songs ?? "some"} published records from ${artists ?? "a roster of"} artists with accounts, ${liveBattles ?? 0} battle${liveBattles === 1 ? "" : "s"} live this minute, and ${(worlds ?? 0) + 1} world${(worlds ?? 0) + 1 === 1 ? "" : "s"} open (World #001 is IMan Afrikah's).`,
    );
  } catch {
    /* the account above still stands */
  }

  if (!token) {
    lines.push("The person is not signed in. You do not know their name. Invite them to sign up free when it fits, never as a wall.");
    return lines.join("\n");
  }

  try {
    const { data } = await db.auth.getUser(token);
    const user = data?.user;
    if (!user) {
      lines.push("The person is not signed in.");
      return lines.join("\n");
    }
    const uid = user.id;
    const [{ data: profile }, { data: artist }, { count: holdings }, { count: citizen }, { data: points }, { count: likes }] = await Promise.all([
      db.from("audience_profiles").select("display_name, username, gender, wallet_address, created_at").eq("user_id", uid).maybeSingle(),
      db.from("artist_accounts").select("artist_id, is_verified").eq("user_id", uid).maybeSingle(),
      db.from("song_holdings").select("song_id", { count: "exact", head: true }).eq("user_id", uid).gt("balance", 0),
      db.from("world_citizens").select("world_slug", { count: "exact", head: true }).eq("user_id", uid),
      db.from("user_points").select("*").eq("user_id", uid).maybeSingle(),
      db.from("liked_songs").select("id", { count: "exact", head: true }).eq("user_id", uid),
    ]);
    const name = profile?.display_name || profile?.username || null;
    const gender = profile?.gender as string | null | undefined;
    const refer =
      gender === "woman" ? "she/her" : gender === "man" ? "he/him" : gender === "other" ? "they/them" : "not said (use you / they)";
    lines.push(`Signed in. Name: ${name ?? "not set yet"}. Refer to them as: ${refer}.`);
    if (profile?.created_at) {
      const days = Math.max(0, Math.round((Date.now() - new Date(profile.created_at).getTime()) / 86_400_000));
      lines.push(days < 2 ? "They joined in the last day or two; they are new here." : `They have been here ${days} days.`);
    }
    lines.push(`Wallet linked: ${profile?.wallet_address ? "yes" : "no"}.`);
    lines.push(`Song copies held: ${holdings ?? 0}. Songs liked: ${likes ?? 0}. Worlds they are a citizen of: ${citizen ?? 0}.`);
    const p = points as Record<string, unknown> | null;
    if (p) {
      const total = p.total_points ?? p.points ?? p.balance;
      const tier = p.tier ?? p.tier_name;
      if (total != null) lines.push(`Points: ${total}${tier ? `, tier ${tier}` : ""}.`);
    }
    if (artist) lines.push(`They are an artist here (artist id ${artist.artist_id}${artist.is_verified ? ", verified" : ""}). Studio, uploads, the activity board and licensing requests all apply to them.`);
    else lines.push("They are a listener, not an artist account. They can claim their page or ask for one at /claim (Profile has the button, Switch to artist account); the Studio is closed to them until that is approved.");
  } catch {
    lines.push("Signed in, but their details could not be read this second; talk to them as a member.");
  }
  return lines.join("\n");
}

/* --------------------------------------------------------------- serve --- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const raw = Array.isArray(body?.messages) ? body.messages : [];
    const turns: Turn[] = raw
      .filter((m: { role?: string; content?: string }) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
      .slice(-12)
      .map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content.trim().slice(0, 1500) }));
    if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
      return json({ error: "Say something first." }, 400);
    }
    // The API wants the conversation to start with the person.
    while (turns.length && turns[0].role !== "user") turns.shift();

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const db = admin();
    // The anon key is itself a JWT; getUser rejects it, which is how a guest is told apart.
    const live = await liveContext(db, token || null, typeof body?.page === "string" ? body.page.slice(0, 60) : null);

    const reply = await ask(db, live, turns);
    return json({ reply: reply || "Say that again for me, one more time." });
  } catch (err) {
    console.error("mosha-chat error:", err);
    return json({
      reply: "My line dropped for a second. Ask me again, and if it keeps happening, songchaindao@gmail.com is a real person who will help.",
      degraded: true,
    });
  }
});
