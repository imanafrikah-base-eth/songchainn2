// artist-dm-gate: may this fan message this musician?
//
// The founder's rule: people text each other freely, but a fan reaches a
// musician only while holding $0.50 worth of that musician's artist coin (their
// Zora creator coin on Base), the same bar as seeing when the artist is online
// (HOLDER_PERK_USD in src/hooks/useArtistCoinHolding.ts). This function reads
// the holding, prices it with Zora's coin price exactly as useArtistCoin does,
// and writes the verdict to dm_coin_access; the DM RPCs trust it for 15 minutes
// via can_dm_artist. The browser never decides.
//
// Request:  POST { artistUserId } with the caller's JWT
// Response: { allowed, reason, balance, usdValue, minUsd, coinAddress, zoraHandle }
//   reason: 'not_artist' | 'exempt' | 'replied' | 'holds' | 'no_balance'
//         | 'no_verified_wallet' | 'no_coin' | 'check_failed'
//
// WHOSE WALLET. Only wallets on the caller's own account that proved their key
// through wallet-link (verified_at set) count.
//
// A FAILED READ IS NOT A ZERO. If Base or the Zora price cannot be read, the
// answer is check_failed and nothing is written. Never allowed on a guess.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCoin, setApiKey } from "npm:@zoralabs/coins-sdk";

/** Keep in step with HOLDER_PERK_USD and can_dm_artist (usd_value >= 0.50). */
const MIN_USD = 0.5;

const zoraKey = Deno.env.get("ZORA_API_KEY");
if (zoraKey) setApiKey(zoraKey);

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

/** USD price of one coin, from Zora, the way useArtistCoin reads it. Throws on failure. */
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
  if (!user) return json(origin, { error: "Sign in first." }, 401);

  const body = (await req.json().catch(() => ({}))) as { artistUserId?: unknown };
  const artistUserId = String(body.artistUserId ?? "").trim();
  if (!UUID.test(artistUserId)) return json(origin, { error: "Pick somebody to message." }, 400);

  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const base = {
    balance: 0,
    usdValue: 0,
    minUsd: MIN_USD,
    coinAddress: null as string | null,
    zoraHandle: null as string | null,
  };

  try {
    // Is the person being messaged a musician at all?
    const { data: account } = await db
      .from("artist_accounts")
      .select("artist_id")
      .eq("user_id", artistUserId)
      .limit(1)
      .maybeSingle();
    if (!account) return json(origin, { ...base, allowed: true, reason: "not_artist" });

    // Artists and admins are not fans at this door. Mirrors can_dm_artist.
    if (user.id === artistUserId) return json(origin, { ...base, allowed: true, reason: "exempt" });
    const [{ data: callerIsArtist }, { data: callerIsAdmin }] = await Promise.all([
      db.from("artist_accounts").select("artist_id").eq("user_id", user.id).limit(1).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").limit(1).maybeSingle(),
    ]);
    if (callerIsArtist || callerIsAdmin) return json(origin, { ...base, allowed: true, reason: "exempt" });

    // The coin, from the database only.
    const { data: coin } = await db
      .from("artist_coins")
      .select("coin_address, zora_handle")
      .eq("artist_id", account.artist_id)
      .maybeSingle();
    const coinAddress = coin?.coin_address && ADDRESS.test(coin.coin_address) ? coin.coin_address.toLowerCase() : null;
    const zoraHandle = (coin?.zora_handle as string | null) ?? null;

    // An artist who has already written to this fan has opened the thread.
    const { data: mine } = await db.from("dm_participants").select("conversation_id").eq("user_id", user.id);
    const convIds = (mine ?? []).map((r) => r.conversation_id as string);
    if (convIds.length) {
      const { data: reply } = await db
        .from("dm_messages")
        .select("id")
        .eq("sender_user_id", artistUserId)
        .in("conversation_id", convIds)
        .limit(1)
        .maybeSingle();
      if (reply) return json(origin, { ...base, coinAddress, zoraHandle, allowed: true, reason: "replied" });
    }

    if (!coinAddress) return json(origin, { ...base, zoraHandle, allowed: false, reason: "no_coin" });

    const { data: wallets } = await db
      .from("user_wallets")
      .select("address")
      .eq("user_id", user.id)
      .not("verified_at", "is", null);
    const addresses = [...new Set((wallets ?? []).map((w) => String(w.address).toLowerCase()).filter((a) => ADDRESS.test(a)))];

    const record = async (balance: bigint, usdValue: number, wallet: string | null) => {
      const { error } = await db.from("dm_coin_access").upsert(
        {
          user_id: user.id,
          artist_user_id: artistUserId,
          coin_address: coinAddress,
          wallet,
          balance: balance.toString(),
          usd_value: usdValue,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "user_id,artist_user_id" },
      );
      if (error) console.error("artist-dm-gate: could not record the check", error.message);
      return !error;
    };

    const failed = { ...base, coinAddress, zoraHandle, allowed: false, reason: "check_failed" };

    if (!addresses.length) {
      await record(0n, 0, null);
      return json(origin, { ...base, coinAddress, zoraHandle, allowed: false, reason: "no_verified_wallet" });
    }

    let balances: bigint[];
    try {
      balances = await Promise.all(addresses.map((a) => readBalance(coinAddress, a)));
    } catch (err) {
      console.error("artist-dm-gate: balance read failed", err);
      return json(origin, failed);
    }

    const total = balances.reduce((s, b) => s + b, 0n);
    const holder = addresses[balances.findIndex((b) => b > 0n)] ?? addresses[0];
    const balance = wholeCoins(total);

    // Nothing held needs no price: it is worth nothing at any price.
    let usdValue = 0;
    if (total > 0n) {
      try {
        usdValue = balance * (await readPriceUsd(coinAddress));
      } catch (err) {
        console.error("artist-dm-gate: price read failed", err);
        return json(origin, { ...failed, balance });
      }
    }
    usdValue = Math.floor(usdValue * 1e6) / 1e6;

    const saved = await record(total, usdValue, holder);
    const result = { ...base, balance, usdValue, coinAddress, zoraHandle };

    if (usdValue >= MIN_USD) {
      // Without the saved row the RPCs would refuse anyway, so do not promise.
      if (!saved) return json(origin, { ...result, allowed: false, reason: "check_failed" });
      return json(origin, { ...result, allowed: true, reason: "holds" });
    }
    return json(origin, { ...result, allowed: false, reason: "no_balance" });
  } catch (err) {
    console.error("artist-dm-gate error:", err);
    return json(origin, { ...base, allowed: false, reason: "check_failed" });
  }
});
