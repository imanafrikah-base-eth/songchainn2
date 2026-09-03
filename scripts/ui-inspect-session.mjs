#!/usr/bin/env node
/**
 * Mint a signed-in session for the UI inspector.
 *
 * Without this the inspector is close to useless: signed out, every guarded
 * route redirects to the landing page, so a scan measures one page N times and
 * reports "no overflow" for screens it never loaded. That false pass is how a
 * cut-off button reached a real user.
 *
 * Creates (or reuses) a throwaway account and writes a Playwright storageState
 * containing the Supabase session, exactly where the browser keeps it.
 *
 *   node scripts/ui-inspect-session.mjs
 *   node scripts/ui-inspect.mjs --storage .ui-inspect-session.json
 *
 * The account is a normal, unprivileged user. Never point this at a real one.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ORIGIN = process.env.UI_INSPECT_ORIGIN ?? 'http://localhost:5173';
const OUT = '.ui-inspect-session.json';

function env(name, files = ['.env.local', '.env']) {
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8').replace(/^﻿/, ''); // the file has a BOM
    } catch {
      continue;
    }
    const line = text.split(/\r?\n/).find((l) => l.startsWith(name + '='));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const anon = env('VITE_SUPABASE_ANON_KEY');
if (!anon) {
  console.error('VITE_SUPABASE_ANON_KEY not found in .env.local or .env');
  process.exit(1);
}

/**
 * The project ref is inside the anon key. Deriving it beats depending on
 * VITE_SUPABASE_URL, which is not set in this checkout even though the app
 * runs, and which would make this script fail for a reason unrelated to the UI.
 */
function refFromKey(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString('utf8')).ref ?? '';
  } catch {
    return '';
  }
}

const configuredUrl = env('VITE_SUPABASE_URL');
const ref = refFromKey(anon) || (configuredUrl ? new URL(configuredUrl).hostname.split('.')[0] : '');
if (!ref) {
  console.error('Could not work out the Supabase project ref from the anon key');
  process.exit(1);
}
const url = configuredUrl || `https://${ref}.supabase.co`;

// Stable credentials so repeated runs reuse one account instead of littering.
const email = process.env.UI_INSPECT_EMAIL ?? 'ui-inspector@songchainn.test';
const password = process.env.UI_INSPECT_PASSWORD ?? 'ui-inspect-' + ref;

const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let { data, error } = await supabase.auth.signInWithPassword({ email, password });

if (error) {
  const signUp = await supabase.auth.signUp({ email, password });
  if (signUp.error) {
    console.error('Could not create the inspector account:', signUp.error.message);
    console.error(
      'If sign-ups require email confirmation, confirm this address once by hand, then re-run.',
    );
    process.exit(1);
  }
  data = signUp.data;
}

if (!data?.session) {
  console.error(
    'Signed up but no session came back, which usually means email confirmation is on.\n' +
      'Confirm ' + email + ' once, then re-run this script.',
  );
  process.exit(1);
}

// This is the shape and key supabase-js reads back in the browser.
const storageKey = `sb-${ref}-auth-token`;
const value = JSON.stringify({
  access_token: data.session.access_token,
  refresh_token: data.session.refresh_token,
  expires_at: data.session.expires_at,
  expires_in: data.session.expires_in,
  token_type: 'bearer',
  user: data.session.user,
});

writeFileSync(
  OUT,
  JSON.stringify(
    { cookies: [], origins: [{ origin: ORIGIN, localStorage: [{ name: storageKey, value }] }] },
    null,
    2,
  ),
);

console.log(`Session for ${email} written to ${OUT}`);
console.log(`Now run: node scripts/ui-inspect.mjs --storage ${OUT}`);
