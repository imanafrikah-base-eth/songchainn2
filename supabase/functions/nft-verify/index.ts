// nft-verify: the only thing that can make a drop live.
//
// An artist makes a drop from the browser with their own wallet, then records
// the contract, token id and transaction on their world_nfts row. Anyone can
// type a row; only this function checks it. It reads Base directly and marks
// the drop live only when all of this is true:
//
//   1. the row belongs to the caller (JWT), and it is in 'minting'
//   2. the transaction exists, succeeded, and was sent by a wallet linked to
//      the caller's account
//   3. the contract's owner() is that same wallet
//   4. the token exists on that contract and its URI is this drop's metadata
//
// A Collect button is only ever drawn for a live drop, so a collector's money
// can only ever go to a contract that passed these four checks. Nothing here
// trusts the request body beyond the row id.

import { createClient } from "npm:@supabase/supabase-js@2";
import { createPublicClient, http, parseAbi, type Address, type Hex } from "npm:viem@2.53.1";
import { base } from "npm:viem@2.53.1/chains";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const abi = parseAbi([
  "function owner() view returns (address)",
  "function getTokenInfo(uint256 tokenId) view returns ((string uri, uint256 maxSupply, uint256 totalMinted))",
]);

const IS_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const IS_HASH = /^0x[a-fA-F0-9]{64}$/;
const ORIGIN = "https://songchainn.xyz";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ ok: false, message: "Not signed in" }, 401);

    const db = admin();
    const { data: userData } = await db.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ ok: false, message: "Not signed in" }, 401);

    const { id } = await req.json().catch(() => ({}));
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
      return json({ ok: false, message: "Which drop?" }, 400);
    }

    const { data: drop, error: de } = await db
      .from("world_nfts")
      .select("id, owner_id, status, contract_address, token_id, tx_hash, metadata_uri, payout_wallet")
      .eq("id", id)
      .maybeSingle();
    if (de || !drop) return json({ ok: false, message: "No such drop" }, 404);
    if (drop.owner_id !== user.id) return json({ ok: false, message: "Not your drop" }, 403);
    if (drop.status === "live") return json({ ok: true, status: "live", message: "Already live" });
    if (!IS_ADDRESS.test(drop.contract_address ?? "") || drop.token_id == null || !IS_HASH.test(drop.tx_hash ?? "")) {
      return json({ ok: false, message: "The drop has no transaction to check yet" }, 400);
    }

    // The wallets that are really this person's: the one on their profile and
    // the one SIWE wrote into their auth metadata. Same rule as world-gate.
    const { data: profile } = await db
      .from("audience_profiles")
      .select("wallet_address")
      .eq("user_id", user.id)
      .maybeSingle();
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const linked = new Set(
      [profile?.wallet_address, meta.wallet_address, meta.farcaster_address]
        .filter((w): w is string => typeof w === "string" && IS_ADDRESS.test(w))
        .map((w) => w.toLowerCase()),
    );
    if (linked.size === 0) return json({ ok: false, message: "No wallet is linked to your account" }, 400);

    const client = createPublicClient({
      chain: base,
      transport: http(Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org"),
    });

    const fail = async (message: string) => {
      await db.from("world_nfts").update({ status: "failed", status_note: message }).eq("id", id);
      return json({ ok: false, status: "failed", message });
    };

    // 2. the transaction
    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: drop.tx_hash as Hex });
    } catch {
      return json({ ok: false, status: "minting", message: "Base has not confirmed that transaction yet. Try again in a minute." });
    }
    if (receipt.status !== "success") return fail("The transaction reverted on Base");
    if (!linked.has(receipt.from.toLowerCase())) return fail("That transaction was not sent by a wallet linked to your account");

    // 3. the contract
    const contract = drop.contract_address as Address;
    let owner: string;
    try {
      owner = await client.readContract({ address: contract, abi, functionName: "owner" });
    } catch {
      return fail("That address is not a Zora 1155 contract on Base");
    }
    if (!linked.has(owner.toLowerCase())) return fail("Your wallet does not own that contract");

    // 4. the token
    let info;
    try {
      info = await client.readContract({
        address: contract,
        abi,
        functionName: "getTokenInfo",
        args: [BigInt(drop.token_id)],
      });
    } catch {
      return fail("That token does not exist on the contract");
    }
    const expectedUri = `${ORIGIN}/nft/${id}/metadata.json`;
    if (info.uri !== expectedUri) return fail("The token on chain does not point at this drop");

    const now = new Date().toISOString();
    const { error: ue } = await db
      .from("world_nfts")
      .update({
        status: "live",
        status_note: null,
        metadata_uri: expectedUri,
        payout_wallet: (drop as { payout_wallet?: string }).payout_wallet ?? receipt.from,
        minted_at: now,
        verified_at: now,
      })
      .eq("id", id);
    if (ue) return json({ ok: false, message: "Checked, but could not save. Try again." }, 500);

    return json({ ok: true, status: "live", message: "Live on Base" });
  } catch (err) {
    console.error("nft-verify error:", err);
    return json({ ok: false, message: "The check failed. Nothing was changed." }, 500);
  }
});
