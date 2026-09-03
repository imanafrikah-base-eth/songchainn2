// Base Wallet SIWE (Sign-In with Ethereum) verification edge function.
// Flow: client builds EIP-4361 message + signs with wallet →
// sends here → we verify signature → issue Supabase magic-link OTP →
// client calls supabase.auth.verifyOtp() to establish a real session.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyMessage } from 'npm:viem';

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
    const valid = await verifyMessage({ address, message, signature: signature as `0x${string}` });
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

    // Ignore "already registered" — existing user is fine, we'll still issue an OTP below.
    if (createErr && !/already registered|already exists/i.test(createErr.message)) {
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
