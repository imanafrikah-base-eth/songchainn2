#!/usr/bin/env node
/**
 * Create a login for every artist already in the catalog.
 *
 * These artists have music on SONGCHAINN but no way to sign in as themselves,
 * because until now nothing could make an account an artist: setIsArtist() was
 * called fourteen times in AuthContext and every one passed false.
 *
 * This creates the account and completes onboarding so they land in the app
 * rather than in a setup wizard. Linking the account to the artist id, and the
 * blue tick, are done separately with admin rights, because artist_accounts is
 * deliberately not writable by the person it describes: an artist must not be
 * able to appoint or verify themselves.
 *
 * Run:  node scripts/create-artist-accounts.mjs
 * Then hand each row to its artist privately, and have them change the password.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function env(name, files = ['.env.local', '.env']) {
  for (const file of files) {
    let text;
    try { text = readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch { continue; }
    const line = text.split(/\r?\n/).find((l) => l.startsWith(name + '='));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const anon = env('VITE_SUPABASE_ANON_KEY');
const ref = JSON.parse(Buffer.from(anon.split('.')[1], 'base64').toString('utf8')).ref;
const url = env('VITE_SUPABASE_URL') || `https://${ref}.supabase.co`;

/** The artists with catalog on the platform. Town squares are not artists. */
const ARTISTS = [
  { id: '1',  name: '7ROO7H BASED' },
  { id: '2',  name: 'DenaJah' },
  { id: '3',  name: 'IMan Afrikah' },
  { id: '4',  name: 'NDA' },
  { id: '5',  name: 'PRP' },
  { id: '6',  name: 'Sanchy' },
  { id: '7',  name: 'Santana' },
  { id: '8',  name: 'FAITH' },
  { id: '9',  name: 'JMN' },
  { id: '10', name: 'SAMMIE' },
  { id: '11', name: 'N3M3SIS' },
];

const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Readable but not guessable: three short words plus digits beats a random
 * blob when it has to be typed on a phone by someone reading it off a message.
 */
const WORDS = ['amber','river','stone','ember','cedar','delta','flint','grove','ivory','maple',
               'north','onyx','pearl','quartz','raven','sable','tide','umber','verse','wren'];
function password() {
  const pick = () => WORDS[randomBytes(1)[0] % WORDS.length];
  const digits = String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, '0');
  return `${pick()}-${pick()}-${digits}`;
}

const results = [];

for (const artist of ARTISTS) {
  const email = `${slug(artist.name)}@artists.songchainn.xyz`;
  const pass = password();
  // A fresh client per artist: signUp sets the session on the client, and we do
  // not want artist N's session still attached when creating artist N+1.
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await sb.auth.signUp({
    email,
    password: pass,
    options: { data: { display_name: artist.name, artist_id: artist.id } },
  });

  if (error) {
    // Already exists is fine and expected on a re-run; anything else is not.
    results.push({ ...artist, email, password: null, user_id: null, note: error.message });
    console.log(`  --  ${artist.name.padEnd(14)} ${error.message}`);
    continue;
  }

  const userId = data.user?.id ?? null;

  // Complete onboarding so they land in the app, not in a setup wizard.
  if (userId && data.session) {
    await sb.from('audience_profiles').upsert(
      {
        id: userId,
        user_id: userId,
        profile_name: slug(artist.name),
        display_name: artist.name,
        onboarding_completed: true,
      },
      { onConflict: 'id' },
    );
  }

  results.push({ ...artist, email, password: pass, user_id: userId, note: 'created' });
  console.log(`  OK  ${artist.name.padEnd(14)} ${email}`);
}

writeFileSync('artist-credentials.json', JSON.stringify(results, null, 2));
console.log('\nWrote artist-credentials.json');
console.log('Link + verify these with admin rights, then hand each row over privately.');
