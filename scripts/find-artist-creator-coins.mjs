/**
 * Find which SONGCHAINN artists already have a Zora Creator Coin, and what it
 * is worth. Read-only.
 *
 * Handles are guessed from each artist's name, so a miss here means "not found
 * under the handles we tried", NOT "they do not have one". Any artist who comes
 * back MISSING should simply be asked for their Zora profile link.
 *
 *   node scripts/find-artist-creator-coins.mjs
 */
import { getProfile } from '@zoralabs/coins-sdk';

const ARTISTS = [
  '7ROO7H BASED', 'DenaJah', 'IMan Afrikah', 'NDA', 'PRP',
  'Sanchy', 'Santana', 'FAITH', 'JMN', 'SAMMIE', 'N3M3SIS',
];

/** Plausible Zora handles for a display name. */
function handleGuesses(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const noSpace = name.toLowerCase().replace(/\s+/g, '');
  const firstWord = name.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
  const leet = base.replace(/7/g, 't').replace(/3/g, 'e').replace(/0/g, 'o');
  return [...new Set([base, noSpace, firstWord, leet].filter((h) => h.length >= 2))];
}

async function lookup(name) {
  for (const handle of handleGuesses(name)) {
    try {
      const res = await getProfile({ identifier: handle });
      const p = res?.data?.profile;
      if (!p) continue;
      return { handle, profile: p };
    } catch {
      // keep trying the other guesses
    }
  }
  return null;
}

const rows = [];
for (const name of ARTISTS) {
  const hit = await lookup(name);
  if (!hit) {
    rows.push({ name, status: 'NOT FOUND', handle: '', coin: '', mcap: null });
    continue;
  }
  const cc = hit.profile.creatorCoin;
  rows.push({
    name,
    status: cc ? 'HAS CREATOR COIN' : 'profile only, no coin',
    handle: '@' + (hit.profile.handle ?? hit.handle),
    coin: cc?.address ?? '',
    mcap: cc?.marketCap != null ? Number(cc.marketCap) : null,
  });
}

console.log('\nSONGCHAINN ARTISTS ON ZORA');
console.log('='.repeat(94));
console.log(
  'ARTIST'.padEnd(16) + 'STATUS'.padEnd(24) + 'HANDLE'.padEnd(18) +
  'MARKET CAP'.padStart(12) + '  COIN',
);
console.log('-'.repeat(94));

let total = 0;
for (const r of rows.sort((a, b) => (b.mcap ?? -1) - (a.mcap ?? -1))) {
  if (r.mcap) total += r.mcap;
  console.log(
    r.name.padEnd(16) +
      r.status.padEnd(24) +
      r.handle.padEnd(18) +
      (r.mcap != null ? ('$' + r.mcap.toLocaleString(undefined, { maximumFractionDigits: 0 })) : '-').padStart(12) +
      '  ' + (r.coin ? r.coin.slice(0, 10) + '...' : ''),
  );
}

console.log('-'.repeat(94));
const withCoin = rows.filter((r) => r.coin).length;
console.log(withCoin + ' of ' + ARTISTS.length + ' have a creator coin we could find.');
console.log('Combined market cap of those found: $' + total.toLocaleString(undefined, { maximumFractionDigits: 0 }));
console.log('\nNOT FOUND means the guessed handles missed. Ask those artists for their');
console.log('Zora profile link rather than assuming they have nothing.');
