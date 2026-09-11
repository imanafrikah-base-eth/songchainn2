// world-voice-token: a LiveKit pass for a world's live station.
//
// A world's artist opens a session (a world_voice_sessions row, allowed only by
// can_host_world_voice) and then asks here for a pass to its room. The artist
// who opened it may speak; everybody else, signed in or not, may only listen.
// Nobody is given a pass to a session that has ended.
//
// Separate from livekit-token on purpose: that one answers for battle rooms by
// battle_rooms.role, and a world station has no battle and no roles table.
//
// Request:  POST { sessionId, participantName? }
// Response: { token, wsUrl, roomName, identity, role: 'host' | 'listener' }

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set<string>(
  (Deno.env.get("ALLOWED_ORIGINS") ??
    "https://songchainn.xyz,https://app.songchainn.xyz,https://www.songchainn.xyz,https://beta.songchainn.xyz,http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((s) => s.trim()).filter(Boolean),
);

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(origin), "Content-Type": "application/json" },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* A LiveKit access token is an HS256 JWT. Signed here with WebCrypto, the same
   way livekit-token does it, so there is no SDK to load in Deno. */

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function buildJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const head = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${base64Url(new Uint8Array(sig))}`;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(origin) });
  if (req.method !== "POST") return json(origin, { error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("LIVEKIT_API_KEY");
  const apiSecret = Deno.env.get("LIVEKIT_API_SECRET") || Deno.env.get("LIVEKIT_SECRET");
  const wsUrl = Deno.env.get("LIVEKIT_WS_URL") || Deno.env.get("LIVEKIT_URL");
  if (!apiKey || !apiSecret || !wsUrl) {
    return json(origin, { error: "Live voice is not switched on yet.", code: "voice_off" }, 503);
  }

  const body = (await req.json().catch(() => ({}))) as { sessionId?: unknown; participantName?: unknown };
  const sessionId = String(body.sessionId ?? "");
  if (!UUID.test(sessionId)) return json(origin, { error: "Bad request." }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: session } = await db
    .from("world_voice_sessions")
    .select("id, world_slug, host_id, room_name, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return json(origin, { error: "That session does not exist." }, 404);
  if (session.status !== "live") return json(origin, { error: "That session has ended." }, 410);

  // Guests may listen, so a missing or anonymous session is not an error here.
  const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await asUser.auth.getUser();
  const user = userData?.user ?? null;

  const isHost = Boolean(user && user.id === session.host_id);
  if (isHost) {
    // Hosting is checked again at the moment of speaking, not only when the
    // session was opened.
    const { data: allowed } = await asUser.rpc("can_host_world_voice", { _slug: session.world_slug });
    if (!allowed) return json(origin, { error: "Voice is not on for this world." }, 403);
  }

  const identity = user?.id ?? `guest-${crypto.randomUUID()}`;
  const name = String(body.participantName ?? "").trim().slice(0, 60) || (isHost ? "Host" : "Listener");
  const now = Math.floor(Date.now() / 1000);

  const token = await buildJwt(
    {
      iss: apiKey,
      sub: identity,
      iat: now,
      nbf: now - 5,
      exp: now + (isHost ? 6 : 3) * 60 * 60,
      jti: crypto.randomUUID(),
      name,
      metadata: JSON.stringify({ world_slug: session.world_slug, session_id: session.id, role: isHost ? "host" : "listener" }),
      video: {
        room: session.room_name,
        roomJoin: true,
        canPublish: isHost,
        canSubscribe: true,
        canPublishData: false,
      },
    },
    apiSecret,
  );

  return json(origin, { token, wsUrl, roomName: session.room_name, identity, role: isHost ? "host" : "listener" });
});
