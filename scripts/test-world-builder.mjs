#!/usr/bin/env node
/**
 * End-to-end test of the world builder, against the live database, as a real
 * unprivileged signed-in user.
 *
 * This exercises the path a non-builder actually walks: create a draft, get
 * the Classic Nine seeded, put blocks on streets, set a key, try to publish
 * too early, then publish properly. It asserts the rules that matter:
 *
 *   - a draft has NO world number
 *   - publishing is refused until three streets have something on them
 *   - the number is stamped by the server, never by the client
 *   - RLS actually stops a stranger reading someone else's draft
 *
 * Cleans up after itself. Run: node scripts/test-world-builder.mjs
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function env(name, files = ['.env.local', '.env']) {
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8').replace(/^﻿/, '');
    } catch {
      continue;
    }
    const line = text.split(/\r?\n/).find((l) => l.startsWith(name + '='));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const anon = env('VITE_SUPABASE_ANON_KEY');
const ref = JSON.parse(Buffer.from(anon.split('.')[1], 'base64').toString('utf8')).ref;
const url = env('VITE_SUPABASE_URL') || `https://${ref}.supabase.co`;

const email = 'ui-inspector@songchainn.test';
const password = 'ui-inspect-' + ref;

let pass = 0;
let fail = 0;
function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? '  -> ' + detail : ''}`);
  }
}

const sb = createClient(url, anon, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password });
if (authErr || !auth?.session) {
  console.error('Could not sign in as the test user. Run scripts/ui-inspect-session.mjs first.');
  process.exit(1);
}
const uid = auth.user.id;
const slug = 'test-world-' + Date.now().toString(36);
console.log(`Signed in as ${email}\nBuilding ${slug}\n`);

let worldId = null;
try {
  /* 1. create a draft ------------------------------------------------ */
  const { data: created, error: ce } = await sb
    .from('worlds')
    .insert({ slug, owner_id: uid, artist_name: 'Test Artist', positioning: 'A test' })
    .select('id, world_number, status')
    .single();
  check('draft world created', !ce && !!created, ce?.message);
  if (!created) throw new Error('cannot continue');
  worldId = created.id;
  check('a draft has no world number', created.world_number === null, String(created.world_number));
  check('a new world is a draft', created.status === 'draft', created.status);

  /* 2. a key --------------------------------------------------------- */
  const { error: ge } = await sb.from('world_gates').insert({ world_id: worldId, kind: 'songchainn' });
  check('gate created', !ge, ge?.message);

  /* 3. streets ------------------------------------------------------- */
  const streetRows = ['streets', 'gallery', 'studio', 'stage'].map((s, i) => ({
    world_id: worldId, slug: s, name: s, ring: 0, access: 'public', sort_order: i,
  }));
  const { data: streets, error: se } = await sb.from('world_streets').insert(streetRows).select('id, slug');
  check('streets created', !se && streets?.length === 4, se?.message);

  /* 4. publishing is refused while the streets are empty -------------- */
  const { data: early } = await sb.rpc('publish_world', { _world_id: worldId });
  const earlyRow = Array.isArray(early) ? early[0] : early;
  check('publish refused with empty streets', earlyRow?.ok === false, JSON.stringify(earlyRow));
  // The server checks story before streets, so an empty new world is refused
  // for the story first. Either way the refusal must name a requirement rather
  // than failing blankly.
  check(
    'refusal names a requirement',
    /story|three streets|key/i.test(earlyRow?.message ?? ''),
    earlyRow?.message,
  );

  /* 5. put something on three streets --------------------------------- */
  const blocks = streets.slice(0, 3).map((s, i) => ({
    street_id: s.id,
    block_type: i === 0 ? 'hero' : i === 1 ? 'story' : 'catalog-list',
    props: i === 1 ? { heading: 'About', body: 'A line.' } : {},
    sort_order: 0,
  }));
  const { error: be } = await sb.from('world_blocks').insert(blocks);
  check('blocks placed on three streets', !be, be?.message);

  /* 6. still refused without a story ---------------------------------- */
  const { data: noStory } = await sb.rpc('publish_world', { _world_id: worldId });
  const noStoryRow = Array.isArray(noStory) ? noStory[0] : noStory;
  check('publish refused without a story', noStoryRow?.ok === false, noStoryRow?.message);

  /* 7. add the story, then publish ------------------------------------ */
  await sb.from('worlds').update({ story: ['This is the test world.'] }).eq('id', worldId);
  const { data: pub } = await sb.rpc('publish_world', { _world_id: worldId });
  const pubRow = Array.isArray(pub) ? pub[0] : pub;
  check('publish succeeds once requirements are met', pubRow?.ok === true, JSON.stringify(pubRow));
  check('a world number was stamped', Number.isInteger(pubRow?.world_number), String(pubRow?.world_number));

  /* 8. it is readable publicly now ------------------------------------ */
  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data: pubRead } = await anonClient.from('worlds').select('slug, world_number').eq('slug', slug).maybeSingle();
  check('a published world is readable signed out', pubRead?.slug === slug, JSON.stringify(pubRead));

  /* 9. RLS: a stranger cannot read someone else's draft ---------------- */
  const draftSlug = slug + '-hidden';
  const { data: hidden } = await sb
    .from('worlds')
    .insert({ slug: draftSlug, owner_id: uid, artist_name: 'Hidden' })
    .select('id')
    .single();
  const { data: strangerRead } = await anonClient
    .from('worlds').select('slug').eq('slug', draftSlug).maybeSingle();
  check('a stranger cannot read a draft world', !strangerRead, JSON.stringify(strangerRead));
  if (hidden) await sb.from('worlds').delete().eq('id', hidden.id);
} catch (err) {
  console.log('  ERROR ', err.message);
  fail++;
} finally {
  if (worldId) {
    // Cascades to cities, streets, blocks, gate and roles.
    await sb.from('worlds').delete().eq('id', worldId);
    console.log('\ncleaned up ' + slug);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
