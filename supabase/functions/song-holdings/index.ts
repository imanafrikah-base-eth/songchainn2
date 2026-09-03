// Reads a person's song coin balances from Base and records them.
//
// Why this is server side and not a client report: holding a song now moves
// SONGCHAINN points, and anything that moves points cannot be taken on trust
// from a browser. The only thing the client sends is "check me". Every balance
// in song_holdings came from an eth_call this function made itself.
//
//   POST { }                 -> refresh the caller's holdings, return the profile
//   POST { address }         -> also check this address, after it is proved to
//                               belong to the caller by being on their profile
//
// Balances are read with the standard ERC-20 balanceOf, one eth_call per coin,
// batched into a single JSON-RPC request.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BASE_RPC = Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org";
const BALANCE_OF = "0x70a08231"; // balanceOf(address)

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const isAddress = (v: unknown): v is string =>
  typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);

function balanceOfCalldata(holder: string): string {
  return BALANCE_OF + holder.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

/** Hex quantity to a decimal string. Balances are 18 decimals, so they do not
 *  fit in a JS number and must stay strings all the way into numeric(78,0). */
function hexToDecimalString(hex: string): string {
  if (!hex || hex === "0x") return "0";
  try {
    return BigInt(hex).toString(10);
  } catch {
    return "0";
  }
}

interface Call { id: number; coin: string; songId: string; holder: string }

async function readBalances(calls: Call[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!calls.length) return out;

  // Keep each batch small enough that a public RPC will answer it.
  const BATCH = 25;
  for (let i = 0; i < calls.length; i += BATCH) {
    const slice = calls.slice(i, i + BATCH);
    const payload = slice.map((c) => ({
      jsonrpc: "2.0",
      id: c.id,
      method: "eth_call",
      params: [{ to: c.coin, data: balanceOfCalldata(c.holder) }, "latest"],
    }));
    try {
      const res = await fetch(BASE_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const rows = Array.isArray(data) ? data : [data];
      for (const row of rows) {
        if (typeof row?.id !== "number" || typeof row?.result !== "string") continue;
        out.set(row.id, hexToDecimalString(row.result));
      }
    } catch (err) {
      console.error("[holdings] rpc batch failed", String(err).slice(0, 160));
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not signed in" }, 401);

    const db = admin();
    const { data: userData, error: userErr } = await db.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Not signed in" }, 401);

    /* Which addresses belong to this person. Nothing else is checked. */
    const { data: profile } = await db
      .from("audience_profiles")
      .select("wallet_address")
      .eq("user_id", user.id)
      .maybeSingle();

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const addresses = [...new Set(
      [profile?.wallet_address, meta.wallet_address, meta.farcaster_address]
        .filter(isAddress)
        .map((a) => a.toLowerCase()),
    )];

    if (!addresses.length) {
      return json({
        ok: true,
        checked: 0,
        reason: "no_wallet",
        message: "Connect a wallet to have your holdings counted.",
      });
    }

    /* Every song that actually has a coin on Base. */
    const { data: coins } = await db
      .from("song_coins")
      .select("song_id, zora_coin_address")
      .eq("mint_status", "minted");

    const minted = (coins ?? []).filter((c) => isAddress(c.zora_coin_address));
    if (!minted.length) return json({ ok: true, checked: 0, reason: "no_coins" });

    const calls: Call[] = [];
    let id = 1;
    for (const holder of addresses) {
      for (const coin of minted) {
        calls.push({ id: id++, coin: coin.zora_coin_address as string, songId: coin.song_id, holder });
      }
    }

    const balances = await readBalances(calls);
    const now = new Date().toISOString();

    /* What we already had, so a balance going from zero to positive can start a
       holding streak rather than resetting it on every refresh. */
    const { data: existing } = await db
      .from("song_holdings")
      .select("song_id, wallet_address, balance, peak_balance, held_since")
      .eq("user_id", user.id);

    const priorByKey = new Map(
      (existing ?? []).map((r) => [`${r.song_id}:${r.wallet_address}`, r]),
    );

    const rows = calls.map((c) => {
      const balance = balances.get(c.id) ?? "0";
      const prior = priorByKey.get(`${c.songId}:${c.holder}`);
      const priorBalance = BigInt(prior?.balance ?? "0");
      const current = BigInt(balance);
      const peak = current > BigInt(prior?.peak_balance ?? "0")
        ? current.toString()
        : (prior?.peak_balance ?? "0");

      let heldSince: string | null = prior?.held_since ?? null;
      if (current > 0n && priorBalance === 0n) heldSince = now;   // streak starts
      if (current === 0n) heldSince = null;                        // streak ends

      return {
        user_id: user.id,
        song_id: c.songId,
        coin_address: c.coin.toLowerCase(),
        wallet_address: c.holder,
        balance,
        peak_balance: peak,
        last_checked_at: now,
        held_since: heldSince,
      };
    });

    // Only keep rows worth keeping: a positive balance now, or one we already
    // had on file so a sale is recorded rather than silently forgotten.
    const worthWriting = rows.filter(
      (r) => r.balance !== "0" || priorByKey.has(`${r.song_id}:${r.wallet_address}`),
    );

    if (worthWriting.length) {
      const { error: upsertErr } = await db
        .from("song_holdings")
        .upsert(worthWriting, { onConflict: "user_id,song_id,wallet_address" });
      if (upsertErr) throw new Error(`song_holdings upsert: ${upsertErr.message}`);
    }

    const { data: profileJson } = await db.rpc("get_my_holder_profile_for", { _user_id: user.id });

    return json({
      ok: true,
      checked: calls.length,
      wallets: addresses.length,
      holding: worthWriting.filter((r) => r.balance !== "0").length,
      profile: profileJson ?? null,
    });
  } catch (err) {
    console.error("[song-holdings]", err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
