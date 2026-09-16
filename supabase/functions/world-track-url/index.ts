// world-track-url — the only way to the audio of a song that lives in a world.
//
// A world track plays for the people who hold enough of that artist's coin.
// Everybody else gets the preview video, and a straight answer about what it
// would take. This function is the enforcement boundary: the browser never
// knows where the file is, and the link it is handed is signed and dies in two
// minutes, so it cannot be passed around.
//
// Request:  POST { trackId }  with the caller's JWT
// Response: { allowed, reason, url?, expiresIn?, balance, usdValue, needUsd, coinAddress, zoraHandle, worldSlug, streetSlug }
//
// WHOSE WALLET. The wallet is never taken from the request. It is the wallet
// verified against the caller's own account, the same rule artist-dm-gate and
// world-gate follow, because balances are public and anybody could otherwise
// paste a whale's address and walk in.
//
// A FAILED READ IS NOT A ZERO. If Base or the Zora price cannot be read, the
// answer is check_failed, never "you do not hold enough". Somebody who paid
// for the coin must never be told they have nothing because a node was slow.
//
// THE ARTIST IS NOT A VISITOR TO THEIR OWN MUSIC. The artist whose coin this
// is, and the owner of the world, always play.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCoin, setApiKey } from "npm:@zoralabs/coins-sdk";

const zoraKey = Deno.env.get("ZORA_API_KEY");
if (zoraKey) setApiKey(zoraKey);

/** How long a handed-out link lives. Long enough to start a song, short enough to be worthless when shared. */
const LINK_SECONDS = 120;

const ALLOWED_ORIGINS = new Set<string>(
  (Deno.env.get("ALLOWED_ORIGINS") ??
    "https://songchainn.xyz,https://app.songchainn.xyz,https://www.songchainn.xyz,https://beta.songchainn.xyz,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173")
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
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BALANCE_OF_SELECTOR = "0x70a08231"; // balanceOf(address)

/** Raw balanceOf in base units. Throws when the chain cannot be read. */
async function readBalance(token: string, wallet: string): Promise<bigint> {
  const rpcUrl = Deno.env.get("BASE_RPC_URL") ?? "https://mainnet.base.org";
  const data = BALANCE_OF_SELECTOR + wallet.toLowerCase().slice(2).padStart(64, "0");
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token, data }, "latest"] }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const body = (await res.json()) as { result?: string; error?: unknown };
  if (body.error || typeof body.result !== "string" || !/^0x[0-9a-fA-F]*$/.test(body.result)) {
    throw new Error("rpc bad result");
  }
  return BigInt(body.result === "0x" ? "0x0" : body.result);
}

/** USD price of one coin, live from Zora, the way the rest of the app reads it. Throws on failure. */
async function readPriceUsd(coinAddress: string): Promise<number> {
  const res = await Promise.race([
    getCoin({ address: coinAddress, chain: 8453 }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("zora timeout")), 8_000)),
  ]);
  const z = (res as { data?: { zora20Token?: { tokenPrice?: { priceInUsdc?: string } } } })?.data?.zora20Token;
  const price = Number(z?.tokenPrice?.priceInUsdc);
  if (!z || !Number.isFinite(price) || price <= 0) throw new Error("zora price unavailable");
  return price;
}

/** Whole coins, for display and pricing. The coin has 18 decimals. */
function wholeCoins(raw: bigint): number {
  return Number(raw / 10n ** 12n) / 1e6;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(origin) });
  if (req.method !== "POST") return json(origin, { error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await asUser.auth.getUser();
  const user = userData?.user;

  const body = (await req.json().catch(() => ({}))) as { trackId?: unknown };
  const trackId = String(body.trackId ?? "").trim();
  if (!UUID.test(trackId)) return json(origin, { allowed: false, reason: "no_track" }, 400);

  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    const { data: track } = await db
      .from("world_tracks")
      .select("id, world_slug, world_id, street_slug, artist_id, title, part_label, unlock_usd, published_at")
      .eq("id", trackId)
      .maybeSingle();
    if (!track) return json(origin, { allowed: false, reason: "no_track" }, 404);

    const needUsd = Number(track.unlock_usd ?? 1);
    const base = {
      balance: 0,
      usdValue: 0,
      needUsd,
      coinAddress: null as string | null,
      zoraHandle: null as string | null,
      worldSlug: track.world_slug as string,
      streetSlug: (track.street_slug as string | null) ?? null,
      title: track.title as string,
      partLabel: (track.part_label as string | null) ?? null,
    };

    // Not published yet, and not the artist's own listen: nothing to hand over.
    const { data: file } = await db
      .from("world_track_files")
      .select("bucket, path")
      .eq("track_id", trackId)
      .maybeSingle();

    // Somebody has to be signed in for there to be a wallet to read.
    if (!user) return json(origin, { ...base, allowed: false, reason: "signed_out" });

    const sign = async () => {
      if (!file?.path) return json(origin, { ...base, allowed: false, reason: "not_ready" });
      const { data: signed, error } = await db.storage
        .from(String(file.bucket || "world-locked"))
        .createSignedUrl(String(file.path), LINK_SECONDS);
      if (error || !signed?.signedUrl) {
        console.error("world-track-url: could not sign", error?.message);
        return json(origin, { ...base, allowed: false, reason: "check_failed" });
      }
      return { signedUrl: signed.signedUrl };
    };

    // The artist whose coin this is, the owner of the world, and admins walk
    // straight through. An artist locked out of their own record would be a
    // bug, not a rule.
    const [{ data: ownsArtist }, { data: isAdmin }, { data: world }] = await Promise.all([
      track.artist_id
        ? db.from("artist_accounts").select("artist_id").eq("user_id", user.id).eq("artist_id", track.artist_id).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      db.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").limit(1).maybeSingle(),
      track.world_id
        ? db.from("worlds").select("owner_id").eq("id", track.world_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const isOwner = Boolean(ownsArtist) || Boolean(isAdmin) || (world?.owner_id && world.owner_id === user.id);

    if (isOwner) {
      const signedOrResponse = await sign();
      if (signedOrResponse instanceof Response) return signedOrResponse;
      return json(origin, { ...base, allowed: true, reason: "owner", url: signedOrResponse.signedUrl, expiresIn: LINK_SECONDS });
    }

    // The coin that opens it, from the database only.
    const { data: coin } = track.artist_id
      ? await db.from("artist_coins").select("coin_address, zora_handle").eq("artist_id", track.artist_id).maybeSingle()
      : { data: null };
    const coinAddress = coin?.coin_address && ADDRESS.test(coin.coin_address) ? coin.coin_address.toLowerCase() : null;
    const zoraHandle = (coin?.zora_handle as string | null) ?? null;
    if (!coinAddress) return json(origin, { ...base, zoraHandle, allowed: false, reason: "no_coin" });

    const withCoin = { ...base, coinAddress, zoraHandle };

    const { data: wallets } = await db
      .from("user_wallets")
      .select("address")
      .eq("user_id", user.id)
      .not("verified_at", "is", null);
    const addresses = [...new Set((wallets ?? []).map((w) => String(w.address).toLowerCase()).filter((a) => ADDRESS.test(a)))];
    if (!addresses.length) return json(origin, { ...withCoin, allowed: false, reason: "no_wallet" });

    let balances: bigint[];
    try {
      balances = await Promise.all(addresses.map((a) => readBalance(coinAddress, a)));
    } catch (err) {
      console.error("world-track-url: balance read failed", err);
      return json(origin, { ...withCoin, allowed: false, reason: "check_failed" });
    }

    const total = balances.reduce((s, b) => s + b, 0n);
    const balance = wholeCoins(total);

    // Nothing held needs no price: it is worth nothing at any price.
    let usdValue = 0;
    if (total > 0n) {
      try {
        usdValue = balance * (await readPriceUsd(coinAddress));
      } catch (err) {
        console.error("world-track-url: price read failed", err);
        return json(origin, { ...withCoin, balance, allowed: false, reason: "check_failed" });
      }
    }
    usdValue = Math.floor(usdValue * 1e6) / 1e6;

    const result = { ...withCoin, balance, usdValue };
    if (usdValue + 1e-9 < needUsd) return json(origin, { ...result, allowed: false, reason: "not_enough" });

    const signedOrResponse = await sign();
    if (signedOrResponse instanceof Response) return signedOrResponse;
    return json(origin, { ...result, allowed: true, reason: "holds", url: signedOrResponse.signedUrl, expiresIn: LINK_SECONDS });
  } catch (err) {
    console.error("world-track-url error:", err);
    return json(origin, { allowed: false, reason: "check_failed" });
  }
});
