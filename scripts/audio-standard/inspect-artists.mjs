import fs from 'node:fs';
const SRC = 'C:/Users/7 RECORDS/Desktop/desktop/$ONGCHAINN/src/data/musicData.ts';
const t = fs.readFileSync(SRC, 'utf8');

const field = (blob, name) => {
  const m = blob.match(new RegExp(`\\b${name}:\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`));
  return m ? m[2] : null;
};

const pairs = new Map();
const rows = [];
for (const m of t.matchAll(/audioUrl:\s*(['"])((?:\\.|(?!\1).)*)\1/g)) {
  if (!/^https?:/.test(m[2])) continue;
  const s = t.lastIndexOf('{', m.index), e = t.indexOf('}', m.index);
  const b = t.slice(s, e + 1);
  const r = {
    id: field(b, 'id'), title: field(b, 'title'),
    artist: field(b, 'artist'), artistId: field(b, 'artistId'),
    volume: field(b, 'volume'), townSquare: field(b, 'townSquare'),
    line: t.slice(0, m.index).split('\n').length,
  };
  rows.push(r);
  const k = `${r.artist}  ||  ${r.artistId}`;
  pairs.set(k, (pairs.get(k) || 0) + 1);
}

console.log('SONG ENTRIES:  artist || artistId  -> count');
for (const [k, v] of [...pairs].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k);

console.log('\nIMAN-ish rows grouped by (artist, artistId, volume):');
const iman = rows.filter(r => /iman/i.test(r.artist || ''));
const g = new Map();
for (const r of iman) {
  const k = `${r.artist} | ${r.artistId} | ${r.volume}`;
  if (!g.has(k)) g.set(k, []);
  g.get(k).push(r);
}
for (const [k, v] of g) console.log(`  ${String(v.length).padStart(3)}  ${k}   (lines ${v[0].line}-${v[v.length - 1].line})`);

// ARTISTS array entries
const aBlock = t.match(/export const ARTISTS: Artist\[\] = \[([\s\S]*?)\n\];/);
if (aBlock) {
  console.log('\nARTISTS entries:');
  for (const m of aBlock[1].matchAll(/\{[\s\S]*?\}/g)) {
    const id = field(m[0], 'id'), name = field(m[0], 'name');
    if (id || name) console.log(`  id=${JSON.stringify(id)}  name=${JSON.stringify(name)}`);
  }
}

// where else do the literals appear?
for (const lit of ['IMAN AFRIKAH', 'IMan Afrikah', 'iman-afrikah', 'IMAN_AFRIKAH']) {
  const n = t.split(lit).length - 1;
  console.log(`literal ${JSON.stringify(lit)} appears ${n}x in musicData.ts`);
}
