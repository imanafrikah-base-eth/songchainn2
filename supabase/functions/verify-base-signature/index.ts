import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EIP1271_MAGIC_VALUE = "0x1626ba7e";

async function verifySignature(address: string, message: string, signature: string): Promise<boolean> {
  // Try ECDSA recovery first (EOA wallets)
  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() === address.toLowerCase()) {
      return true;
    }
  } catch {
    // Not a valid ECDSA signature — may be a smart contract wallet
  }

  // EIP-1271 fallback for smart contract wallets (Base Smart Wallet, Coinbase Wallet, etc.)
  const baseRpcUrl = Deno.env.get("BASE_RPC_URL") ?? "https://mainnet.base.org";
  try {
    const provider = new ethers.JsonRpcProvider(baseRpcUrl);
    const msgHash = ethers.hashMessage(message);
    const contract = new ethers.Contract(
      address,
      ["function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4)"],
      provider
    );
    const result: string = await contract.isValidSignature(msgHash, signature);
    return result.toLowerCase() === EIP1271_MAGIC_VALUE;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, address, message, signature } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === "generate-nonce") {
      const newNonce = crypto.randomUUID().replace(/-/g, "");
      return new Response(
        JSON.stringify({ nonce: newNonce }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "verify") {
      if (!address || !message || !signature) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return new Response(
          JSON.stringify({ error: "Invalid wallet address format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract and validate nonce from SIWE message
      const nonceMatch = message.match(/Nonce: ([a-f0-9]+)/i);
      const messageNonce = nonceMatch?.[1];

      if (!messageNonce) {
        return new Response(
          JSON.stringify({ error: "Invalid message format - no nonce found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Clean up expired nonces
      await supabase
        .from("used_nonces")
        .delete()
        .lt("expires_at", new Date().toISOString());

      // Replay-attack protection: nonce must be single-use
      const { error: nonceError } = await supabase
        .from("used_nonces")
        .insert({
          nonce: messageNonce,
          used_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });

      if (nonceError?.code === "23505") {
        return new Response(
          JSON.stringify({ error: "Nonce already used" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (nonceError) {
        console.error("Nonce storage error:", nonceError);
      }

      // Cryptographically verify the signature — EOA (ECDSA) or smart contract (EIP-1271)
      const signatureValid = await verifySignature(address, message, signature);
      if (!signatureValid) {
        return new Response(
          JSON.stringify({ error: "Signature verification failed" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Derive a stable identity for this wallet address
      const walletEmail = `${address.slice(2, 14).toLowerCase()}@base.wallet`;
      const walletPassword = `base_${address.slice(-16).toLowerCase()}`;

      let authResult = await supabase.auth.signInWithPassword({
        email: walletEmail,
        password: walletPassword,
      });

      if (authResult.error?.message?.includes("Invalid login credentials")) {
        const { error: createError } = await supabase.auth.admin.createUser({
          email: walletEmail,
          password: walletPassword,
          email_confirm: true,
          user_metadata: {
            base_wallet_address: address,
            auth_method: "base_app",
            verified_at: new Date().toISOString(),
          },
        });

        if (createError) {
          console.error("User creation error:", createError);
          return new Response(
            JSON.stringify({ error: "Failed to create user account" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        authResult = await supabase.auth.signInWithPassword({
          email: walletEmail,
          password: walletPassword,
        });
      }

      if (authResult.error) {
        console.error("Auth error:", authResult.error);
        return new Response(
          JSON.stringify({ error: "Authentication failed" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          session: authResult.data.session,
          user: authResult.data.user,
          walletAddress: address,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
