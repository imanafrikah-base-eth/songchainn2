// battle-trade-verify: putting somebody on the board, after Base says it happened.
//
// Backing a corner is an ordinary Zora purchase from the backer's own wallet.
// This app never touches the money and never holds the coin. All that is left
// afterwards is writing down that it happened, and that row is what makes
// somebody a backer, which the verdict is meant to weigh. So the browser does
// not get to write it.
//
// It used to. useBattleMarket inserted straight into battle_trades, which meant
// the amount and the hash were whatever the page said they were, and anybody
// could have posted a row with a made up hash and counted as a backer on either
// side. Then the insert policy was removed while this was built, so the insert
// began failing silently and the room congratulated people who were never
// counted at all. Both of those are fixed here: the chain is asked, and only
// the service role writes.
//
// What has to be true before a row is written:
//   1. The battle takes trades (Main Stage, not ended).
//   2. The song is genuinely on the side being backed.
//   3. The coin bought is genuinely that song's coin.
//   4. The transaction succeeded on Base and moved that coin to the payer.
//   5. The payer is a wallet on this account, so a stranger's public purchase
//      cannot be claimed as your own backing.
//   6. It is recent, and it has not already been counted.
//
// Request:  POST { battleId, side: 'a' | 'b', songId, coinAddress, txHash }
// Response: { ok: true, ethSpentWei } | { error }

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

const BASE_RPC = Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const TX_HASH = /^0x[0-9a-f]{64}$/;

/** A trade older than this cannot be brought to a battle as fresh backing. */
const MAX_TRADE_AGE_S = 24 * 60 * 60;

/* -------------------------------------------------------------- helpers --- */

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

/** The song ids listed on one side of a battle. */
function songIdsOn(list: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    const id = (item as { id?: unknown } | null)?.id;
    if (id !== undefined && id !== null && String(id).trim()) out.add(String(id).trim());
  }
  return out;
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
  if (!user) return json(origin, { error: "Sign in to back a corner." }, 401);

  const body = (await req.json().catch(() => ({}))) as {
    battleId?: unknown;
    side?: unknown;
    songId?: unknown;
    coinAddress?: unknown;
    txHash?: unknown;
  };
  const battleId = String(body.battleId ?? "");
  const side = body.side === "b" ? "b" : body.side === "a" ? "a" : "";
  const songId = String(body.songId ?? "").trim();
  const coinAddress = String(body.coinAddress ?? "").toLowerCase();
  const txHash = String(body.txHash ?? "").toLowerCase();

  if (!UUID.test(battleId) || !side || !songId || !ADDRESS.test(coinAddress) || !TX_HASH.test(txHash)) {
    return json(origin, { error: "Bad request." }, 400);
  }

  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  /* ------------------------------------------------- 1. the battle takes it */
  const { data: battle } = await db
    .from("battles")
    .select("id, stage, status, songs_a, songs_b")
    .eq("id", battleId)
    .maybeSingle();
  if (!battle) return json(origin, { error: "That battle does not exist." }, 404);
  if (battle.stage === "open_mic") {
    return json(origin, { error: "The Open Mic takes no money, so there is no trading ground there." }, 400);
  }
  if (battle.status === "ended") {
    return json(origin, { error: "This battle has ended, so the board is closed. You still own the coin." }, 409);
  }

  /* ------------------------------------------- 2. the song is on that side */
  const onSide = songIdsOn(side === "a" ? battle.songs_a : battle.songs_b);
  if (onSide.size > 0 && !onSide.has(songId)) {
    return json(origin, { error: "That song is not on the side you backed." }, 400);
  }

  /* ------------------------------------- 3. the coin belongs to that song */
  const { data: coinRow } = await db
    .from("song_coins")
    .select("zora_coin_address, mint_status")
    .eq("song_id", songId)
    .maybeSingle();
  const known = String(coinRow?.zora_coin_address ?? "").toLowerCase();
  if (!known || !ADDRESS.test(known)) {
    return json(origin, { error: "That song has no coin on file, so backing it cannot be counted." }, 400);
  }
  if (known !== coinAddress) {
    return json(origin, { error: "That purchase is not this song's coin." }, 400);
  }

  /* --------------------------------------------- 6a. not already counted */
  const { data: seen } = await db
    .from("battle_trades").select("battle_id").eq("tx_hash", txHash).maybeSingle();
  if (seen) return json(origin, { error: "That purchase is already on the board." }, 409);

  /* ------------------------------------------------ 4. Base says it happened */
  type Log = { address: string; topics: string[]; data: string };
  const receipt = await rpc<{ status: string; blockNumber: string; logs: Log[] }>(
    "eth_getTransactionReceipt", [txHash],
  );
  if (!receipt) {
    return json(origin, { error: "That purchase has not confirmed on Base yet. Give it a minute and back again; it will only ever count once." }, 409);
  }
  if (receipt.status !== "0x1") {
    return json(origin, { error: "That purchase failed on Base, so nothing was spent." }, 400);
  }

  const tx = await rpc<{ from: string; value: string }>("eth_getTransactionByHash", [txHash]);
  if (!tx) return json(origin, { error: "Could not read that transaction from Base. Try again in a moment." }, 503);

  const payer = String(tx.from ?? "").toLowerCase();
  if (!ADDRESS.test(payer)) return json(origin, { error: "Could not read who paid for that purchase." }, 400);

  // The coin has to have actually reached the payer. A successful transaction
  // that never moved this coin to them is not a backing, whatever else it did.
  const toTopic = "0x" + payer.slice(2).padStart(64, "0");
  const landed = receipt.logs?.some(
    (l) => l.address?.toLowerCase() === coinAddress
      && l.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC
      && l.topics?.[2]?.toLowerCase() === toTopic,
  );
  if (!landed) {
    return json(origin, { error: "That transaction did not put this song's coin in your wallet." }, 400);
  }

  // What was actually spent, taken from the transaction rather than from what
  // the page said. The old client parsed its own decimal string and fell back
  // to "0" when that threw, which the eth_spent_wei > 0 check would reject.
  let spentWei: bigint;
  try {
    spentWei = BigInt(tx.value ?? "0x0");
  } catch {
    spentWei = 0n;
  }
  if (spentWei <= 0n) {
    return json(origin, { error: "That purchase did not spend any ETH, so there is nothing to put on the board." }, 400);
  }

  /* ------------------------------------- 5. paid from a wallet on this account */
  // Base is public: a real backer's purchase and its from address are visible
  // to everyone the moment it is mined. Without this, anybody could take a
  // stranger's purchase and count themselves as a backer with it.
  //
  // Same caveat as the fee functions: add_my_wallet binds an address on nothing
  // but a format check, so this is a narrowing rather than proof. The real fix
  // is proof of key control, the way wallet-auth already does it with SIWE.
  const { data: wallets } = await db.from("user_wallets").select("address").eq("user_id", user.id);
  const mine = new Set<string>(
    ((wallets ?? []) as Array<{ address: string }>).map((w) => String(w.address).toLowerCase()),
  );
  if (!mine.has(payer)) {
    return json(origin, { error: "That purchase came from a wallet that is not on your account. Add that wallet on your wallet page, then back again." }, 403);
  }

  /* --------------------------------------------------------- 6b. recent */
  const block = await rpc<{ timestamp: string }>("eth_getBlockByNumber", [receipt.blockNumber, false]);
  const boughtAt = block ? Number(BigInt(block.timestamp)) : 0;
  if (!boughtAt || Date.now() / 1000 - boughtAt > MAX_TRADE_AGE_S) {
    return json(origin, { error: "That purchase is more than a day old, so it cannot be counted as backing in this battle." }, 400);
  }

  /* ------------------------------------------------------------- the row */
  const { error: insertError } = await db.from("battle_trades").insert({
    battle_id: battleId,
    user_id: user.id,
    wallet_address: payer,
    side,
    song_id: songId,
    coin_address: coinAddress,
    eth_spent_wei: spentWei.toString(),
    tx_hash: txHash,
  });

  if (insertError) {
    // A race on the unique tx_hash means somebody already counted it, which is
    // the outcome we wanted anyway, so it is not an error to the person.
    if (String(insertError.code) === "23505") {
      return json(origin, { ok: true, ethSpentWei: spentWei.toString(), alreadyCounted: true });
    }
    console.error("battle-trade-verify: could not record the trade", insertError);
    return json(origin, { error: "The purchase checked out but the board did not save it. Back again in a moment; it will only ever count once." }, 500);
  }

  return json(origin, { ok: true, ethSpentWei: spentWei.toString() });
});
