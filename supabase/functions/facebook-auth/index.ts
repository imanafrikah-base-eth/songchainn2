// Facebook auth edge function
// Accepts: { facebook_id, access_token?, name?, email?, picture_url?, location? }
//   - With access_token: verifies with Facebook Graph API (secure path)
//   - Without access_token: context-only fallback (same as Farcaster PATH 0)
// Returns: { email, otp, isNewUser } for client to call supabase.auth.verifyOtp()

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function corsHeaders(_origin: string | null) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// Verify access_token by calling Graph API /me — the returned ID must match facebook_id.
async function verifyFacebookToken(accessToken: string, expectedId: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/me?access_token=${encodeURIComponent(accessToken)}&fields=id`,
    );
    if (!res.ok) {
      const text = await res.text();
      return { valid: false, error: `Facebook API ${res.status}: ${text}` };
    }
    const data = await res.json() as { id?: string; error?: { message: string } };
    if (data.error) return { valid: false, error: data.error.message };
    if (!data.id) return { valid: false, error: 'No id in Facebook response' };
    if (data.id !== expectedId) return { valid: false, error: 'Token user_id mismatch' };
    return { valid: true };
  } catch (err: unknown) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function issueSupabaseSession(facebookId: string, metadata: Record<string, unknown>) {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const email = `fb-${facebookId}@facebook.songchainn.xyz`;

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { facebook_id: facebookId, provider: 'facebook', ...metadata },
  });

  const isExistingUser = !!createErr && (
    (createErr as any).status === 422 ||
    /already registered|already exists|User already/i.test(createErr.message)
  );

  if (createErr && !isExistingUser) {
    console.error('[facebook-auth] createUser error:', createErr.message);
    throw createErr;
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkErr) {
    console.error('[facebook-auth] generateLink error:', linkErr.message);
    throw linkErr;
  }

  if (!link?.properties?.hashed_token) {
    throw new Error('OTP generation failed — hashed_token missing');
  }

  console.log('[facebook-auth] issuing session for facebook_id:', facebookId, 'isExistingUser:', isExistingUser);
  return { email, otp: link.properties.hashed_token, isNewUser: !isExistingUser };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(origin) });

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { facebook_id, access_token, name, email, picture_url, location } = body;

    if (typeof facebook_id !== 'string' || !facebook_id) {
      return json(origin, { error: 'facebook_id is required' }, 400);
    }

    const meta = {
      name: name ?? null,
      email: email ?? null,
      picture_url: picture_url ?? null,
      location: location ?? null,
    };

    // Verified path: access_token provided — validate with Facebook Graph API
    if (typeof access_token === 'string' && access_token) {
      const { valid, error: tokenErr } = await verifyFacebookToken(access_token, facebook_id);
      if (!valid) {
        console.error('[facebook-auth] token verification failed:', tokenErr);
        return json(origin, { error: tokenErr ?? 'Token verification failed' }, 401);
      }
    }
    // Context-only fallback: no access_token — issue session without Graph API check
    // (less secure; allows social features when token is unavailable)

    const result = await issueSupabaseSession(facebook_id, meta);
    return json(origin, result);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[facebook-auth] unhandled error:', msg);
    return json(origin, { error: 'Authentication failed' }, 500);
  }
});
