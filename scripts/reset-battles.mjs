#!/usr/bin/env node
/**
 * Empty BattleZone back to zero, ready for the first battle to be hosted.
 *
 * Everything is written to a local JSON backup before a single row is deleted,
 * because there is no undo on the other side of this.
 *
 *   node scripts/reset-battles.mjs           dry run, counts only
 *   node scripts/reset-battles.mjs --write   back up, then delete
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const WRITE = process.argv.includes('--write');

function env(name) {
  for (const file of ['../.env.local', '../.env']) {
    try {
      const text = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^﻿/, '');
      const line = text.split(/\r?\n/).find((l) => l.startsWith(name + '='));
      if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
    } catch { /* next */ }
  }
  return '';
}

const anon = env('VITE_SUPABASE_ANON_KEY');
const ref = JSON.parse(Buffer.from(anon.split('.')[1], 'base64').toString('utf8')).ref;
/* A service role key is what makes deleting possible. The anon key can READ
   these tables, but row level security discards its deletes without returning
   an error, so the client reports "removed 14 of 14" having removed nothing.
   The verification pass at the end is the only thing that tells the truth. */
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env('SUPABASE_SERVICE_ROLE_KEY');
const db = createClient(env('VITE_SUPABASE_URL') || `https://${ref}.supabase.co`, serviceKey || anon, {
  auth: { persistSession: false },
});
if (!serviceKey) {
  console.log('NOTE: no service role key found, running on the anon key.');
  console.log('      Deletes will be refused silently. Trust only the verification.\n');
}

/** Children before parents, so no foreign key ever blocks a delete. */
const TABLES = [
  'battle_room_messages',
  'battle_speaker_requests',
  'battle_votes',
  'battle_live_users',
  'battle_rooms',
  'battles',
];

const snapshot = {};
console.log('WHAT IS THERE NOW');
console.log('-'.repeat(46));
for (const t of TABLES) {
  const { data, error } = await db.from(t).select('*');
  if (error) {
    console.log(t.padEnd(28) + 'could not read: ' + error.message);
    snapshot[t] = [];
    continue;
  }
  snapshot[t] = data ?? [];
  console.log(t.padEnd(28) + (data?.length ?? 0) + ' rows');
}

if (!WRITE) {
  console.log('\nDRY RUN. Nothing deleted. Re-run with --write.');
} else {
  const file = `battlezone-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(new URL(file, import.meta.url), JSON.stringify(snapshot, null, 2));
  console.log('\nBacked up everything to scripts/' + file);

  console.log('\nDELETING');
  console.log('-'.repeat(46));
  for (const t of TABLES) {
    if (!snapshot[t].length) { console.log(t.padEnd(28) + 'already empty'); continue; }
    // Delete by primary key per row: safest, and it works whatever the key is.
    const key = 'id' in snapshot[t][0] ? 'id' : Object.keys(snapshot[t][0])[0];
    let removed = 0;
    for (const row of snapshot[t]) {
      const { error } = await db.from(t).delete().eq(key, row[key]);
      if (!error) removed++;
    }
    console.log(t.padEnd(28) + 'removed ' + removed + ' of ' + snapshot[t].length);
  }

  console.log('\nVERIFYING');
  console.log('-'.repeat(46));
  let clean = true;
  for (const t of TABLES) {
    const { count } = await db.from(t).select('*', { count: 'exact', head: true });
    console.log(t.padEnd(28) + (count ?? 0) + ' rows');
    if (count) clean = false;
  }
  console.log(clean ? '\nBattleZone is empty. Ready for the first battle.' : '\nSomething did not delete. See above.');
}
