// day-one-attest: records a Day One receipt on Base.
//
// A receipt (supabase/migrations/20260914001300_day_ones.sql) is earned in the
// app: a real listen and a like, numbered in the order fans got there. This
// makes it permanent and checkable by anyone: an EAS attestation on Base, made
// BY SONGCHAINN's attester TO the fan's own wallet, carrying the song, the
// artist, the number and when it was earned. It cannot be bought, sold or moved,
// and base.easscan.org shows it to anybody.
//
// SONGCHAINN pays the network fee (a fraction of a cent on Base), so recording
// costs the fan nothing and needs no signature from them. The attester key was
// generated inside Vault and is read here with the service role; it is never
// sent anywhere.
//
// POST { action: 'status' }                 -> { attester, balanceEth, schemaUid, registered }
// POST { action: 'attest', receiptId, address? } with the fan's JWT
//                                           -> { uid, tx, url }
// A receipt is recognition, not a stake or a promise of money.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  encodePacked,
  formatEther,
  getAddress,
  http,
  keccak256,
  parseAbiParameters,
  zeroAddress,
  type Hex,
} from "npm:viem@2";
import { privateKeyToAccount } from "npm:viem@2/accounts";
import { base } from "npm:viem@2/chains";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** EAS on Base (OP stack predeploys). */
const EAS = "0x4200000000000000000000000000000000000021" as const;
const SCHEMA_REGISTRY = "0x4200000000000000000000000000000000000020" as const;
const SCHEMA =
  "string app,string kind,string targetId,string title,string artist,uint32 fanNumber,uint64 earnedAt,bytes32 receiptId";
const SCHEMA_UID = keccak256(encodePacked(["string", "address", "bool"], [SCHEMA, zeroAddress, true]));
const MIN_BALANCE_WEI = 20_000_000_000n; // 0.00002 ETH, a handful of attestations
const DAILY_LIMIT = 25;

const easAbi = [
  {
    type: "function",
    name: "attest",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "event",
    name: "Attested",
    inputs: [
      { name: "recipient", type: "address", indexed: true },
      { name: "attester", type: "address", indexed: true },
      { name: "uid", type: "bytes32", indexed: false },
      { name: "schemaUID", type: "bytes32", indexed: true },
    ],
  },
] as const;

const registryAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "schema", type: "string" },
      { name: "resolver", type: "address" },
      { name: "revocable", type: "bool" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "getSchema",
    stateMutability: "view",
    inputs: [{ name: "uid", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "uid", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "revocable", type: "bool" },
          { name: "schema", type: "string" },
        ],
      },
    ],
  },
] as const;

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const rpcUrl = () => Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org";

async function attester(db: ReturnType<typeof admin>) {
  const { data, error } = await db.rpc("day_one_attester_secret");
  if (error || typeof data !== "string" || !/^(0x)?[0-9a-fA-F]{64}$/.test(data)) throw new Error("ATTESTER_KEY_UNAVAILABLE");
  return privateKeyToAccount((data.startsWith("0x") ? data : `0x${data}`) as Hex);
}

async function schemaRegistered(pub: ReturnType<typeof createPublicClient>): Promise<boolean> {
  const rec = await pub.readContract({ address: SCHEMA_REGISTRY, abi: registryAbi, functionName: "getSchema", args: [SCHEMA_UID] });
  return (rec as { uid: Hex }).uid !== `0x${"0".repeat(64)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const db = admin();
  const pub = createPublicClient({ chain: base, transport: http(rpcUrl()) });

  let account;
  try {
    account = await attester(db);
  } catch {
    return json({ error: "Recording on Base is not set up yet." }, 503);
  }

  if (body?.action === "status") {
    const [balance, registered] = await Promise.all([
      pub.getBalance({ address: account.address }).catch(() => 0n),
      schemaRegistered(pub).catch(() => false),
    ]);
    return json({
      attester: account.address,
      balanceEth: formatEther(balance),
      funded: balance >= MIN_BALANCE_WEI,
      schemaUid: SCHEMA_UID,
      registered,
    });
  }

  if (body?.action !== "attest") return json({ error: "Unknown action" }, 400);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const { data: auth } = await db.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: "Sign in to record your Day One." }, 401);

  const receiptId = typeof body?.receiptId === "string" ? body.receiptId : "";
  if (!/^[0-9a-f-]{36}$/i.test(receiptId)) return json({ error: "That receipt was not found." }, 400);

  const { data: receipt } = await db
    .from("day_one_receipts")
    .select("id, user_id, kind, target_id, artist_id, fan_number, earned_at, attestation_uid, attest_tx")
    .eq("id", receiptId)
    .maybeSingle();
  if (!receipt || receipt.user_id !== user.id) return json({ error: "That receipt was not found." }, 404);
  if (receipt.attestation_uid) {
    return json({ uid: receipt.attestation_uid, tx: receipt.attest_tx, url: `https://base.easscan.org/attestation/view/${receipt.attestation_uid}`, already: true });
  }

  // The wallet it goes to: one of this person's own wallets, the active one by default.
  const { data: wallets } = await db.from("user_wallets").select("address, is_active").eq("user_id", user.id);
  const list = (wallets ?? []) as Array<{ address: string; is_active: boolean }>;
  const wanted = typeof body?.address === "string" ? body.address.toLowerCase() : null;
  const pick = wanted ? list.find((w) => w.address.toLowerCase() === wanted) : list.find((w) => w.is_active) ?? list[0];
  if (!pick || !/^0x[0-9a-fA-F]{40}$/.test(pick.address)) {
    return json({ error: "Connect a wallet first, then record it.", needsWallet: true }, 400);
  }
  const recipient = getAddress(pick.address);

  // One at a time per person, and a daily ceiling so nobody drains the fee wallet.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count: today } = await db
    .from("day_one_receipts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("attested_at", since);
  if ((today ?? 0) >= DAILY_LIMIT) return json({ error: "That is today's limit for recording on Base. Try again tomorrow." }, 429);

  const { data: claimed } = await db
    .from("day_one_receipts")
    .update({ attest_tx: "pending", attested_to: recipient })
    .eq("id", receipt.id)
    .is("attestation_uid", null)
    .or("attest_tx.is.null,attest_tx.neq.pending")
    .select("id");
  if (!claimed?.length) return json({ error: "It is already being recorded. Give it a few seconds." }, 409);

  const release = async () => {
    await db.from("day_one_receipts").update({ attest_tx: null, attested_to: null }).eq("id", receipt.id).is("attestation_uid", null);
  };

  try {
    const balance = await pub.getBalance({ address: account.address });
    if (balance < MIN_BALANCE_WEI) {
      await release();
      return json({ error: "Recording on Base is paused for a moment while the fee wallet is topped up.", unfunded: true }, 503);
    }

    const wallet = createWalletClient({ account, chain: base, transport: http(rpcUrl()) });

    if (!(await schemaRegistered(pub))) {
      const regTx = await wallet.writeContract({
        address: SCHEMA_REGISTRY,
        abi: registryAbi,
        functionName: "register",
        args: [SCHEMA, zeroAddress, true],
      });
      await pub.waitForTransactionReceipt({ hash: regTx });
    }

    // What the receipt is for, as the card shows it.
    let title = "";
    let artist = "";
    if (receipt.kind === "song") {
      const { data: song } = await db.from("songs").select("title, artist_name").eq("id", receipt.target_id).maybeSingle();
      title = song?.title ?? "";
      artist = song?.artist_name ?? "";
    } else {
      const { data: row } = await db
        .from("artist_accounts")
        .select("user_id")
        .eq("artist_id", receipt.target_id)
        .maybeSingle();
      if (row?.user_id) {
        const { data: prof } = await db.from("audience_profiles").select("display_name").eq("user_id", row.user_id).maybeSingle();
        artist = prof?.display_name ?? "";
      }
      if (!artist) {
        const { data: song } = await db.from("songs").select("artist_name").eq("artist_id", receipt.target_id).limit(1).maybeSingle();
        artist = song?.artist_name ?? "";
      }
      title = artist;
    }

    const encoded = encodeAbiParameters(parseAbiParameters(SCHEMA), [
      "SONGCHAINN Day One",
      receipt.kind,
      String(receipt.target_id),
      title.slice(0, 120),
      artist.slice(0, 120),
      receipt.fan_number,
      BigInt(Math.floor(new Date(receipt.earned_at).getTime() / 1000)),
      (`0x${receipt.id.replace(/-/g, "").padEnd(64, "0")}`) as Hex,
    ]);

    const tx = await wallet.writeContract({
      address: EAS,
      abi: easAbi,
      functionName: "attest",
      args: [
        {
          schema: SCHEMA_UID,
          data: {
            recipient,
            expirationTime: 0n,
            revocable: true,
            refUID: `0x${"0".repeat(64)}`,
            data: encoded,
            value: 0n,
          },
        },
      ],
    });
    const mined = await pub.waitForTransactionReceipt({ hash: tx });
    if (mined.status !== "success") throw new Error("The attestation transaction failed on Base.");

    let uid: string | null = null;
    for (const log of mined.logs) {
      if (log.address.toLowerCase() !== EAS.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: easAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "Attested") uid = (ev.args as { uid: Hex }).uid;
      } catch {
        /* not ours */
      }
    }
    if (!uid) throw new Error("Recorded, but the attestation id could not be read.");

    await db
      .from("day_one_receipts")
      .update({ attestation_uid: uid, attest_tx: tx, attested_to: recipient, attested_at: new Date().toISOString() })
      .eq("id", receipt.id);

    return json({ uid, tx, url: `https://base.easscan.org/attestation/view/${uid}` });
  } catch (err) {
    console.error("day-one-attest failed", err);
    await release();
    return json({ error: "Base did not take it just now. Nothing was charged to you. Try again in a minute." }, 502);
  }
});
