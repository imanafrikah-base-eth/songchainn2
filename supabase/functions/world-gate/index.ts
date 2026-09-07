// world-gate — the Artist Worlds gating engine (IMAN_WORLD_BUILD_SPEC §04).
// One question, answered fast and correctly: for this wallet, which rooms of
// a world are open right now? This is the only enforcement boundary; the
// client paints doors from this response but never decides access itself.
//
// Per-world token config is env-driven so thresholds are config, not code:
// the platform tunes them without a deploy. A world whose token address env
// is unset is in pre-launch mode: every balance reads zero, doors stay
// locked, and the client shows the "key is being cut" state.
//
// Request:  POST { world: string }  with the caller's Supabase JWT in Authorization
// Response: { rings: { ring0, ring1, ring2, council, balance, thresholds, rank, tokenLive, heldNfts } }
//
// WHOSE WALLET. The first version took a wallet address in the request body
// and reported that address's holdings as the caller's. Balances are public,
// so anybody could paste a whale's address and walk into the insider rooms.
// Now the body's wallet is ignored. The caller is identified from their JWT
// and the wallet is the one linked to their own account (audience_profiles
// or the SIWE metadata written by wallet-auth), the same rule song-holdings
// uses. No session, or no linked wallet, means the outer ring only.
//
// The verified result is also written to world_access_snapshots, so database
// triggers (meeting request pricing) can price by real holdings instead of by
// whatever tier the browser claims.

import { createClient } from "npm:@supabase/supabase-js@2";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

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

type WorldTokenConfig = {
  tokenAddressEnv: string;
  decimalsEnv: string;
  fanEnv: string;
  insiderEnv: string;
  defaultFan: number;
  defaultInsider: number;
  /**
   * The artist's Zora Creator Coin, used when no secret overrides it.
   *
   * This is why the doors open. Before this, the gate had only an env var name,
   * so until somebody set a Supabase secret every world reported tokenLive
   * false and every inner door read "the key is being cut". A world whose coin
   * is a published fact should not wait on a secret to admit anybody.
   *
   * The env var still wins where it is set, so a coin can be changed without a
   * deploy.
   */
  defaultTokenAddress?: string;
};

/**
 * One entry per world, keyed by world slug (must match src/worlds/registry.ts).
 *
 * Addresses are the artists' Zora Creator Coins, read off the Zora API on
 * 1 Sep 2026 from handles the artists gave us directly. Full list and the
 * verification note live in `src/lib/artistCoins.ts`.
 *
 * THRESHOLDS: every Zora creator coin is minted at 1,000,000,000 supply, which
 * was checked against IMan's rather than assumed. So 500,000 is 0.05% of the
 * coin and 5,000,000 is 0.5%, and the same pair is meaningful for every artist
 * here. If a coin ever launches with a different supply, give it its own
 * numbers rather than inheriting these.
 */
const WORLD_TOKENS: Record<string, WorldTokenConfig> = {
  "iman-afrikah": {
    tokenAddressEnv: "IMAN_TOKEN_ADDRESS",
    decimalsEnv: "IMAN_TOKEN_DECIMALS",
    fanEnv: "WORLD_FAN_THRESHOLD",
    insiderEnv: "WORLD_INSIDER_THRESHOLD",
    defaultFan: 500_000,
    defaultInsider: 5_000_000,
    defaultTokenAddress: "0x46bd92b482e506ecacffd4e485f3b50a4828deb7",
  },
};

/**
 * Artists whose creator coin is known but whose world is not built yet. Kept
 * here so that the day a world is published, its door already has a key.
 */
const ARTIST_CREATOR_COINS: Record<string, string> = {
  "nda": "0xd95f5343ddd180e560dcdf165c39d2e904da3d8f",
  "santana": "0xedbad33620e105d499cbe97a00c0deee252064b6",
  "7roo7h-based": "0x846ddf7f47b3c65e73b24db75fb4211f5f1df3b5",
  "denajah": "0x0f2a0e134a19f53d266b976fd2fae370ac832d13",
  "sanchy": "0xc8b3b18f1c51bdcab4b7e971e093780bd074e9fd",
  "prp": "0x7dc287ab5512524a4814786db339ea5b89fbbf70",
};

function intFromEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const IS_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/**
 * The token rules for a world.
 *
 * A world listed in WORLD_TOKENS uses its own entry. Any other world whose slug
 * matches an artist we hold a creator coin for gets a config built on the spot,
 * so a world published from the builder is gated the moment it exists rather
 * than waiting for someone to remember to add it here.
 */
function worldConfigFor(slug: string): WorldTokenConfig | undefined {
  const known = WORLD_TOKENS[slug];
  if (known) return known;

  const coin = ARTIST_CREATOR_COINS[slug];
  if (!coin) return undefined;

  return {
    tokenAddressEnv: `WORLD_TOKEN_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
    decimalsEnv: "WORLD_TOKEN_DECIMALS",
    fanEnv: "WORLD_FAN_THRESHOLD",
    insiderEnv: "WORLD_INSIDER_THRESHOLD",
    defaultFan: 500_000,
    defaultInsider: 5_000_000,
    defaultTokenAddress: coin,
  };
}

function tokenAddressFor(cfg: WorldTokenConfig): string | null {
  // A secret, where one is set, always wins: it is how a coin gets changed
  // without a deploy.
  const raw = Deno.env.get(cfg.tokenAddressEnv)?.trim();
  if (raw && IS_ADDRESS.test(raw)) return raw;

  // Otherwise fall back to the artist's published creator coin. This is what
  // stops a world sitting shut waiting on a secret nobody set.
  const fallback = cfg.defaultTokenAddress?.trim();
  if (fallback && IS_ADDRESS.test(fallback)) return fallback;

  return null;
}

const BALANCE_OF_SELECTOR = "0x70a08231"; // balanceOf(address)
// ERC-1155 balanceOf(address,uint256), for drops used as keys.
const BALANCE_OF_1155_SELECTOR = "0x00fdd58e";
const CACHE_TTL_MS = 30_000;
const balanceCache = new Map<string, { balance: number; at: number }>();

/**
 * A world built in the builder has no creator coin here, and until now the
 * gate answered "Unknown world" for it, so its doors could never open. It
 * gets the outer ring, and whatever its drops unlock.
 */
function builderWorldConfig(): WorldTokenConfig {
  return {
    tokenAddressEnv: "WORLD_TOKEN_UNSET",
    decimalsEnv: "WORLD_TOKEN_DECIMALS",
    fanEnv: "WORLD_FAN_THRESHOLD",
    insiderEnv: "WORLD_INSIDER_THRESHOLD",
    defaultFan: 500_000,
    defaultInsider: 5_000_000,
  };
}

type KeyDrop = { id: string; contract_address: string; token_id: number; key_ring: string | null };

/**
 * How many copies of each of this world's live drops the wallet holds, read
 * from Base. A failed read is zero: a door closes, it never opens by mistake.
 */
async function getDropBalances(drops: KeyDrop[], wallet: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!drops.length) return out;
  const rpcUrl = Deno.env.get("BASE_RPC_URL") ?? "https://mainnet.base.org";
  const who = wallet.toLowerCase().slice(2).padStart(64, "0");
  await Promise.all(drops.map(async (d) => {
    const key = `1155:${d.contract_address}:${d.token_id}:${wallet.toLowerCase()}`;
    const hit = balanceCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) { out[d.id] = hit.balance; return; }
    try {
      const data = BALANCE_OF_1155_SELECTOR + who + BigInt(d.token_id).toString(16).padStart(64, "0");
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: d.contract_address, data }, "latest"] }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) { out[d.id] = hit?.balance ?? 0; return; }
      const body = (await res.json()) as { result?: string };
      if (!body.result || !/^0x[a-fA-F0-9]*$/.test(body.result)) { out[d.id] = hit?.balance ?? 0; return; }
      const n = Number(BigInt(body.result === "0x" ? "0x0" : body.result));
      balanceCache.set(key, { balance: n, at: Date.now() });
      out[d.id] = n;
    } catch {
      out[d.id] = hit?.balance ?? 0;
    }
  }));
  return out;
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

/**
 * Whole-token balance for a wallet (floored). Returns 0 when the token is
 * not deployed, the address is malformed, or the RPC read fails: a failed
 * read must close doors, never open them.
 */
async function getTokenBalance(cfg: WorldTokenConfig, wallet: string): Promise<number> {
  const token = tokenAddressFor(cfg);
  if (!token) return 0;

  const key = `${token}:${wallet.toLowerCase()}`;
  const hit = balanceCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.balance;

  try {
    const data = BALANCE_OF_SELECTOR + wallet.toLowerCase().slice(2).padStart(64, "0");
    const rpcUrl = Deno.env.get("BASE_RPC_URL") ?? "https://mainnet.base.org";
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: token, data }, "latest"],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return hit?.balance ?? 0;
    const body = (await res.json()) as { result?: string };
    if (!body.result || !/^0x[a-fA-F0-9]*$/.test(body.result)) return hit?.balance ?? 0;

    const raw = BigInt(body.result === "0x" ? "0x0" : body.result);
    const divisor = BigInt(10) ** BigInt(intFromEnv(cfg.decimalsEnv, 18));
    const balance = Number(raw / divisor);
    balanceCache.set(key, { balance, at: Date.now() });
    return balance;
  } catch {
    return hit?.balance ?? 0;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(origin) });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsFor(origin) });
  }

  try {
    const { world } = await req.json().catch(() => ({}));
    let cfg = typeof world === "string" ? worldConfigFor(world) : undefined;
    const db = admin();
    if (!cfg && typeof world === "string" && /^[a-z0-9-]{1,64}$/.test(world)) {
      const { data: row } = await db.from("worlds").select("slug").eq("slug", world).eq("status", "published").maybeSingle();
      if (row) cfg = builderWorldConfig();
    }
    if (!cfg) return json(origin, { error: "Unknown world" }, 404);

    // The drops in this world that are live. Each one the caller holds is
    // reported by id, and a drop marked as a key grants its ring.
    const { data: dropRows } = await db
      .from("world_nfts")
      .select("id, contract_address, token_id, key_ring")
      .eq("world_slug", world)
      .eq("status", "live");
    const keyDrops = ((dropRows ?? []) as KeyDrop[]).filter((d) => isAddress(d.contract_address) && d.token_id != null);

    const thresholds = {
      FAN: intFromEnv(cfg.fanEnv, cfg.defaultFan),
      INSIDER: intFromEnv(cfg.insiderEnv, cfg.defaultInsider),
    };
    const tokenLive = tokenAddressFor(cfg) !== null;

    // Who is asking, and which wallet is really theirs.
    let userId: string | null = null;
    let wallet: string | null = null;
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (token) {
      const { data } = await db.auth.getUser(token);
      const user = data?.user;
      if (user) {
        userId = user.id;
        const { data: profile } = await db
          .from("audience_profiles")
          .select("wallet_address")
          .eq("user_id", user.id)
          .maybeSingle();
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        wallet =
          [profile?.wallet_address, meta.wallet_address, meta.farcaster_address].find(isAddress) ?? null;
      }
    }

    if (!isAddress(wallet)) {
      return json(origin, {
        rings: {
          ring0: true, ring1: false, ring2: false, council: false,
          balance: 0, thresholds, rank: null, tokenLive,
        },
      });
    }

    const [balance, heldNfts] = await Promise.all([
      getTokenBalance(cfg, wallet),
      getDropBalances(keyDrops, wallet),
    ]);
    // Council rank comes from the reputation service (Phase B). Until the
    // leaderboard is live nobody holds a seat.
    const rank: number | null = null;

    // A drop the artist marked as a key opens its ring for whoever holds one.
    const keyGrantsFan = keyDrops.some((d) => d.key_ring === "fan" && (heldNfts[d.id] ?? 0) > 0);
    const keyGrantsInsider = keyDrops.some((d) => d.key_ring === "insider" && (heldNfts[d.id] ?? 0) > 0);

    const rings = {
      ring0: true,
      ring1: balance >= thresholds.FAN || keyGrantsFan || keyGrantsInsider,
      ring2: balance >= thresholds.INSIDER || keyGrantsInsider,
      council: rank !== null && rank <= 10,
      balance,
      thresholds,
      rank,
      tokenLive,
      heldNfts,
    };

    // Remember what was verified, for the database to price against.
    if (userId) {
      const { error } = await db.from("world_access_snapshots").upsert(
        {
          user_id: userId,
          world_slug: world,
          wallet: wallet.toLowerCase(),
          ring1: rings.ring1,
          ring2: rings.ring2,
          council: rings.council,
          balance,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "user_id,world_slug" },
      );
      if (error) console.error("world-gate snapshot write failed:", error.message);
    }

    return json(origin, { rings });
  } catch (err) {
    console.error("world-gate error:", err);
    return json(origin, { error: "Gate resolution failed" }, 500);
  }
});
