const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const getEnv = (key: string): string | undefined => {
  const denoEnv = (globalThis as any)?.Deno?.env;
  if (denoEnv?.get) return denoEnv.get(key);
  const nodeEnv = (globalThis as any)?.process?.env;
  if (nodeEnv && typeof nodeEnv === "object") return nodeEnv[key];
  return undefined;
};

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

const base64UrlEncode = (input: Uint8Array | string): string => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const signHs256 = async (data: string, secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signature));
};

const buildJwt = async (payload: Record<string, unknown>, secret: string): Promise<string> => {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHs256(signingInput, secret);
  return `${signingInput}.${signature}`;
};

const getAuthenticatedUser = async (req: Request) => {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!supabaseUrl || !supabaseAnonKey || !authHeader) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: authHeader,
    },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as { id?: string; email?: string } | null;
};

const getBattleRole = async (battleId: string, userId: string): Promise<string> => {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return "audience";

  const restUrl = new URL(`${supabaseUrl}/rest/v1/battle_rooms`);
  restUrl.searchParams.set("select", "role");
  restUrl.searchParams.set("battle_id", `eq.${battleId}`);
  restUrl.searchParams.set("user_id", `eq.${userId}`);
  restUrl.searchParams.set("order", "last_seen_at.desc");
  restUrl.searchParams.set("limit", "1");

  const res = await fetch(restUrl.toString(), {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!res.ok) return "audience";

  const rows = (await res.json().catch(() => [])) as Array<{ role?: string }>;
  return rows[0]?.role || "audience";
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const livekitApiKey = getEnv("LIVEKIT_API_KEY");
    const livekitApiSecret = getEnv("LIVEKIT_API_SECRET") || getEnv("LIVEKIT_SECRET");
    const livekitWsUrl = getEnv("LIVEKIT_WS_URL") || getEnv("LIVEKIT_URL");
    if (!livekitApiKey || !livekitApiSecret || !livekitWsUrl) {
      return json({ error: "Missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_WS_URL" }, { status: 500 });
    }

    const user = await getAuthenticatedUser(req);
    if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const roomName = String((body as any)?.roomName || "").trim();
    const participantName = String((body as any)?.participantName || "").trim() || "WaveWarz Listener";
    if (!roomName) return json({ error: "roomName is required" }, { status: 400 });

    const role = await getBattleRole(roomName, user.id);
    const canPublish = role === "host" || role === "co-host" || role === "speaker";
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60;

    const payload = {
      iss: livekitApiKey,
      sub: user.id,
      iat: now,
      nbf: now - 5,
      exp,
      jti: crypto.randomUUID(),
      name: participantName,
      metadata: JSON.stringify({ battle_id: roomName, role }),
      video: {
        room: roomName,
        roomJoin: true,
        canPublish,
        canSubscribe: true,
        canPublishData: true,
      },
    };

    const token = await buildJwt(payload, livekitApiSecret);
    return json({
      token,
      wsUrl: livekitWsUrl,
      roomName,
      identity: user.id,
      role,
    });
  } catch (error) {
    return json({ error: String((error as any)?.message ?? error) }, { status: 500 });
  }
};

const denoServe = (globalThis as any)?.Deno?.serve;
if (typeof denoServe === "function") {
  denoServe(handler);
} else {
  (globalThis as any).addEventListener?.("fetch", (event: any) => {
    event.respondWith(handler(event.request));
  });
}

