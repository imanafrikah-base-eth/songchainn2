// Base Wallet SIWE (Sign-In with Ethereum) verification edge function.
// Flow: client builds EIP-4361 message + signs with wallet →
// sends here → we verify signature → issue Supabase magic-link OTP →
// client calls supabase.auth.verifyOtp() to establish a real session.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createPublicClient, http, verifyMessage as verifyMessageEcdsa } from 'npm:viem';
import { base } from 'npm:viem/chains';

/**
 * SMART WALLETS COULD NOT SIGN IN HERE, AND NOBODY HAD NOTICED.
 *
 * This imported viem's plain verifyMessage utility, whose own docs say: "Only
 * supports Externally Owned Accounts. Does not support Contract Accounts." A
 * Coinbase or Zora smart wallet is a contract, and proves a signature by
 * answering isValidSignature on chain (ERC-1271) rather than by key recovery.
 * So anybody whose wallet is a smart wallet was told their signature failed,
 * with no way to get in that way at all.
 *
 * Found on 12 Sep while wiring up N3M3SIS, whose Zora account is a SMART_WALLET.
 * The public action does the on-chain check and still handles ordinary keys, so
 * this widens who can sign in and locks nobody out. Costs one eth_call.
 */
const publicClient = createPublicClient({
  chain: base,
  transport: http(Deno.env.get('BASE_RPC_URL') || 'https://mainnet.base.org'),
});

// SIWE domain allowlist. The domain line in a signed message is the only thing
// binding that signature to this site, so anything on this list can spend a
// signature a user produced here. Real deployments only.
const PROD_DOMAINS = 'songchainn.xyz,www.songchainn.xyz,app.songchainn.xyz,beta.songchainn.xyz';
const PROD_ORIGINS = 'https://songchainn.xyz,https://www.songchainn.xyz,https://app.songchainn.xyz,https://beta.songchainn.xyz';

// Local development is opt-in and off unless someone deliberately sets
// SIWE_ALLOW_LOCALHOST=true on this function. Localhost on the list means a
// signature phished from a page the user was told to run locally would be
// accepted here, so it must never be the default.
const ALLOW_LOCALHOST = (Deno.env.get('SIWE_ALLOW_LOCALHOST') ?? '').toLowerCase() === 'true';
const LOCAL_DOMAINS = 'localhost:5173,127.0.0.1:5173,localhost:4173,127.0.0.1:4173';
const LOCAL_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173';

function listFrom(...parts: string[]): Set<string> {
  return new Set(parts.flatMap((p) => p.split(',')).map((s) => s.trim()).filter(Boolean));
}

// ALLOWED_SIWE_DOMAINS / ALLOWED_ORIGINS still override everything when set,
// for a preview deployment on a domain nobody predicted.
const ALLOWED_DOMAINS = Deno.env.get('ALLOWED_SIWE_DOMAINS')
  ? listFrom(Deno.env.get('ALLOWED_SIWE_DOMAINS')!)
  : listFrom(PROD_DOMAINS, ALLOW_LOCALHOST ? LOCAL_DOMAINS : '');

const ALLOWED_ORIGINS = Deno.env.get('ALLOWED_ORIGINS')
  ? listFrom(Deno.env.get('ALLOWED_ORIGINS')!)
  : listFrom(PROD_ORIGINS, ALLOW_LOCALHOST ? LOCAL_ORIGINS : '');

// Messages older than 5 minutes are rejected as stale / replayed.
const MAX_AGE_MS = 5 * 60 * 1000;

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(origin), 'Content-Type': 'application/json' },
  });
}

function parseSiwe(message: string) {
  const address = (message.match(/\n(0x[a-fA-F0-9]{40})\n/)?.[1] ?? '') as `0x${string}`;
  const domain = message.match(/^(.+?) wants you to sign in/m)?.[1]?.trim() ?? '';
  const issuedAt = message.match(/^Issued At: (.+)$/m)?.[1]?.trim() ?? '';
  const expirationTime = message.match(/^Expiration Time: (.+)$/m)?.[1]?.trim() ?? '';
  return { address, domain, issuedAt, expirationTime };
}

function checkTimestamps(issuedAt: string, expirationTime: string): string | null {
  const issuedMs = new Date(issuedAt).getTime();
  if (isNaN(issuedMs)) return 'That sign-in request was not readable. Please try again.';
  if (issuedMs > Date.now() + 30_000) return 'Message issued in the future';
  if (Date.now() - issuedMs > MAX_AGE_MS) return 'That sign-in request expired. Sign in again.';
  if (expirationTime) {
    const exp = new Date(expirationTime).getTime();
    if (!isNaN(exp) && Date.now() > exp) return 'Message past expiration time';
  }
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsFor(origin) });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsFor(origin) });

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { message, signature } = body;

    if (typeof message !== 'string' || typeof signature !== 'string') {
      return json(origin, { error: 'message and signature are required strings' }, 400);
    }

    const { address, domain, issuedAt, expirationTime } = parseSiwe(message);

    // 1. Domain allowlist
    if (!ALLOWED_DOMAINS.has(domain)) {
      return json(origin, { error: 'Untrusted sign-in domain' }, 400);
    }

    // 2. Timestamp freshness
    const timeErr = checkTimestamps(issuedAt, expirationTime);
    if (timeErr) return json(origin, { error: timeErr }, 400);

    // 3. Address present
    if (!address || !address.startsWith('0x')) {
      return json(origin, { error: 'Ethereum address missing from message' }, 400);
    }

    // 4. Cryptographic signature verification (never skipped)
    // On chain first, so smart wallets can prove themselves at all. If that
    // call cannot be made (an RPC wobble, Base unreachable) fall back to plain
    // key recovery rather than locking every ordinary wallet out of sign-in.
    // The fallback is not a weakening: ECDSA recovery accepts a signature only
    // when it genuinely recovers to this address. It just cannot speak for a
    // contract wallet, which is the case the on-chain path is there for.
    // "Wrong signature" and "could not check" are different answers, and on the
    // sign-in path the difference decides whether somebody thinks their wallet
    // is broken or ours is. The public Base endpoint is rate limited, and when
    // it refuses, the ECDSA fallback cannot speak for a smart wallet, so
    // reporting a verification failure there would be untrue.
    const verifyArgs = { address, message, signature: signature as `0x${string}` };
    let valid = false;
    let couldNotCheck = false;
    try {
      valid = await publicClient.verifyMessage(verifyArgs);
    } catch {
      // One retry before giving up on the chain.
      try {
        valid = await publicClient.verifyMessage(verifyArgs);
      } catch {
        try {
          valid = await verifyMessageEcdsa(verifyArgs);
        } catch {
          valid = false;
        }
        if (!valid) couldNotCheck = true;
      }
    }

    if (couldNotCheck) {
      return json(origin, { error: 'Could not reach Base to check your signature. Nothing was changed, please try signing in again in a moment.' }, 503);
    }
    if (!valid) return json(origin, { error: 'Signature verification failed' }, 401);

    // 5. Find-or-create Supabase user keyed by wallet address
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const email = `wallet-${address.toLowerCase()}@wallet.songchainn.xyz`;

    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { wallet_address: address.toLowerCase(), provider: 'wallet' },
    });

    // An existing user is fine, we still issue an OTP below.
    //
    // RETURNING WALLET USERS WERE LOCKED OUT (12 Sep 2026). This used to match
    // only /already registered|already exists/, but Supabase now says "A user
    // with this email address has already BEEN registered", which neither
    // pattern matches. So every wallet that had signed in before got a 500 and
    // "Authentication failed", while a brand new wallet still worked, which is
    // why nobody noticed. Match the stable error CODE first and the wording only
    // as a fallback, so a rewording can never lock people out again.
    const code = (createErr as { code?: string } | null)?.code;
    const alreadyThere =
      code === 'email_exists' ||
      code === 'user_already_exists' ||
      /already (been )?registered|already exists/i.test(createErr?.message ?? '');
    if (createErr && !alreadyThere) {
      throw createErr;
    }

    // 6. Generate a one-time sign-in token (never emailed — returned directly to client)
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkErr || !link?.properties?.email_otp) {
      throw linkErr ?? new Error('OTP generation failed');
    }

    return json(origin, { email, otp: link.properties.email_otp });
  } catch (err: unknown) {
    console.error('[wallet-auth]', err instanceof Error ? err.message : err);
    return json(origin, { error: 'Authentication failed' }, 500);
  }
});
