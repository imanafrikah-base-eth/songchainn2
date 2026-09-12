// payment-receipt: a purchase made in the browser, heard by both sides.
//
// WHY THIS EXISTS. World keys, $WWAT, song coins and drops are bought straight
// from the person's wallet on Base, and nothing about them is written to the
// database. The money tables that DO get written server side have triggers that
// tell the payer and the payee. These buys had nothing, so the artist never
// heard that a fan had paid them.
//
// WHY THE BROWSER CANNOT SIMPLY SAY SO. song_purchases is written by the client
// without any check, which is exactly why it has no trigger: a row there would
// let anyone forge "you got paid". This function takes only a transaction hash
// and reads everything else off Base itself: that it succeeded, that it is
// recent, who paid, and who received what.
//
// WHO GETS TOLD.
//   The payer, always. It is their own bell.
//   The payees, ONLY when the payment came from a wallet the caller has PROVED
//   (user_wallets.verified_at, set by wallet-link). Base is public, so without
//   that anyone could post a stranger's transaction and make an artist believe
//   a friend of theirs had paid.
//   Payees are only told about tokens whose decimals and symbol we know. A
//   token anyone can deploy can call itself USDC.
//
// Request:  POST { txHash, kind, contextId? }
// Response: { ok, verified, payees } | { ok, alreadyReported } | { error }

import { createClient } from "npm:@supabase/supabase-js@2";
import { createPublicClient, erc20Abi, formatUnits, http, keccak256, toHex } from "npm:viem";
import { base } from "npm:viem/chains";

const publicClient = createPublicClient({
  chain: base,
  transport: http(Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org"),
});

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

const TX_HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const CONTEXT = /^[A-Za-z0-9_-]{1,120}$/;
const KINDS = new Set(["world_key", "wwat", "coin_buy", "song_copy", "song_sell", "drop_collect"]);
const MAX_AGE_S = 24 * 60 * 60;
const MAX_PAYEES = 10;

const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)")).toLowerCase();
/** ERC-4337: a smart wallet's transaction is sent by a bundler; the wallet is the sender here. */
const USER_OP_TOPIC = keccak256(
  toHex("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)"),
).toLowerCase();

/** Tokens whose symbol and decimals are fixed facts, not whatever a contract claims. */
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0xefa920796416daf8dc8df7e5ceaeee45ae3350be": { symbol: "$WWAT", decimals: 18 },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
  "0x833589fcd6edb6e08f4c7c32d65f71ee54a5a0ba": { symbol: "USDC", decimals: 6 },
  "0x1111111111166b7fe7bd91427724b487980afc69": { symbol: "ZORA", decimals: 18 },
};

function topicAddress(t?: string | null): string | null {
  if (!t || t.length !== 66) return null;
  const a = ("0x" + t.slice(26)).toLowerCase();
  return ADDRESS.test(a) ? a : null;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 800));
    return await fn();
  }
}

function formatAmount(raw: bigint, decimals: number, symbol: string): string {
  const n = Number(formatUnits(raw, decimals));
  if (!Number.isFinite(n) || n <= 0) return symbol;
  let s: string;
  if (n >= 1000) s = Math.round(n).toLocaleString("en-US");
  else if (n >= 1) s = n.toFixed(2).replace(/\.?0+$/, "");
  else {
    const r = Number(n.toFixed(6));
    if (r === 0) return `less than 0.000001 ${symbol}`;
    s = r.toFixed(6).replace(/\.?0+$/, "");
  }
  return `${s} ${symbol}`;
}

/** Only for the payer's own label. Cleaned hard, because a contract picks its own name. */
async function chainTokenInfo(addr: string): Promise<{ symbol: string; decimals: number } | null> {
  const known = KNOWN_TOKENS[addr];
  if (known) return known;
  try {
    const [symbol, decimals] = await Promise.all([
      publicClient.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: "symbol" }),
      publicClient.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: "decimals" }),
    ]);
    const clean = String(symbol).replace(/[^A-Za-z0-9$._-]/g, "").slice(0, 16);
    const d = Number(decimals);
    if (!clean || !Number.isInteger(d) || d < 0 || d > 36) return null;
    return { symbol: clean, decimals: d };
  } catch {
    return null;
  }
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

  const body = (await req.json().catch(() => ({}))) as { txHash?: unknown; kind?: unknown; contextId?: unknown };
  const txHash = String(body.txHash ?? "").trim().toLowerCase();
  if (!TX_HASH.test(txHash)) return json(origin, { error: "That does not look like a transaction." }, 400);
  const kind = String(body.kind ?? "");
  if (!KINDS.has(kind)) return json(origin, { error: "Unknown kind of payment." }, 400);
  const rawContext = body.contextId == null ? "" : String(body.contextId).trim();
  const contextId = rawContext && CONTEXT.test(rawContext) ? rawContext : null;

  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Already heard, by anybody with a proved wallet. Once is enough.
  const { data: seen } = await db.from("payment_receipts").select("tx_hash").eq("tx_hash", txHash).maybeSingle();
  if (seen) return json(origin, { ok: true, alreadyReported: true });

  /* ------------------------------------------------ Base says it happened */
  const hash = txHash as `0x${string}`;
  let receipt;
  try {
    receipt = await withRetry(() => publicClient.getTransactionReceipt({ hash }));
  } catch {
    return json(origin, { error: "That transaction has not confirmed on Base yet." }, 409);
  }
  if (receipt.status !== "success") return json(origin, { error: "That transaction failed on Base." }, 400);

  let tx;
  let block;
  try {
    tx = await withRetry(() => publicClient.getTransaction({ hash }));
    block = await withRetry(() => publicClient.getBlock({ blockNumber: receipt.blockNumber }));
  } catch {
    return json(origin, { error: "Could not read that transaction from Base. Try again in a moment." }, 503);
  }
  if (Date.now() / 1000 - Number(block.timestamp) > MAX_AGE_S) {
    return json(origin, { error: "That transaction is more than a day old." }, 400);
  }

  /* ----------------------------------------------------------- who paid */
  const txFrom = String(tx.from).toLowerCase();
  const candidates = new Set<string>([txFrom]);
  for (const l of receipt.logs) {
    const t0 = String(l.topics[0] ?? "").toLowerCase();
    if (t0 === USER_OP_TOPIC) {
      const sender = topicAddress(l.topics[2]);
      if (sender) candidates.add(sender);
    } else if (t0 === TRANSFER_TOPIC && l.topics.length === 3) {
      const from = topicAddress(l.topics[1]);
      if (from) candidates.add(from);
    }
  }

  const { data: walletRows } = await db
    .from("user_wallets")
    .select("address, verified_at")
    .eq("user_id", user.id);
  const rows = (walletRows ?? []) as Array<{ address: string; verified_at: string | null }>;
  const proved = new Set(rows.filter((w) => w.verified_at).map((w) => String(w.address).toLowerCase()));
  const registered = new Set(rows.map((w) => String(w.address).toLowerCase()));

  const provedPayer = [...candidates].find((a) => proved.has(a)) ?? null;
  const verified = provedPayer !== null;
  const payerAddr = provedPayer ?? [...candidates].find((a) => registered.has(a)) ?? txFrom;
  const payerOwn = new Set<string>([...registered, payerAddr]);

  /* ------------------------------------------------------------ dedupe */
  if (verified) {
    const { error: claimError } = await db.from("payment_receipts").insert({
      tx_hash: txHash,
      user_id: user.id,
      kind,
      context_id: contextId,
    });
    if (claimError) {
      if (String(claimError.code) === "23505") return json(origin, { ok: true, alreadyReported: true });
      console.error("payment-receipt: could not claim the receipt", claimError);
      return json(origin, { error: "Could not record that just now. Try again in a moment." }, 500);
    }
  }
  // An unproved caller never claims the hash (so a stranger cannot block the
  // real payer), which means their own bell is deduped against itself instead.
  const { count: alreadyTold } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("type", "payment_sent")
    .eq("metadata->>tx_hash", txHash);

  /* ------------------------------------------------ what the payer spent */
  let payerLabel: string | null = null;
  if (payerAddr === txFrom && tx.value > 0n) {
    payerLabel = formatAmount(tx.value, 18, "ETH");
  } else {
    for (const l of receipt.logs) {
      if (String(l.topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC || l.topics.length !== 3) continue;
      if (topicAddress(l.topics[1]) !== payerAddr) continue;
      const info = await chainTokenInfo(String(l.address).toLowerCase());
      if (!info) continue;
      try {
        payerLabel = formatAmount(BigInt(l.data), info.decimals, info.symbol);
        break;
      } catch {
        /* unreadable amount, try the next transfer */
      }
    }
  }

  const meta: Record<string, unknown> = { tx_hash: txHash, context_id: contextId };
  if ((kind === "world_key" || kind === "drop_collect") && contextId) meta.cta_path = `/world/${contextId}`;
  else if ((kind === "song_copy" || kind === "song_sell") && contextId) meta.song_id = contextId;
  else if (kind === "wwat") meta.cta_path = "/wavewarz-africa";
  else meta.cta_path = "/wallet";

  if (!alreadyTold) {
    const { error } = await db.rpc("notify_payment", {
      p_payer: user.id,
      p_payee: null,
      p_kind: kind,
      p_amount_label: payerLabel,
      p_meta: meta,
      p_notify_payer: true,
      p_notify_payee: false,
    });
    if (error) console.error("payment-receipt: payer notice failed", error);
  }

  if (!verified) return json(origin, { ok: true, verified: false, payees: 0 });

  /* ------------------------------------------------------ who got paid */
  // address -> token -> amount
  const received = new Map<string, Map<string, bigint>>();
  const add = (to: string, token: string, amount: bigint) => {
    if (amount <= 0n || payerOwn.has(to)) return;
    const byToken = received.get(to) ?? new Map<string, bigint>();
    byToken.set(token, (byToken.get(token) ?? 0n) + amount);
    received.set(to, byToken);
  };
  for (const l of receipt.logs) {
    if (String(l.topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC || l.topics.length !== 3) continue;
    const token = String(l.address).toLowerCase();
    if (!KNOWN_TOKENS[token]) continue;
    const to = topicAddress(l.topics[2]);
    if (!to) continue;
    try {
      add(to, token, BigInt(l.data));
    } catch {
      /* skip */
    }
  }
  if (payerAddr === txFrom && tx.value > 0n && tx.to) add(String(tx.to).toLowerCase(), "eth", tx.value);

  const addresses = [...received.keys()];
  const userFor = new Map<string, string>();
  if (addresses.length > 0) {
    const { data: uw } = await db
      .from("user_wallets")
      .select("user_id, address")
      .in("address", addresses)
      .not("verified_at", "is", null);
    for (const w of (uw ?? []) as Array<{ user_id: string; address: string }>) {
      const a = String(w.address).toLowerCase();
      if (!userFor.has(a)) userFor.set(a, w.user_id);
    }
    const unmapped = addresses.filter((a) => !userFor.has(a));
    if (unmapped.length > 0) {
      const { data: aw } = await db
        .from("artist_wallets")
        .select("artist_id, wallet_address")
        .not("wallet_address", "is", null);
      const artistByAddr = new Map<string, string>();
      for (const r of (aw ?? []) as Array<{ artist_id: string; wallet_address: string }>) {
        artistByAddr.set(String(r.wallet_address).toLowerCase(), r.artist_id);
      }
      const artistIds = [...new Set(unmapped.map((a) => artistByAddr.get(a)).filter((x): x is string => !!x))];
      if (artistIds.length > 0) {
        const { data: accts } = await db
          .from("artist_accounts")
          .select("artist_id, user_id")
          .in("artist_id", artistIds)
          .not("user_id", "is", null);
        const userByArtist = new Map<string, string>();
        for (const r of (accts ?? []) as Array<{ artist_id: string; user_id: string }>) userByArtist.set(r.artist_id, r.user_id);
        for (const a of unmapped) {
          const artistId = artistByAddr.get(a);
          const u = artistId ? userByArtist.get(artistId) : undefined;
          if (u) userFor.set(a, u);
        }
      }
    }
  }

  // One notice per person, whatever number of their wallets were paid.
  const perUser = new Map<string, Map<string, bigint>>();
  for (const [addr, byToken] of received) {
    const u = userFor.get(addr);
    if (!u || u === user.id) continue;
    const merged = perUser.get(u) ?? new Map<string, bigint>();
    for (const [token, amount] of byToken) merged.set(token, (merged.get(token) ?? 0n) + amount);
    perUser.set(u, merged);
  }

  let told = 0;
  for (const [payee, byToken] of perUser) {
    if (told >= MAX_PAYEES) break;
    const label = [...byToken.entries()]
      .map(([token, amount]) => token === "eth"
        ? formatAmount(amount, 18, "ETH")
        : formatAmount(amount, KNOWN_TOKENS[token].decimals, KNOWN_TOKENS[token].symbol))
      .join(" and ");
    const { error } = await db.rpc("notify_payment", {
      p_payer: user.id,
      p_payee: payee,
      p_kind: kind,
      p_amount_label: label,
      p_meta: meta,
      p_notify_payer: false,
      p_notify_payee: true,
    });
    if (error) console.error("payment-receipt: payee notice failed", error);
    else told += 1;
  }

  return json(origin, { ok: true, verified: true, payees: told });
});
