// Base Wallet SIWE verification — issues a one-time Supabase magic-link OTP.
//
// SECURITY NOTES (regression fix 2026-05):
//   The previous implementation derived the Supabase password from the wallet
//   address (`base_` + last 16 hex chars). That was deterministic and trivially
//   brute-forceable from a DB dump. This rewrite removes passwords entirely and
//   issues a one-time OTP that the client exchanges via `supabase.auth.verifyOtp`,
//   matching the safer pattern used by `wallet-auth`.
//
// Response shape: { email, otp }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.4";

const ALLOWED_ORIGINS = new Set<string>(
  (Deno.env.get("ALLOWED_ORIGINS") ?? "https://songchainn.xyz,https://app.songchainn.xyz,https://www.songchainn.xyz")
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

const EIP1271_MAGIC_VALUE = "0x1626ba7e";

async function verifySignature(address: string, message: string, signature: string): Promise<boolean> {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() === address.toLowerCase()) return true;
  } catch {
    // not ECDSA - try EIP-1271
  }
  const baseRpcUrl = Deno.env.get("BASE_RPC_URL") ?? "https://mainnet.base.org";
  try {
    const provider = new ethers.JsonRpcProvider(baseRpcUrl);
    const msgHash = ethers.hashMessage(message);
    const contract = new ethers.Contract(
      address,
      ["function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4)"],
      provider,
    );
    const result: string = await contract.isValidSignature(msgHash, signature);
    return result.toLowerCase() === EIP1271_MAGIC_VALUE;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(origin) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsFor(origin) });

  try {
    const { action, address, message, signature } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    if (action === "generate-nonce") {
      const newNonce = crypto.randomUUID().replace(/-/g, "");
      return json(origin, { nonce: newNonce });
    }

    if (action !== "verify") {
      return json(origin, { error: "Invalid action" }, 400);
    }

    if (!address || !message || !signature) {
      return json(origin, { error: "Missing required fields" }, 400);
    }

    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(address)) {
      return json(origin, { error: "Invalid wallet address format" }, 400);
    }

    const nonceMatch = message.match(/Nonce: ([a-f0-9]+)/i);
    const messageNonce = nonceMatch?.[1];
    if (!messageNonce) return json(origin, { error: "Invalid message - no nonce" }, 400);

    // Replay protection: nonce must be single-use, 10-min TTL.
    await admin.from("used_nonces").delete().lt("expires_at", new Date().toISOString());
    const { error: nonceError } = await admin.from("used_nonces").insert({
      nonce: messageNonce,
      used_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (nonceError?.code === "23505") {
      return json(origin, { error: "Nonce already used" }, 400);
    }
    if (nonceError) console.error("[verify-base-signature] nonce store error:", nonceError.message);

    const signatureValid = await verifySignature(address, message, signature);
    if (!signatureValid) return json(origin, { error: "Signature verification failed" }, 401);

    // Find-or-create the Supabase user keyed by wallet address. No password.
    const email = `wallet-${address.toLowerCase()}@wallet.songchainn.xyz`;

    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        wallet_address: address.toLowerCase(),
        provider: "base_app",
        verified_at: new Date().toISOString(),
      },
    });
    if (createErr && !/already registered|already exists/i.test(createErr.message)) {
      console.error("[verify-base-signature] createUser:", createErr.message);
      return json(origin, { error: "Failed to provision account" }, 500);
    }

    // One-time OTP - client exchanges via supabase.auth.verifyOtp({type:'magiclink'}).
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !link?.properties?.email_otp) {
      console.error("[verify-base-signature] generateLink:", linkErr?.message);
      return json(origin, { error: "Authentication failed" }, 500);
    }

    return json(origin, { email, otp: link.properties.email_otp, walletAddress: address });
  } catch (error) {
    console.error("[verify-base-signature] unhandled:", error instanceof Error ? error.message : error);
    return json(req.headers.get("origin"), { error: "Internal server error" }, 500);
  }
});
