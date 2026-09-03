/**
 * The SONGCHAINN artist roster on Zora, from handles confirmed by IMan himself
 * on 1 Sep 2026. Read-only.
 */
import { getProfile } from '@zoralabs/coins-sdk';

const ROSTER = [
  ['IMan Afrikah', 'imanafrikah'],
  ['NDA', 'nda63'],
  ['Santana', 'santanaunofficial'],
  ['7ROO7H BASED', '7roo7h'],
  ['DenaJah', 'denaja_7'],
  ['Sanchy', 'sanchella'],
  ['PRP', 'purpose_prp'],
  ['SONGCHAINN (catalog)', 'songchainn'],
];

const rows = [];
for (const [name, handle] of ROSTER) {
  try {
    const res = await getProfile({ identifier: handle });
    const p = res?.data?.profile;
    if (!p) { rows.push({ name, handle, err: 'no profile returned' }); continue; }
    const cc = p.creatorCoin;
    rows.push({
      name, handle,
      display: p.displayName ?? '',
      wallet: p.publicWallet?.walletAddress ?? '',
      coin: cc?.address ?? '',
      mcap: cc?.marketCap != null ? Number(cc.marketCap) : null,
      holders: cc?.uniqueHolders ?? null,
    });
  } catch (e) {
    rows.push({ name, handle, err: String(e?.message || e).split('\n')[0].slice(0, 60) });
  }
}

console.log('\nSONGCHAINN ROSTER ON ZORA  (handles confirmed by IMan)');
console.log('='.repeat(100));
console.log('ARTIST'.padEnd(22) + 'HANDLE'.padEnd(20) + 'MCAP'.padStart(10) + '  HOLDERS  CREATOR COIN');
console.log('-'.repeat(100));
let total = 0, withCoin = 0;
for (const r of rows) {
  if (r.err) { console.log(r.name.padEnd(22) + ('@' + r.handle).padEnd(20) + '  ERROR: ' + r.err); continue; }
  if (r.mcap) total += r.mcap;
  if (r.coin) withCoin++;
  console.log(
    r.name.padEnd(22) + ('@' + r.handle).padEnd(20) +
    (r.mcap != null ? '$' + r.mcap.toLocaleString(undefined,{maximumFractionDigits:0}) : '-').padStart(10) +
    '  ' + String(r.holders ?? '-').padStart(7) + '  ' + (r.coin || 'NO CREATOR COIN YET'),
  );
}
console.log('-'.repeat(100));
console.log(withCoin + ' of ' + ROSTER.length + ' have a creator coin. Combined market cap $' +
  total.toLocaleString(undefined,{maximumFractionDigits:0}));

console.log('\nWALLETS (for artist_wallets / payout routing)');
console.log('-'.repeat(100));
for (const r of rows) if (!r.err) console.log(('@' + r.handle).padEnd(22) + (r.wallet || '(none published)'));
