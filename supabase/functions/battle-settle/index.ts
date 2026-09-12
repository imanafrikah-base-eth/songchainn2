// battle-settle: working out who the winners' pot owes, and writing it down.
//
// HostFeeNotice has told every host, since the fee went live, that "the rest
// goes to the pot the winning side's backers share when the battle ends".
// Nothing ever shared it. splitWinnersPool in battleMarket.ts has had zero
// callers for its whole life and the pooled part has simply sat in the
// treasury. This is the thing that keeps that promise.
//
// IT DOES NOT MOVE MONEY, AND THAT IS DELIBERATE.
//
// Computing what is owed and sending it are different acts with different
// risks. The arithmetic is reversible and can be read by eye; a transfer is
// neither. So this records every payout at 'owed' and stops. If the maths is
// ever wrong it is wrong in a row somebody can correct, not in a transfer
// nobody can take back. Sending is a separate, deliberate step.
//
// Request:  POST { battleId }
// Response: { ok, settled, winnerSide, poolRaw, backerCount, payouts[] } | { error }

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

/** Basis points. Kept in step with HOST_FEE_SPLIT_BPS in battleMarket.ts. */
const BPS = 10_000n;
const WINNERS_BPS = 4_000n;
const HOST_REBATE_BPS = 1_500n;
const TREASURY_BPS = 500n;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Stake {
  userId: string;
  walletAddress: string;
  spentWei: bigint;
}

interface Payout {
  userId: string;
  walletAddress: string;
  amountRaw: bigint;
}

/**
 * Share the pot among the winning side's backers, in proportion to what each
 * put behind it. Mirrors splitWinnersPool in battleMarket.ts exactly.
 *
 * Every share is FLOORED and the remainder stays behind. A distribution can
 * never be asked to pay out money that was never collected, and nobody gets a
 * few extra units for happening to be first in the list.
 */
function splitWinnersPool(poolRaw: bigint, backers: Stake[]): Payout[] {
  if (poolRaw <= 0n) return [];
  const paying = backers.filter((b) => b.spentWei > 0n);
  const totalStake = paying.reduce((sum, b) => sum + b.spentWei, 0n);
  if (totalStake === 0n) return [];
  return paying
    .map((b) => ({
      userId: b.userId,
      walletAddress: b.walletAddress,
      amountRaw: (poolRaw * b.spentWei) / totalStake,
    }))
    .filter((p) => p.amountRaw > 0n);
}

/** The last check before anything is written. Returns why it is unsafe, or null. */
function whyUnsafe(poolRaw: bigint, payouts: Payout[]): string | null {
  if (payouts.some((p) => p.amountRaw < 0n)) return "A payout is negative.";
  const total = payouts.reduce((sum, p) => sum + p.amountRaw, 0n);
  if (total > poolRaw) return `Payouts total ${total} but the pot only holds ${poolRaw}.`;
  const wallets = payouts.map((p) => p.walletAddress.toLowerCase());
  if (new Set(wallets).size !== wallets.length) return "The same wallet appears more than once.";
  return null;
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
  if (!user) return json(origin, { error: "Sign in first." }, 401);

  const body = (await req.json().catch(() => ({}))) as { battleId?: unknown };
  const battleId = String(body.battleId ?? "");
  if (!UUID.test(battleId)) return json(origin, { error: "Bad request." }, 400);

  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: battle } = await db
    .from("battles")
    .select("id, host_user_id, status, winner")
    .eq("id", battleId)
    .maybeSingle();
  if (!battle) return json(origin, { error: "That battle does not exist." }, 404);

  // The host settles their own battle; an admin can settle anybody's. Everyone
  // else gets nothing, because settling writes rows that say who is owed money.
  const { data: admin } = await db.rpc("is_admin", { uid: user.id });
  if (battle.host_user_id !== user.id && admin !== true) {
    return json(origin, { error: "Only this battle's host can settle it." }, 403);
  }

  // Already done. Saying so plainly beats writing a second set of payouts.
  const { data: existing } = await db
    .from("battle_settlements").select("*").eq("battle_id", battleId).maybeSingle();
  if (existing) {
    const { data: rows } = await db
      .from("battle_winner_payouts")
      .select("user_id, wallet_address, amount_raw, status, tx_hash")
      .eq("battle_id", battleId);
    return json(origin, { ok: true, settled: false, alreadySettled: true, settlement: existing, payouts: rows ?? [] });
  }

  if (battle.status !== "ended") {
    return json(origin, { error: "This battle has not ended yet, so there is nothing to share out." }, 409);
  }

  // battles.winner is 'A'/'B'; battle_trades.side is 'a'/'b'. Folding the case
  // is not cosmetic: comparing them raw matches no rows at all and looks
  // exactly like a battle nobody backed.
  const winnerSide = String(battle.winner ?? "").trim().toLowerCase();
  if (winnerSide !== "a" && winnerSide !== "b") {
    return json(origin, { error: "This battle has no declared winner, so the pot cannot be shared out yet." }, 409);
  }

  // No fee paid means no pot. An Open Mic or a perked host never put anything
  // in, and inventing a pot out of nothing would be worse than paying nobody.
  const { data: fee } = await db
    .from("battle_host_fees")
    .select("amount_raw, token_address")
    .eq("battle_id", battleId)
    .maybeSingle();
  if (!fee) {
    return json(origin, { error: "No host fee was paid for this battle, so there is no pot to share." }, 409);
  }

  const feeTotal = BigInt(String(fee.amount_raw).split(".")[0]);
  const winnersPool = (feeTotal * WINNERS_BPS) / BPS;
  const hostRebate = (feeTotal * HOST_REBATE_BPS) / BPS;
  const treasuryKeep = (feeTotal * TREASURY_BPS) / BPS;

  // Who backed the winning side, and how much each of them put behind it.
  // Summed per person, not per trade: somebody who backed three times is one
  // backer with a bigger stake, not three winners.
  const { data: trades } = await db
    .from("battle_trades")
    .select("user_id, wallet_address, eth_spent_wei, created_at")
    .eq("battle_id", battleId)
    .eq("side", winnerSide)
    .order("created_at", { ascending: true });

  const byUser = new Map<string, Stake>();
  for (const t of (trades ?? []) as Array<{ user_id: string | null; wallet_address: string; eth_spent_wei: string }>) {
    if (!t.user_id) continue;
    const spent = BigInt(String(t.eth_spent_wei).split(".")[0]);
    const held = byUser.get(t.user_id);
    if (held) {
      held.spentWei += spent;
    } else {
      // The wallet they first backed from is the one they are paid at.
      byUser.set(t.user_id, { userId: t.user_id, walletAddress: String(t.wallet_address).toLowerCase(), spentWei: spent });
    }
  }

  const backers = [...byUser.values()];
  const payouts = splitWinnersPool(winnersPool, backers);

  const unsafe = whyUnsafe(winnersPool, payouts);
  if (unsafe) {
    console.error("battle-settle: refusing to settle", battleId, unsafe);
    return json(origin, { error: "The pot did not add up, so nothing was written down. This has been logged." }, 500);
  }

  const distributed = payouts.reduce((sum, p) => sum + p.amountRaw, 0n);
  const token = String(fee.token_address ?? "");

  // The settlement row goes in FIRST. Its primary key is the battle, so two
  // callers racing to settle the same battle cannot both get past this line.
  const { error: settleError } = await db.from("battle_settlements").insert({
    battle_id: battleId,
    winner_side: winnerSide,
    token_address: token,
    fee_total_raw: feeTotal.toString(),
    winners_pool_raw: winnersPool.toString(),
    host_rebate_raw: hostRebate.toString(),
    treasury_keep_raw: treasuryKeep.toString(),
    backer_count: backers.length,
    distributed_raw: distributed.toString(),
    dust_raw: (winnersPool - distributed).toString(),
  });
  if (settleError) {
    if (String(settleError.code) === "23505") {
      return json(origin, { ok: true, settled: false, alreadySettled: true });
    }
    console.error("battle-settle: could not record the settlement", settleError);
    return json(origin, { error: "The pot could not be settled just now. Try again in a moment." }, 500);
  }

  if (payouts.length > 0) {
    const { error: payoutError } = await db.from("battle_winner_payouts").insert(
      payouts.map((p) => ({
        battle_id: battleId,
        user_id: p.userId,
        wallet_address: p.walletAddress,
        amount_raw: p.amountRaw.toString(),
        token_address: token,
        status: "owed",
      })),
    );
    if (payoutError) {
      console.error("battle-settle: settlement recorded but payouts did not", payoutError);
      return json(origin, { error: "The pot was worked out but the payouts did not save. This has been logged." }, 500);
    }
  }

  return json(origin, {
    ok: true,
    settled: true,
    winnerSide,
    poolRaw: winnersPool.toString(),
    distributedRaw: distributed.toString(),
    dustRaw: (winnersPool - distributed).toString(),
    backerCount: backers.length,
    payouts: payouts.map((p) => ({ userId: p.userId, wallet: p.walletAddress, amountRaw: p.amountRaw.toString() })),
  });
});
