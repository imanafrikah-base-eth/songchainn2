import { supabase } from "@/battlezone/integrations/supabase/client";

export type LiveKitTokenResponse = {
  token: string;
  wsUrl: string;
  roomName: string;
  identity: string;
  role: string;
};

export async function getLiveKitToken(roomId: string, userId: string, participantName: string): Promise<LiveKitTokenResponse> {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const apiRes = await fetch("/api/livekit-token", {
    method: "POST",
    headers,
    body: JSON.stringify({ roomId, userId, participantName }),
  }).catch(() => null);

  if (apiRes?.ok) {
    const apiData = (await apiRes.json().catch(() => null)) as LiveKitTokenResponse | null;
    if (apiData?.token) return apiData;
  }

  const { data, error } = await supabase.functions.invoke("livekit-token", {
    body: { roomName: roomId, participantName, userId },
  });

  if (!error) {
    const tokenData = data as LiveKitTokenResponse | null;
    const fallbackWsUrl = String(import.meta.env.VITE_LIVEKIT_WS_URL || "").trim();
    if (tokenData && !tokenData.wsUrl && fallbackWsUrl) {
      tokenData.wsUrl = fallbackWsUrl;
    }

    if (tokenData?.token && tokenData?.wsUrl) {
      return tokenData;
    }
  }

  // Final fallback: local Node token service.
  const localTokenEndpoint = String(import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT || "http://127.0.0.1:7880/token").trim();
  const localRes = await fetch(localTokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomName: roomId, participantName, userId }),
  }).catch(() => null);

  if (localRes?.ok) {
    const localData = (await localRes.json().catch(() => null)) as LiveKitTokenResponse | null;
    const fallbackWsUrl = String(import.meta.env.VITE_LIVEKIT_WS_URL || "").trim();
    if (localData && !localData.wsUrl && fallbackWsUrl) {
      localData.wsUrl = fallbackWsUrl;
    }
    if (localData?.token && localData?.wsUrl) {
      return localData;
    }
  }

  throw new Error(
    (error?.message && `Failed to get LiveKit token: ${error.message}`) ||
      "LiveKit token response is invalid. Check /api/livekit-token, supabase function, or local token server."
  );
}
