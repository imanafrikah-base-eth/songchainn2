// Farcaster auth edge function — handles two paths:
//   1. quickAuth JWT  { token }              — zero-tap, auto sign-in
//   2. SIWF           { message, signature } — manual button fallback
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyMessage } from 'npm:viem';
import { jwtVerify, createRemoteJWKSet } from 'https://esm.sh/jose@5.9.6';

const ALLOWED_DOMAINS = new Set([
  'songchainn.xyz',
  'app.songchainn.xyz',
  'localhost:5173',
  'localhost:8080',
]);

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

// Farcaster's public JWKS — used to verify quickAuth JWTs
const FARCASTER_JWKS = createRemoteJWKSet(
  new URL('https://auth.farcaster.xyz/.well-known/jwks.json'),
);

async function handleQuickAuth(token: string): Promise<{ fid: number; error?: string }> {
  try {
    const { payload } = await jwtVerify(token, FARCASTER_JWKS, {
      issuer: 'https://auth.farcaster.xyz',
    });
    const fid = Number(payload.sub);
    if (!fid || isNaN(fid)) return { fid: 0, error: 'Invalid FID in token' };
    return { fid };
  } catch (err: unknown) {
    return { fid: 0, error: `Token verification failed: ${err instanceof Error ? err.message : err}` };
  }
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

async function issueSupabaseSession(fid: number, metadata: Record<string, unknown>) {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const email = `fid-${fid}@farcaster.songchainn.xyz`;

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { farcaster_fid: fid, provider: 'farcaster', ...metadata },
  });

  if (createErr && !/already registered|already exists/i.test(createErr.message)) {
    throw createErr;
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkErr || !link?.properties?.email_otp) {
    throw linkErr ?? new Error('OTP generation failed');
  }

  return { email, otp: link.properties.email_otp };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    // ── PATH 1: quickAuth JWT ──────────────────────────────────────────────
    if (typeof body.token === 'string') {
      const { fid, error } = await handleQuickAuth(body.token);
      if (error || !fid) return json({ error: error ?? 'Invalid token' }, 401);

      const result = await issueSupabaseSession(fid, {});
      return json(result);
    }

    // ── PATH 2: SIWF message + signature ──────────────────────────────────
    const { message, signature } = body;
    if (typeof message !== 'string' || typeof signature !== 'string') {
      return json({ error: 'Provide either { token } or { message, signature }' }, 400);
    }

    const { address, domain, issuedAt, expirationTime, fid } = parseSiwe(message);

    if (!ALLOWED_DOMAINS.has(domain)) return json({ error: 'Untrusted sign-in domain' }, 400);

    const timeErr = checkTimestamps(issuedAt, expirationTime);
    if (timeErr) return json({ error: timeErr }, 400);

    if (!address || !address.startsWith('0x')) {
      return json({ error: 'Ethereum address missing from message' }, 400);
    }

    const valid = await verifyMessage({ address, message, signature: signature as `0x${string}` });
    if (!valid) return json({ error: 'Signature verification failed' }, 401);

    if (!fid || isNaN(fid)) return json({ error: 'Farcaster FID missing from message' }, 400);

    const result = await issueSupabaseSession(fid, { farcaster_address: address });
    return json(result);

  } catch (err: unknown) {
    console.error('[farcaster-auth]', err instanceof Error ? err.message : err);
    return json({ error: 'Authentication failed' }, 500);
  }
});
