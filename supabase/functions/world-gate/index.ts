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
// Request:  POST { world: string, wallet?: string | null }
// Response: { rings: { ring0, ring1, ring2, council, balance, thresholds, rank, tokenLive } }

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

type WorldTokenConfig = {
  tokenAddressEnv: string;
  decimalsEnv: string;
  fanEnv: string;
  insiderEnv: string;
  defaultFan: number;
  defaultInsider: number;
};

// One entry per launched world, keyed by world slug (must match the client
// registry in src/worlds/registry.ts).
const WORLD_TOKENS: Record<string, WorldTokenConfig> = {
  "iman-afrikah": {
    tokenAddressEnv: "IMAN_TOKEN_ADDRESS",
    decimalsEnv: "IMAN_TOKEN_DECIMALS",
    fanEnv: "WORLD_FAN_THRESHOLD",
    insiderEnv: "WORLD_INSIDER_THRESHOLD",
    defaultFan: 1_000,
    defaultInsider: 10_000,
  },
};

function intFromEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function tokenAddressFor(cfg: WorldTokenConfig): string | null {
  const raw = Deno.env.get(cfg.tokenAddressEnv)?.trim();
  if (!raw || !/^0x[a-fA-F0-9]{40}$/.test(raw)) return null;
  return raw;
}

const BALANCE_OF_SELECTOR = "0x70a08231"; // balanceOf(address)
const CACHE_TTL_MS = 30_000;
const balanceCache = new Map<string, { balance: number; at: number }>();

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
    const { world, wallet } = await req.json().catch(() => ({}));
    const cfg = typeof world === "string" ? WORLD_TOKENS[world] : undefined;
    if (!cfg) return json(origin, { error: "Unknown world" }, 404);

    const thresholds = {
      FAN: intFromEnv(cfg.fanEnv, cfg.defaultFan),
      INSIDER: intFromEnv(cfg.insiderEnv, cfg.defaultInsider),
    };
    const tokenLive = tokenAddressFor(cfg) !== null;

    if (!isAddress(wallet)) {
      return json(origin, {
        rings: {
          ring0: true, ring1: false, ring2: false, council: false,
          balance: 0, thresholds, rank: null, tokenLive,
        },
      });
    }

    const balance = await getTokenBalance(cfg, wallet);
    // Council rank comes from the reputation service (Phase B). Until the
    // leaderboard is live nobody holds a seat.
    const rank: number | null = null;

    return json(origin, {
      rings: {
        ring0: true,
        ring1: balance >= thresholds.FAN,
        ring2: balance >= thresholds.INSIDER,
        council: rank !== null && rank <= 10,
        balance,
        thresholds,
        rank,
        tokenLive,
      },
    });
  } catch (err) {
    console.error("world-gate error:", err);
    return json(origin, { error: "Gate resolution failed" }, 500);
  }
});
