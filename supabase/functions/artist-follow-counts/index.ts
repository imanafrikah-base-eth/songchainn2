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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const isGet = req.method === "GET";
    const body = isGet ? null : await req.json().catch(() => null);
    const artistIdsRaw = isGet ? url.searchParams.getAll("artist_id") : (body as any)?.artist_ids;

    const artistIds =
      Array.isArray(artistIdsRaw) && artistIdsRaw.length > 0
        ? artistIdsRaw.map((x) => String(x)).filter(Boolean).slice(0, 100)
        : [];

    const seen: Record<string, true> = {};
    const uniqueArtistIds: string[] = [];
    for (const id of artistIds) {
      if (seen[id]) continue;
      seen[id] = true;
      uniqueArtistIds.push(id);
    }

    if (uniqueArtistIds.length === 0) return json([]);

    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const restUrl = new URL(`${supabaseUrl}/rest/v1/liked_artists`);
    restUrl.searchParams.set("select", "artist_id");
    restUrl.searchParams.set("artist_id", `in.(${uniqueArtistIds.join(",")})`);

    const restRes = await fetch(restUrl.toString(), {
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
    });

    if (!restRes.ok) {
      const text = await restRes.text().catch(() => "");
      return json(
        { error: `PostgREST error (${restRes.status})`, details: text || restRes.statusText },
        { status: 500 },
      );
    }

    const rows = (await restRes.json().catch(() => [])) as Array<{ artist_id?: unknown }>;
    const counts = new Map<string, number>();
    for (const id of uniqueArtistIds) counts.set(id, 0);
    for (const row of rows ?? []) {
      const id = String((row as any)?.artist_id ?? "");
      if (!id) continue;
      if (!counts.has(id)) counts.set(id, 0);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    return json(
      uniqueArtistIds.map((id) => ({
        artist_id: id,
        follower_count: counts.get(id) ?? 0,
      })),
    );
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
