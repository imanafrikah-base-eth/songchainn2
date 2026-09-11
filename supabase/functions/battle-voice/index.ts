// battle-voice: turning on in-app voice for a WaveWarz battle.
//
// Voice comes back one battle at a time. The host asks for a quote, pays from
// their own wallet straight to the WaveWarz treasury, and this function reads
// that payment back off Base before it switches voice on. The browser never
// gets to say "it is paid": battles.voice_enabled can only be changed by the
// service role (the guard_battle_voice trigger refuses everyone else).
//
//   Main Stage  $3 in $WWAT, at the live price Zora reports.
//   Open Mic    takes no money at all, so voice there is only for the hosts
//               the founder named.
//   Free hosts  IMan Afrikah and N3M3SIS, the two main testers.
//
// Request:  POST { battleId, action: 'quote' | 'enable', txHash? }
// Response: quote  -> { available, reason?, exempt, usd, priceUsd?, amountRaw?, amountDisplay?, token?, recipient? }
//           enable -> { ok: true } | { error }

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

/* ------------------------------------------------------------ the terms --- */

const VOICE_FEE_USD = 3;
/** $WWAT on Base. Public the moment it exists; the same address the app ships with. */
const WWAT = "0xefa920796416daf8dc8df7e5ceaeee45ae3350be";
const WWAT_DECIMALS = 18n;
/** The SONGCHAINN treasury, the same address src/lib/onchain.ts pays to. */
const TREASURY = "0x70d211c7ed27cfa73d6fddaf43736159f19ea118";
/** IMan Afrikah and N3M3SIS: they host voice battles free. */
const FREE_HOSTS = new Set([
  "0482bf5e-4b37-4367-a433-e213ef3cc50c",
  "1138c5e6-763e-4bf1-b02c-43f42acc67fd",
]);
/** A payment older than this cannot be brought to a new battle. */
const MAX_PAYMENT_AGE_S = 24 * 60 * 60;
/** The price moves between paying and checking; this much short is still accepted. */
const PRICE_TOLERANCE_PCT = 80n;

const BASE_RPC = Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------- helpers --- */

/** A decimal string as an exact fraction, so a price with 40 decimals loses nothing. */
function fraction(decimal: string): { num: bigint; den: bigint } | null {
  const m = /^(\d*)(?:\.(\d+))?$/.exec(decimal.trim());
  if (!m) return null;
  const whole = m[1] || "0";
  const frac = m[2] || "";
  const num = BigInt(whole + frac);
  if (num === 0n) return null;
  return { num, den: 10n ** BigInt(frac.length) };
}

async function wwatPrice(): Promise<{ priceUsd: number; amountRaw: bigint } | null> {
  try {
    const res = await fetch(`https://api-sdk.zora.engineering/coin?address=${WWAT}&chain=8453`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const raw = String(body?.zora20Token?.tokenPrice?.priceInUsdc ?? "");
    const f = fraction(raw);
    if (!f) return null;
    // tokens = usd / price = usd * den / num; raw = tokens * 10^decimals, rounded up.
    const top = BigInt(VOICE_FEE_USD) * f.den * 10n ** WWAT_DECIMALS;
    const amountRaw = (top + f.num - 1n) / f.num;
    return { priceUsd: Number(raw), amountRaw };
  } catch {
    return null;
  }
}

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json();
    return (body?.result ?? null) as T | null;
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------- main --- */

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
  if (!user) return json(origin, { error: "Sign in to host." }, 401);

  const body = (await req.json().catch(() => ({}))) as { battleId?: unknown; action?: unknown; txHash?: unknown };
  const battleId = String(body.battleId ?? "");
  const action = body.action === "enable" ? "enable" : "quote";
  if (!UUID.test(battleId)) return json(origin, { error: "Bad request." }, 400);

  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: battle } = await db
    .from("battles")
    .select("id, host_user_id, stage, status, voice_enabled")
    .eq("id", battleId)
    .maybeSingle();
  if (!battle) return json(origin, { error: "That battle does not exist." }, 404);
  if (battle.host_user_id !== user.id) return json(origin, { error: "Only this battle's host can turn voice on." }, 403);
  if (battle.status === "ended") return json(origin, { error: "This battle has ended." }, 409);

  const free = FREE_HOSTS.has(user.id);
  const openMic = battle.stage === "open_mic";

  if (openMic && !free) {
    return json(origin, {
      available: false,
      exempt: false,
      usd: VOICE_FEE_USD,
      reason: "The Open Mic takes no money, so in-app voice is for Main Stage battles. The X Space link still carries the sound here.",
    });
  }

  /* ---------------------------------------------------------------- quote */
  if (action === "quote") {
    if (battle.voice_enabled) return json(origin, { available: false, exempt: free, usd: VOICE_FEE_USD, reason: "Voice is already on for this battle." });
    if (free) return json(origin, { available: true, exempt: true, usd: VOICE_FEE_USD });
    const price = await wwatPrice();
    if (!price) return json(origin, { error: "Could not read the $WWAT price just now. Try again in a minute." }, 503);
    const tokens = Number(price.amountRaw / 10n ** WWAT_DECIMALS) + 1;
    return json(origin, {
      available: true,
      exempt: false,
      usd: VOICE_FEE_USD,
      priceUsd: price.priceUsd,
      amountRaw: price.amountRaw.toString(),
      amountDisplay: tokens.toLocaleString("en-US"),
      token: WWAT,
      recipient: TREASURY,
    });
  }

  /* --------------------------------------------------------------- enable */
  if (battle.voice_enabled) return json(origin, { ok: true });

  const switchOn = async () => {
    const { error } = await db
      .from("battles")
      .update({ voice_enabled: true, voice_enabled_at: new Date().toISOString() })
      .eq("id", battleId);
    return !error;
  };

  if (free) {
    await db.from("battle_voice_fees").upsert(
      { battle_id: battleId, host_user_id: user.id, exempt: true, quoted_usd: 0 },
      { onConflict: "battle_id", ignoreDuplicates: true },
    );
    return (await switchOn()) ? json(origin, { ok: true }) : json(origin, { error: "Voice could not be switched on. Try again." }, 500);
  }

  const txHash = String(body.txHash ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) return json(origin, { error: "Pay the voice fee first." }, 400);

  const { data: used } = await db.from("battle_voice_fees").select("battle_id").eq("tx_hash", txHash).maybeSingle();
  if (used) return json(origin, { error: "That payment has already turned voice on for a battle." }, 409);

  type Log = { address: string; topics: string[]; data: string };
  const receipt = await rpc<{ status: string; blockNumber: string; logs: Log[] }>("eth_getTransactionReceipt", [txHash]);
  if (!receipt) return json(origin, { error: "That payment has not confirmed on Base yet. Give it a minute and press Turn on voice again. Do not pay twice." }, 409);
  if (receipt.status !== "0x1") return json(origin, { error: "That payment failed on Base, so nothing was paid. Try again." }, 400);

  const recipientTopic = "0x" + TREASURY.slice(2).padStart(64, "0");
  const transfer = receipt.logs.find(
    (l) => l.address?.toLowerCase() === WWAT && l.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC && l.topics?.[2]?.toLowerCase() === recipientTopic,
  );
  if (!transfer) return json(origin, { error: "That transaction is not a $WWAT payment to the WaveWarz Africa treasury." }, 400);

  const payer = ("0x" + transfer.topics[1].slice(26)).toLowerCase();
  const paid = BigInt(transfer.data);

  // The payment has to come from a wallet on the host's own account, so
  // somebody else's payment cannot be brought to this battle.
  const [{ data: wallets }, { data: profile }] = await Promise.all([
    db.from("user_wallets").select("address").eq("user_id", user.id),
    db.from("audience_profiles").select("wallet_address").eq("user_id", user.id).maybeSingle(),
  ]);
  const mine = new Set<string>([
    ...((wallets ?? []) as Array<{ address: string }>).map((w) => w.address.toLowerCase()),
    ...(profile?.wallet_address ? [String(profile.wallet_address).toLowerCase()] : []),
  ]);
  if (!mine.has(payer)) {
    return json(origin, { error: "That payment came from a wallet that is not on your account. Add that wallet on your wallet page, then try again." }, 403);
  }

  const block = await rpc<{ timestamp: string }>("eth_getBlockByNumber", [receipt.blockNumber, false]);
  const paidAt = block ? Number(BigInt(block.timestamp)) : 0;
  if (!paidAt || Date.now() / 1000 - paidAt > MAX_PAYMENT_AGE_S) {
    return json(origin, { error: "That payment is more than a day old, so it cannot turn voice on for a new battle." }, 400);
  }

  const price = await wwatPrice();
  if (!price) return json(origin, { error: "Could not read the $WWAT price to check the payment. Try again in a minute. Do not pay twice." }, 503);
  if (paid * 100n < price.amountRaw * PRICE_TOLERANCE_PCT) {
    return json(origin, { error: "That payment is short of the $3 voice fee at today's $WWAT price." }, 400);
  }

  const { error: feeError } = await db.from("battle_voice_fees").insert({
    battle_id: battleId,
    host_user_id: user.id,
    exempt: false,
    tx_hash: txHash,
    payer_address: payer,
    amount_raw: paid.toString(),
    token_address: WWAT,
    quoted_usd: VOICE_FEE_USD,
    price_usd: price.priceUsd,
  });
  if (feeError) {
    console.error("battle-voice: could not record the fee", feeError);
    return json(origin, { error: "The payment checked out but could not be recorded. Press Turn on voice again; you will not be charged twice." }, 500);
  }

  return (await switchOn())
    ? json(origin, { ok: true })
    : json(origin, { error: "The payment is recorded but voice did not switch on. Press Turn on voice again; you will not be charged twice." }, 500);
});
