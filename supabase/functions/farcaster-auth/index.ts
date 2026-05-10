// Farcaster Sign-In With Farcaster (SIWF) verification edge function.
// Flow: client gets SIWE message+signature from sdk.actions.signIn() →
// sends here → we verify cryptographically → issue a Supabase magic-link OTP →
// client calls supabase.auth.verifyOtp() to establish a real session.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyMessage } from 'npm:viem';

const ALLOWED_DOMAINS = new Set([
  'songchainn.xyz',
  'app.songchainn.xyz',
  'localhost:5173',
  'localhost:8080',
]);

// Messages older than 5 minutes are rejected as stale / replayed.
const MAX_AGE_MS = 5 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function parseSiwe(message: string) {
  const address = (message.match(/\n(0x[a-fA-F0-9]{40})\n/)?.[1] ?? '') as `0x${string}`;
  const domain = message.match(/^(.+?) wants you to sign in/m)?.[1]?.trim() ?? '';
  const issuedAt = message.match(/^Issued At: (.+)$/m)?.[1]?.trim() ?? '';
  const expirationTime = message.match(/^Expiration Time: (.+)$/m)?.[1]?.trim() ?? '';
  const fid = (() => {
    const m = message.match(/farcaster:\/\/fid\/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  })();
  return { address, domain, issuedAt, expirationTime, fid };
}

function checkTimestamps(issuedAt: string, expirationTime: string): string | null {
  const issuedMs = new Date(issuedAt).getTime();
  if (isNaN(issuedMs)) return 'Invalid issuedAt timestamp';
  if (issuedMs > Date.now() + 30_000) return 'Message issued in the future';
  if (Date.now() - issuedMs > MAX_AGE_MS) return 'Message expired — sign in again';
  if (expirationTime) {
    const exp = new Date(expirationTime).getTime();
    if (!isNaN(exp) && Date.now() > exp) return 'Message past expiration time';
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { message, signature } = body;

    if (typeof message !== 'string' || typeof signature !== 'string') {
      return json({ error: 'message and signature are required strings' }, 400);
    }

    const { address, domain, issuedAt, expirationTime, fid } = parseSiwe(message);

    // 1. Domain allowlist
    if (!ALLOWED_DOMAINS.has(domain)) {
      return json({ error: 'Untrusted sign-in domain' }, 400);
    }

    // 2. Timestamp freshness
    const timeErr = checkTimestamps(issuedAt, expirationTime);
    if (timeErr) return json({ error: timeErr }, 400);

    // 3. Address present
    if (!address || !address.startsWith('0x')) {
      return json({ error: 'Ethereum address missing from message' }, 400);
    }

    // 4. Cryptographic signature verification (never skipped)
    const valid = await verifyMessage({ address, message, signature: signature as `0x${string}` });
    if (!valid) return json({ error: 'Signature verification failed' }, 401);

    // 5. FID required
    if (!fid || isNaN(fid)) return json({ error: 'Farcaster FID missing from message' }, 400);

    // 6. Find-or-create Supabase user keyed by FID
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const email = `fid-${fid}@farcaster.songchainn.xyz`;

    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { farcaster_fid: fid, farcaster_address: address, provider: 'farcaster' },
    });

    // Ignore "already registered" — existing user is fine, we'll still issue an OTP below.
    if (createErr && !/already registered|already exists/i.test(createErr.message)) {
      throw createErr;
    }

    // 7. Generate a one-time sign-in token (never emailed — returned directly to client)
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkErr || !link?.properties?.email_otp) {
      throw linkErr ?? new Error('OTP generation failed');
    }

    return json({ email, otp: link.properties.email_otp });
  } catch (err: unknown) {
    console.error('[farcaster-auth]', err instanceof Error ? err.message : err);
    // Never leak internal details to the client
    return json({ error: 'Authentication failed' }, 500);
  }
});
