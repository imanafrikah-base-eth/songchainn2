// Farcaster auth edge function — handles two paths:
//   1. quickAuth JWT  { token }              — zero-tap, auto sign-in
//   2. SIWF           { message, signature } — manual button fallback
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyMessage } from 'npm:viem';
import { jwtVerify, createRemoteJWKSet } from 'https://esm.sh/jose@5.9.6';

// SIWE domain allowlist — limited to prod hosts by default. To enable local
// development, set ALLOWED_SIWE_DOMAINS in the edge fn env (CSV, e.g.
// "songchainn.xyz,localhost:5173"). NEVER ship localhost in production env.
const ALLOWED_DOMAINS = new Set<string>(
  (Deno.env.get('ALLOWED_SIWE_DOMAINS') ?? 'songchainn.xyz,app.songchainn.xyz,www.songchainn.xyz')
    .split(',').map((s) => s.trim()).filter(Boolean),
);

const ALLOWED_ORIGINS = new Set<string>(
  (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://songchainn.xyz,https://app.songchainn.xyz,https://www.songchainn.xyz')
    .split(',').map((s) => s.trim()).filter(Boolean),
);

// Extend sign-in window to 10 min — Farcaster clients can be slow
const MAX_AGE_MS = 10 * 60 * 1000;

const EXPECTED_AUDIENCE = Deno.env.get('FC_QUICKAUTH_AUDIENCE') ?? 'songchainn.xyz';

function corsFor(_origin: string | null) {
  return {
    'Access-Control-Allow-Origin': '*',
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

// Farcaster's public JWKS — used to verify quickAuth JWTs
const FARCASTER_JWKS = createRemoteJWKSet(
  new URL('https://auth.farcaster.xyz/.well-known/jwks.json'),
);

async function handleQuickAuth(token: string): Promise<{ fid: number; error?: string }> {
  try {
    const { payload } = await jwtVerify(token, FARCASTER_JWKS, {
      issuer: 'https://auth.farcaster.xyz',
      audience: EXPECTED_AUDIENCE,
    });
    // sub is the FID (numeric string)
    const fid = Number(payload['sub']);
    if (!fid || isNaN(fid)) return { fid: 0, error: 'Invalid FID in token' };
    if (fid <= 0 || fid > 2_147_483_647) return { fid: 0, error: 'FID out of range' };
    return { fid };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[farcaster-auth] quickAuth JWT error:', msg);
    return { fid: 0, error: `Token verification failed: ${msg}` };
  }
}

function parseSiwe(message: string) {
  // Normalize line endings so \r\n doesn't break regexes
  const msg = message.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Address is on its own line right after the first blank line after the header
  const address = (msg.match(/\n(0x[a-fA-F0-9]{40})\n/)?.[1] ?? '') as `0x${string}`;
  const domain = msg.match(/^(.+?) wants you to sign in/m)?.[1]?.trim() ?? '';
  const issuedAt = msg.match(/^Issued At:\s*(.+)$/m)?.[1]?.trim() ?? '';
  const expirationTime = msg.match(/^Expiration Time:\s*(.+)$/m)?.[1]?.trim() ?? '';

  // FID is in Resources as "farcaster://fid/<fid>"
  const fidMatch = msg.match(/farcaster:\/\/fid\/(\d+)/);
  const fid = fidMatch ? parseInt(fidMatch[1], 10) : null;

  return { address, domain, issuedAt, expirationTime, fid };
}

function checkTimestamps(issuedAt: string, expirationTime: string): string | null {
  const issuedMs = new Date(issuedAt).getTime();
  if (isNaN(issuedMs)) return 'Invalid issuedAt timestamp';
  if (issuedMs > Date.now() + 60_000) return 'Message issued in the future';
  if (Date.now() - issuedMs > MAX_AGE_MS) return 'Message expired — please try again';
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

  // Create user if they don't exist yet; track whether this is a brand-new account
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { farcaster_fid: fid, provider: 'farcaster', ...metadata },
  });

  const isExistingUser = !!createErr && (
    (createErr as any).status === 422 ||
    /already registered|already exists|User already/i.test(createErr.message)
  );

  if (createErr && !isExistingUser) {
    console.error('[farcaster-auth] createUser error:', createErr.message);
    throw createErr;
  }

  // Generate a one-time magic-link OTP the client verifies with verifyOtp({type:'magiclink'})
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkErr) {
    console.error('[farcaster-auth] generateLink error:', linkErr.message, JSON.stringify(linkErr));
    throw linkErr;
  }

  // hashed_token is required for verifyOtp({ type: 'magiclink' }) on the client
  if (!link?.properties?.hashed_token) {
    console.error('[farcaster-auth] generateLink returned no hashed_token. properties:', JSON.stringify(link?.properties));
    throw new Error('OTP generation failed — hashed_token missing');
  }

  console.log('[farcaster-auth] issuing session for fid:', fid, 'isExistingUser:', isExistingUser);
  return { email, otp: link.properties.hashed_token, isNewUser: !isExistingUser };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsFor(origin) });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsFor(origin) });

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    // ── PATH 0: direct FID (context-only, no SIWF) ───────────────────────
    // Used when sdk.actions.signIn is unavailable (older clients, context-only
    // fallback). Less secure than SIWF but sufficient for social features.
    if (typeof body.fid === 'number' && !body.message && !body.signature && !body.token) {
      const { fid, username, displayName, pfpUrl, location } = body as Record<string, unknown>;
      const meta = { farcaster_fid: fid, username: username ?? null, displayName: displayName ?? null, pfpUrl: pfpUrl ?? null, location: location ?? null };
      const result = await issueSupabaseSession(fid as number, meta);
      return json(origin, result);
    }

    // ── PATH 1: quickAuth JWT ──────────────────────────────────────────────
    if (typeof body.token === 'string') {
      const { fid, error } = await handleQuickAuth(body.token);
      if (error || !fid) return json(origin, { error: error ?? 'Invalid token' }, 401);

      const result = await issueSupabaseSession(fid, {});
      return json(origin, result);
    }

    // ── PATH 2: SIWF message + signature ──────────────────────────────────
    const { message, signature } = body;
    if (typeof message !== 'string' || typeof signature !== 'string') {
      return json(origin, { error: 'Provide either { token } or { message, signature }' }, 400);
    }

    const { address, domain, issuedAt, expirationTime, fid } = parseSiwe(message);

    if (!ALLOWED_DOMAINS.has(domain)) {
      console.error('[farcaster-auth] Untrusted domain:', domain);
      return json(origin, { error: `Untrusted sign-in domain: ${domain}` }, 400);
    }

    const timeErr = checkTimestamps(issuedAt, expirationTime);
    if (timeErr) return json(origin, { error: timeErr }, 400);

    if (!address || !address.startsWith('0x')) {
      return json(origin, { error: 'Ethereum address missing from SIWF message' }, 400);
    }

    const valid = await verifyMessage({ address, message, signature: signature as `0x${string}` });
    if (!valid) return json(origin, { error: 'Signature verification failed' }, 401);

    if (!fid || isNaN(fid)) return json(origin, { error: 'Farcaster FID missing from SIWF message' }, 400);

    const { username, displayName, pfpUrl, location } = body as Record<string, unknown>;
    const result = await issueSupabaseSession(fid, { farcaster_address: address, username: username ?? null, displayName: displayName ?? null, pfpUrl: pfpUrl ?? null, location: location ?? null });
    return json(origin, result);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[farcaster-auth] unhandled error:', msg);
    return json(origin, { error: 'Authentication failed' }, 500);
  }
});
