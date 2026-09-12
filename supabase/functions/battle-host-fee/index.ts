// battle-host-fee: charging for a battle, and paying the artists their share.
//
// HostFeeNotice has told hosts for weeks that hosting costs $1 in $WWAT and
// that "40% of it goes straight to the artists whose songs you picked". None of
// that was ever charged: no code path wrote a battle_host_fee, splitHostFee in
// battleMarket.ts had no callers anywhere, and every fee table was empty. This
// function is what makes the notice true.
//
// HOW THE MONEY MOVES, AND WHY IT MOVES THIS WAY
//
// The artists are paid DIRECTLY by the host's own wallet, one transfer each.
// SONGCHAINN never takes custody of an artist's share and never has to be
// trusted to pass it on later, which is the same principle the backing market
// already runs on. Only the pooled part (the winners' pot, the host's rebate
// and running costs) goes to the treasury, because those cannot be paid to
// anybody until the battle has a result.
//
// The browser never gets to say "it is paid". Every leg is read back off Base
// here before a single row is written, and battle_fee_shares has no insert
// policy at all, so only the service role can record one.
//
// Request:  POST { battleId, action: 'quote' | 'confirm', txHashes?: string[] }
// Response: quote   -> { due, exempt, reason?, usd, priceUsd?, token?, legs? }
//           confirm -> { ok: true, paid } | { error }

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

/**
 * What hosting costs, held as an exact fraction.
 *
 * A fraction rather than a number because the amount somebody is actually
 * charged should never pass through floating point, and because a rehearsal
 * needs to run the identical code path at a few cents without editing the
 * maths. The real terms are one dollar: 1n over 1n.
 */
const HOST_FEE_USD_NUM = 1n;
const HOST_FEE_USD_DEN = 1n;
/** For display and for the row we write down. */
const HOST_FEE_USD = Number(HOST_FEE_USD_NUM) / Number(HOST_FEE_USD_DEN);
/** $WWAT on Base. */
const WWAT = "0xefa920796416daf8dc8df7e5ceaeee45ae3350be";
const WWAT_DECIMALS = 18n;

/**
 * THE CEILING, AND WHY IT EXISTS.
 *
 * A price in dollars against a very cheap coin asks for an absurd number of
 * tokens. $WWAT's whole supply is one billion, and at the September 2026 price
 * one dollar came to about 8.8 million of them: nearly 1% of every token that
 * will ever exist, for one battle. Charging that would drain the float faster
 * than the battles could ever be worth.
 *
 * So the host pays the LESSER of the dollar price and this ceiling. While the
 * coin is cheap the ceiling binds and a battle costs a few cents. As $WWAT
 * appreciates the dollar price falls below the ceiling on its own and the real
 * dollar takes over, with no code change and no announcement. Keep this in
 * step with MAX_FEE_TOKENS in battle-voice.
 */
const MAX_FEE_TOKENS = 90_000n * 10n ** WWAT_DECIMALS;

/** The SONGCHAINN treasury, the same address src/lib/onchain.ts pays to. */
const TREASURY = "0x70d211c7ed27cfa73d6fddaf43736159f19ea118";

/**
 * Basis points, matching HOST_FEE_SPLIT_BPS in src/battlezone/lib/battleMarket.ts.
 * Keep the two in step: that file is the readable statement of the deal and
 * this one is the thing that enforces it.
 */
const BPS = 10_000n;
const ARTISTS_BPS = 4_000n;   // split evenly between the artists whose songs were used
const POOLED_BPS = 6_000n;    // winners' pot 40, host rebate 15, running costs 5

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

async function wwatAmountForUsd(): Promise<{ priceUsd: number; amountRaw: bigint; capped: boolean } | null> {
  try {
    const res = await fetch(`https://api-sdk.zora.engineering/coin?address=${WWAT}&chain=8453`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const raw = String(body?.zora20Token?.tokenPrice?.priceInUsdc ?? "");
    const f = fraction(raw);
    if (!f) return null;
    // tokens = usd / price = (NUM/DEN) / (num/den) = NUM*den / (DEN*num),
    // then scaled to the token's smallest unit and rounded up, so the host is
    // never a hair short of what the server will check for.
    const top = HOST_FEE_USD_NUM * f.den * 10n ** WWAT_DECIMALS;
    const bottom = HOST_FEE_USD_DEN * f.num;
    const atPrice = (top + bottom - 1n) / bottom;
    const amountRaw = atPrice > MAX_FEE_TOKENS ? MAX_FEE_TOKENS : atPrice;
    return { priceUsd: Number(raw), amountRaw, capped: atPrice > MAX_FEE_TOKENS };
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

interface Leg {
  kind: "artist" | "treasury";
  artistName: string | null;
  to: string;
  amountRaw: string;
  label: string;
}

/**
 * Who gets what, in the token's smallest unit.
 *
 * The remainder from integer division goes to the artists rather than being
 * dropped, so the legs always add back up to exactly what was quoted, matching
 * splitHostFee in battleMarket.ts.
 */
function buildLegs(total: bigint, artists: Array<{ name: string; wallet: string }>): Leg[] {
  const pooled = (total * POOLED_BPS) / BPS;
  const artistsTotal = total - pooled;
  const each = artistsTotal / BigInt(artists.length);
  // The first artist absorbs the rounding dust so nothing is stranded.
  const dust = artistsTotal - each * BigInt(artists.length);

  const legs: Leg[] = artists.map((a, i) => ({
    kind: "artist" as const,
    artistName: a.name,
    to: a.wallet.toLowerCase(),
    amountRaw: (each + (i === 0 ? dust : 0n)).toString(),
    label: `${a.name}, their share of the host fee`,
  }));

  legs.push({
    kind: "treasury",
    artistName: null,
    to: TREASURY,
    amountRaw: pooled.toString(),
    label: "The winners' pot, the host's rebate and running costs",
  });

  return legs;
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

  const body = (await req.json().catch(() => ({}))) as {
    battleId?: unknown;
    action?: unknown;
    txHashes?: unknown;
  };
  const battleId = String(body.battleId ?? "");
  const action = body.action === "confirm" ? "confirm" : "quote";
  if (!UUID.test(battleId)) return json(origin, { error: "Bad request." }, 400);

  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: battle } = await db
    .from("battles")
    .select("id, host_user_id, stage, status, artist_a_name, artist_b_name")
    .eq("id", battleId)
    .maybeSingle();
  if (!battle) return json(origin, { error: "That battle does not exist." }, 404);
  if (battle.host_user_id !== user.id) {
    return json(origin, { error: "Only this battle's host pays for it." }, 403);
  }

  // Already paid for. Saying so plainly beats charging twice.
  const { data: already } = await db
    .from("battle_host_fees").select("battle_id").eq("battle_id", battleId).maybeSingle();
  if (already) return json(origin, { due: false, exempt: false, paid: true, usd: HOST_FEE_USD, reason: "This battle is already paid for." });

  // The founder's testers host with nothing to pay.
  const { data: perk } = await db
    .from("battle_host_perks").select("free_host").eq("user_id", user.id).maybeSingle();
  const free = perk?.free_host === true;
  if (free) {
    return json(origin, { due: false, exempt: true, usd: HOST_FEE_USD, reason: "You host free while you are testing WaveWarz Africa." });
  }

  // The Open Mic takes no money at all. That is the whole point of it.
  if (battle.stage === "open_mic") {
    return json(origin, { due: false, exempt: true, usd: HOST_FEE_USD, reason: "The Open Mic costs points, not money." });
  }

  // Who the fee is owed to. A battle names its artists, and artist_wallets is
  // keyed by name, which is how the rest of the payout system addresses them.
  const names = [battle.artist_a_name, battle.artist_b_name]
    .map((n) => String(n ?? "").trim())
    .filter((n) => n && n !== "TBD");
  if (names.length < 2) {
    return json(origin, { due: false, exempt: false, usd: HOST_FEE_USD, reason: "Pick both artists before paying for the battle." });
  }

  const { data: walletRows } = await db
    .from("artist_wallets")
    .select("artist_name, wallet_address")
    .in("artist_id", names.map((n) => `name:${n}`));

  const byName = new Map<string, string>(
    ((walletRows ?? []) as Array<{ artist_name: string; wallet_address: string }>)
      .map((w) => [w.artist_name, w.wallet_address]),
  );
  const missing = names.filter((n) => !byName.get(n));
  if (missing.length) {
    // Never take money that cannot reach the artist it was promised to.
    return json(origin, {
      due: false,
      exempt: false,
      usd: HOST_FEE_USD,
      reason: `${missing.join(" and ")} has no payout wallet on file yet, so the artists' share could not reach them. Nothing is charged for this battle.`,
    });
  }
  const artists = names.map((n) => ({ name: n, wallet: byName.get(n)! }));

  const price = await wwatAmountForUsd();
  if (!price) {
    return json(origin, { error: "Could not read the $WWAT price just now. Try again in a minute." }, 503);
  }
  const legs = buildLegs(price.amountRaw, artists);

  /* ---------------------------------------------------------------- quote */
  if (action === "quote") {
    return json(origin, {
      due: true,
      exempt: false,
      usd: HOST_FEE_USD,
      priceUsd: price.priceUsd,
      capped: price.capped,
      token: WWAT,
      totalRaw: price.amountRaw.toString(),
      legs,
    });
  }

  /* -------------------------------------------------------------- confirm */
  const hashes = Array.isArray(body.txHashes)
    ? (body.txHashes as unknown[]).map((h) => String(h ?? "").toLowerCase()).filter((h) => /^0x[0-9a-f]{64}$/.test(h))
    : [];
  if (hashes.length !== legs.length) {
    return json(origin, { error: "Pay every part of the fee first." }, 400);
  }

  // Each leg, read back off Base. A leg is only accepted when a transfer of
  // this token, to this exact address, for at least this much, sits in a
  // successful transaction paid from a wallet on the host's own account.
  // WHOSE PAYMENT THIS IS, AND WHY THE PROFILE COLUMN IS NOT ASKED.
  //
  // This used to also trust audience_profiles.wallet_address. That column sits
  // on the person's own profile row, and audience_profiles carries four
  // overlapping "you may update your own row" policies with no restriction on
  // which columns. So anybody could set it to somebody else's address with one
  // ordinary update, then claim that person's payment: Base is public, so a
  // real host's fee transfer and its from address are visible to everyone the
  // moment they are mined. Only user_wallets counts now, which at least cannot
  // be written directly (it has no insert policy at all; add_my_wallet is the
  // only way in).
  //
  // That is a narrowing, not a proof. add_my_wallet still binds any address on
  // nothing but a format check, so a determined attacker can still register an
  // address they do not control. The real fix is proof of key control before an
  // address counts here, the way wallet-auth already does it with SIWE.
  const { data: wallets } = await db.from("user_wallets").select("address").eq("user_id", user.id);
  const mine = new Set<string>(
    ((wallets ?? []) as Array<{ address: string }>).map((w) => w.address.toLowerCase()),
  );

  type Log = { address: string; topics: string[]; data: string };
  const rows: Array<Record<string, unknown>> = [];
  let payer = "";

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const txHash = hashes[i];

    const { data: used } = await db
      .from("battle_fee_shares").select("battle_id").eq("tx_hash", txHash).maybeSingle();
    if (used) return json(origin, { error: "One of those payments has already been counted." }, 409);

    const receipt = await rpc<{ status: string; blockNumber: string; logs: Log[] }>(
      "eth_getTransactionReceipt", [txHash],
    );
    if (!receipt) {
      return json(origin, { error: "One of those payments has not confirmed on Base yet. Give it a minute and press it again. Do not pay twice." }, 409);
    }
    if (receipt.status !== "0x1") {
      return json(origin, { error: "One of those payments failed on Base. Nothing was taken for it." }, 400);
    }

    const toTopic = "0x" + leg.to.slice(2).padStart(64, "0");
    const transfer = receipt.logs.find(
      (l) => l.address?.toLowerCase() === WWAT
        && l.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC
        && l.topics?.[2]?.toLowerCase() === toTopic,
    );
    if (!transfer) {
      return json(origin, { error: `A payment for ${leg.label} did not reach the right address.` }, 400);
    }

    const paid = BigInt(transfer.data);
    const owed = BigInt(leg.amountRaw);
    if (paid * 100n < owed * PRICE_TOLERANCE_PCT) {
      return json(origin, { error: `The payment for ${leg.label} is short at today's $WWAT price.` }, 400);
    }

    const from = ("0x" + transfer.topics[1].slice(26)).toLowerCase();
    if (!mine.has(from)) {
      return json(origin, { error: "That payment came from a wallet that is not on your account. Add that wallet on your wallet page, then try again." }, 403);
    }
    if (payer && payer !== from) {
      return json(origin, { error: "The parts of the fee came from different wallets. Pay all of it from one." }, 400);
    }
    payer = from;

    const block = await rpc<{ timestamp: string }>("eth_getBlockByNumber", [receipt.blockNumber, false]);
    const paidAt = block ? Number(BigInt(block.timestamp)) : 0;
    if (!paidAt || Date.now() / 1000 - paidAt > MAX_PAYMENT_AGE_S) {
      return json(origin, { error: "One of those payments is more than a day old, so it cannot pay for a new battle." }, 400);
    }

    rows.push({
      battle_id: battleId,
      payee_kind: leg.kind,
      artist_name: leg.artistName,
      wallet_address: leg.to,
      amount_raw: paid.toString(),
      token_address: WWAT,
      tx_hash: txHash,
    });
  }

  const { error: sharesError } = await db.from("battle_fee_shares").insert(rows);
  if (sharesError) {
    console.error("battle-host-fee: could not record the shares", sharesError);
    return json(origin, { error: "The payments checked out but could not be recorded. Press it again; you will not be charged twice." }, 500);
  }

  // What was actually paid, not what a fresh quote says it would cost now.
  // The price moves between paying and confirming, so recomputing here wrote
  // down a total that never matched the transfers: the first rehearsal logged
  // 174,171.88 WWAT against 174,847.61 genuinely sent. The legs that were
  // verified on chain are the truth, so the row is their sum.
  const paidTotal = rows.reduce((sum, r) => sum + BigInt(String(r.amount_raw)), 0n);

  const { error: feeError } = await db.from("battle_host_fees").insert({
    battle_id: battleId,
    host_user_id: user.id,
    wallet_address: payer,
    amount_raw: paidTotal.toString(),
    token_address: WWAT,
    token_symbol: "WWAT",
    quoted_usd: HOST_FEE_USD,
    tx_hash: hashes[hashes.length - 1],
  });
  if (feeError) {
    console.error("battle-host-fee: could not record the fee", feeError);
    return json(origin, { error: "The payments checked out but could not be recorded. Press it again; you will not be charged twice." }, 500);
  }

  return json(origin, {
    ok: true,
    paid: rows.map((r) => ({
      to: r.wallet_address,
      artist: r.artist_name,
      amountRaw: r.amount_raw,
      txHash: r.tx_hash,
    })),
  });
});
