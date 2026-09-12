// wallet-link: proving a wallet is yours, with its own key.
//
// WHY THIS EXISTS. add_my_wallet binds any address to your account on nothing
// but a format check. That was fine while user_wallets was a convenience, and
// it stopped being fine the moment battle-host-fee, battle-voice and
// battle-trade-verify started asking "is this payment yours?" and answering it
// from that table. Base is public: a real host's fee transfer and its from
// address are visible to everybody the moment they are mined. So anyone could
// register a stranger's address and claim the stranger's payment. All three
// functions carried a comment admitting it. This is the fix they named.
//
// THE SHAPE. The server writes the message, not the browser. A challenge is one
// row, bound to this account AND this address, single use, and short lived. The
// client signs exactly what came back and sends the signature. Only then does
// user_wallets.verified_at get set, and only a verified wallet counts as proof
// of who paid.
//
// Signing here moves no money and approves no spending. It is a signature over
// a plain sentence, which is why it can be asked for before a purchase without
// costing anybody anything.
//
// Request:  POST { action: 'challenge', address, provider? }
//           POST { action: 'verify', address, signature }
// Response: challenge -> { message, expiresAt }
//           verify    -> { ok: true, verifiedAt } | { error }

import { createClient } from "npm:@supabase/supabase-js@2";
import { createPublicClient, http, verifyMessage as verifyMessageEcdsa } from "npm:viem";
import { base } from "npm:viem/chains";

/**
 * SMART WALLETS DO NOT SIGN LIKE KEYS, AND THIS AUDIENCE HAS THEM.
 *
 * viem ships two things called verifyMessage. The plain utility, the one
 * wallet-auth imports and this function first shipped with, says in its own
 * docs: "Only supports Externally Owned Accounts. Does not support Contract
 * Accounts." A Coinbase or Zora smart wallet is a CONTRACT: it proves a
 * signature by answering isValidSignature on chain (ERC-1271), not by a key
 * recovery that arithmetic alone can check.
 *
 * That was not hypothetical. The first artist wired up after this shipped,
 * N3M3SIS, has walletType SMART_WALLET, so the gate would have refused her own
 * wallet forever and told her the signature did not come from it.
 *
 * The public ACTION does the on-chain check and handles both kinds, so it needs
 * a client and an RPC. Verification now costs one eth_call, which is the price
 * of accepting the wallets people actually use.
 */
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

const ADDRESS = /^0x[0-9a-f]{40}$/;
/**
 * NOT a fixed 130 characters. That is the length of a plain key's signature,
 * and demanding it would throw out every smart wallet before the signature was
 * even looked at: an ERC-1271 or ERC-6492 signature is whatever the wallet's
 * own contract returns, and is routinely much longer. Bounded, so an absurd
 * payload still cannot be posted at us.
 */
const SIGNATURE = /^0x[0-9a-fA-F]{64,20000}$/;

/** A challenge is good for five minutes. Long enough to read, short enough to matter. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const PROVIDERS = new Set([
  "metamask", "coinbase", "farcaster", "zora", "rainbow", "phantom", "rabby", "walletconnect",
]);

/**
 * What they are asked to sign.
 *
 * Written by the server so the browser cannot choose the words. It says plainly
 * that nothing moves, because a wallet popup with unexplained text is how people
 * get robbed, and somebody who learns to sign anything we put in front of them
 * has learned a habit that will cost them somewhere else.
 */
function challengeText(domain: string, address: string, userId: string, nonce: string, issuedAt: string, expiresAt: string): string {
  return [
    `${domain} wants you to prove this wallet is yours.`,
    "",
    address,
    "",
    "This does not move any money, does not approve any spending, and costs no gas.",
    "It proves you hold this wallet's key, so nobody else can claim your payments as theirs.",
    "",
    `Account: ${userId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expiresAt}`,
  ].join("\n");
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

  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown; address?: unknown; signature?: unknown; provider?: unknown;
  };
  const action = body.action === "verify" ? "verify" : "challenge";
  const address = String(body.address ?? "").trim().toLowerCase();
  if (!ADDRESS.test(address)) return json(origin, { error: "That does not look like a wallet address." }, 400);

  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  /* ------------------------------------------------------------ challenge */
  if (action === "challenge") {
    // A wallet already proved is left alone. Re-proving is harmless but asking
    // somebody to sign again for no reason teaches them to sign without reading.
    const { data: already } = await db
      .from("user_wallets")
      .select("verified_at")
      .eq("user_id", user.id)
      .eq("address", address)
      .maybeSingle();
    if (already?.verified_at) {
      return json(origin, { ok: true, alreadyVerified: true, verifiedAt: already.verified_at });
    }

    const nonce = crypto.randomUUID().replace(/-/g, "");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
    const domain = (() => {
      try {
        return origin ? new URL(origin).host : "songchainn.xyz";
      } catch {
        return "songchainn.xyz";
      }
    })();
    const message = challengeText(domain, address, user.id, nonce, issuedAt.toISOString(), expiresAt.toISOString());

    const { error } = await db.from("wallet_link_challenges").insert({
      user_id: user.id,
      address,
      nonce,
      message,
      expires_at: expiresAt.toISOString(),
    });
    if (error) {
      console.error("wallet-link: could not issue a challenge", error);
      return json(origin, { error: "Could not start that just now. Try again in a moment." }, 500);
    }

    return json(origin, { ok: true, message, expiresAt: expiresAt.toISOString() });
  }

  /* --------------------------------------------------------------- verify */
  const signature = String(body.signature ?? "").trim();
  if (!SIGNATURE.test(signature)) return json(origin, { error: "That signature is not readable. Try again." }, 400);

  // The newest unused, unexpired challenge for THIS person and THIS address.
  const { data: challenge } = await db
    .from("wallet_link_challenges")
    .select("id, message, expires_at")
    .eq("user_id", user.id)
    .eq("address", address)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challenge) {
    return json(origin, { error: "That request expired. Try proving the wallet again." }, 409);
  }

  // One on-chain check, so a smart wallet and a plain key are both accepted on
  // their own terms. See the note beside publicClient above.
  //
  // If that call cannot be made at all (an RPC wobble, Base unreachable) fall
  // back to plain key recovery instead of refusing everybody. That is not a
  // weakening: ECDSA recovery accepts a signature only when it genuinely
  // recovers to this address. It simply cannot speak for a contract wallet,
  // which is exactly what the on-chain path is for, so a smart wallet still
  // fails closed and is told to try again rather than being let through.
  // "WRONG SIGNATURE" AND "COULD NOT CHECK" ARE DIFFERENT ANSWERS.
  //
  // The public Base endpoint is rate limited. When it refuses, the ECDSA
  // fallback returns false for a smart wallet, and telling that person their
  // signature did not come from their wallet is simply untrue: it did, we just
  // could not ask the chain. So the two cases are kept apart, and somebody who
  // signed honestly is told to try again rather than being called a liar.
  const args = {
    address: address as `0x${string}`,
    message: String(challenge.message),
    signature: signature as `0x${string}`,
  };

  let valid = false;
  let couldNotCheck = false;
  try {
    valid = await publicClient.verifyMessage(args);
  } catch {
    // One retry. A rate limited endpoint usually answers the second time, and
    // it is much better to wait a beat than to refuse a genuine wallet.
    try {
      valid = await publicClient.verifyMessage(args);
    } catch {
      try {
        valid = await verifyMessageEcdsa(args);
      } catch {
        valid = false;
      }
      // The authoritative check never ran. If plain key recovery did not
      // vouch for it either, we do not actually know that it is wrong.
      if (!valid) couldNotCheck = true;
    }
  }

  if (couldNotCheck) {
    // The challenge is deliberately NOT spent here, so the same signature works
    // on the next try and nobody is asked to sign twice for our outage.
    return json(origin, { error: "Could not reach Base to check that signature, so nothing changed. Try again in a moment." }, 503);
  }
  if (!valid) {
    return json(origin, { error: "That signature did not come from this wallet, so it was not added." }, 401);
  }

  // Spend the challenge FIRST. If anything below fails they sign again, which
  // is a small annoyance; a challenge that stays usable is a replay.
  const { error: spendError } = await db
    .from("wallet_link_challenges")
    .update({ used_at: new Date().toISOString() })
    .eq("id", challenge.id)
    .is("used_at", null);
  if (spendError) {
    console.error("wallet-link: could not spend the challenge", spendError);
    return json(origin, { error: "Could not finish that just now. Try again in a moment." }, 500);
  }

  const provider = PROVIDERS.has(String(body.provider ?? "")) ? String(body.provider) : "other";
  const verifiedAt = new Date().toISOString();

  // First wallet on the account becomes the active one, matching add_my_wallet.
  const { count } = await db
    .from("user_wallets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { error: upsertError } = await db
    .from("user_wallets")
    .upsert(
      {
        user_id: user.id,
        address,
        provider,
        is_active: (count ?? 0) === 0,
        last_used_at: verifiedAt,
        verified_at: verifiedAt,
      },
      { onConflict: "user_id,address" },
    );
  if (upsertError) {
    console.error("wallet-link: verified but could not save the wallet", upsertError);
    return json(origin, { error: "Your signature checked out but the wallet did not save. Try once more." }, 500);
  }

  return json(origin, { ok: true, verifiedAt });
});
