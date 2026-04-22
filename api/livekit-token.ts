import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function sendJson(res: any, status: number, body: unknown) {
  res.statusCode = status;
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_SECRET || process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_WS_URL;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return sendJson(res, 500, { error: "Missing LIVEKIT_API_KEY / LIVEKIT_SECRET / LIVEKIT_URL" });
    }
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRole) {
      return sendJson(res, 500, { error: "Missing Supabase env for auth/role checks" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const roomId = String(body.roomId || "").trim();
    const requestedUserId = String(body.userId || "").trim();
    const participantName = String(body.participantName || "").trim() || "WaveWarz Listener";
    if (!roomId || !requestedUserId) {
      return sendJson(res, 400, { error: "roomId and userId are required" });
    }

    const authHeader = String(req.headers?.authorization || "");
    if (!authHeader) return sendJson(res, 401, { error: "Missing Authorization header" });

    const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: authUserData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authUserData?.user?.id) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }
    const authUserId = authUserData.user.id;
    if (authUserId !== requestedUserId) {
      return sendJson(res, 403, { error: "userId mismatch" });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceRole, { auth: { persistSession: false } });
    const { data: roomRoleRows } = await serviceClient
      .from("battle_rooms")
      .select("role")
      .eq("battle_id", roomId)
      .eq("user_id", authUserId)
      .order("last_seen_at", { ascending: false })
      .limit(1);

    const role = roomRoleRows?.[0]?.role || "audience";
    const canPublish = role === "host" || role === "co-host" || role === "speaker";

    const accessToken = new AccessToken(apiKey, apiSecret, {
      identity: authUserId,
      name: participantName,
      ttl: "1h",
      metadata: JSON.stringify({ battle_id: roomId, role }),
    });

    accessToken.addGrant({
      room: roomId,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await accessToken.toJwt();
    return sendJson(res, 200, {
      token: jwt,
      wsUrl: livekitUrl,
      roomName: roomId,
      identity: authUserId,
      role,
      canPublish,
    });
  } catch (error) {
    return sendJson(res, 500, { error: String((error as any)?.message ?? error) });
  }
}

