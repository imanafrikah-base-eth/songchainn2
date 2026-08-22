// Build the archive manifest: every song mapped to
//   E:\$ONGCHAINN\<Artist>\<Catalog>\NN - Title.ext
// with the catalog artwork alongside it. Catalogs are the app's own grouping
// (artistId + volume), and track order is source order in musicData.ts, which is
// the order the app itself lists them in.
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'C:/Users/7 RECORDS/Desktop/desktop/$ONGCHAINN/src/data/musicData.ts';
const DEST_ROOT = 'E:\\$ONGCHAINN';
const OUT = path.join(import.meta.dirname, 'manifest.json');
const text = fs.readFileSync(SRC, 'utf8');

// ---- resolve `const NAME = 'url'` / `const NAME = import.meta.env.X || 'url'` / `const A = B;`
const consts = new Map();
for (const m of text.matchAll(/const\s+(\w+)\s*=\s*(?:import\.meta\.env\.\w+\s*\|\|\s*)?['"`](https?:[^'"`]+)['"`]/g)) {
  consts.set(m[1], m[2]);
}
for (const m of text.matchAll(/const\s+(\w+)\s*=\s*(\w+);/g)) {
  if (!consts.has(m[1]) && consts.has(m[2])) consts.set(m[1], consts.get(m[2]));
}
// second pass for aliases defined before their target
for (const m of text.matchAll(/const\s+(\w+)\s*=\s*(\w+);/g)) {
  if (!consts.has(m[1]) && consts.has(m[2])) consts.set(m[1], consts.get(m[2]));
}

// ---- ARTWORK_BY_ARTIST map
const artByArtist = new Map();
const abaBlock = text.match(/const ARTWORK_BY_ARTIST[^=]*=\s*\{([\s\S]*?)\n\};/);
if (abaBlock) {
  for (const m of abaBlock[1].matchAll(/(?:'([^']+)'|"([^"]+)"|(\w+))\s*:\s*(\w+)\s*,/g)) {
    const key = m[1] ?? m[2] ?? m[3];
    artByArtist.set(key, consts.get(m[4]) || null);
  }
}

const resolveCover = expr => {
  if (!expr) return null;
  expr = expr.trim().replace(/,$/, '');
  // backreference the opening quote: several artwork URLs contain apostrophes
  // (".../Er'ting flex/ER'TING FLEX ARTWORK.png"), which a naive [^'"] class truncates.
  let m = expr.match(/^(['"`])(https?:.*)\1$/);
  if (m) return m[2];
  m = expr.match(/^ARTWORK_BY_ARTIST\[['"]([^'"]+)['"]\]$/);
  if (m) return artByArtist.get(m[1]) ?? null;
  m = expr.match(/^ARTWORK_BY_ARTIST\.(\w+)$/);
  if (m) return artByArtist.get(m[1]) ?? null;
  if (/^\w+$/.test(expr)) return consts.get(expr) ?? null;
  return null;
};

// ---- parse song objects in source order
const field = (blob, name) => {
  const m = blob.match(new RegExp(`\\b${name}:\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`));
  return m ? m[2] : null;
};
const songs = [];
for (const m of text.matchAll(/audioUrl:\s*(['"])((?:\\.|(?!\1).)*)\1/g)) {
  const url = m[2];
  if (!/^https?:\/\//.test(url)) continue;
  const start = text.lastIndexOf('{', m.index);
  const end = text.indexOf('}', m.index);
  const blob = text.slice(start, end + 1);
  const rawCover = (blob.match(/coverImage:\s*([^,\n]+)/) || [])[1] ?? null;
  songs.push({
    id: field(blob, 'id'),
    title: field(blob, 'title'),
    artist: field(blob, 'artist'),
    artistId: field(blob, 'artistId'),
    genre: field(blob, 'genre'),
    volume: field(blob, 'volume') || 'Singles',
    url,
    coverUrl: resolveCover(rawCover),
    rawCover,
  });
}

// ---- windows-safe names
const safe = s => String(s ?? '')
  .replace(/[<>:"/\\|?*]/g, ' ')
  .replace(/[\x00-\x1f]/g, '')
  .replace(/\s+/g, ' ')
  .replace(/[. ]+$/, '')
  .trim() || 'Unknown';

// ---- group into catalogs, preserving source order.
// Group on the CASE-FOLDED artist name, not artistId: the catalog carries both
// "IMAN AFRIKAH" and "IMan Afrikah" as separate identities, and since Windows paths are
// case-insensitive they would land in one folder anyway and silently overwrite each
// other's track 01. Merging here keeps numbering continuous instead.
const nameVariants = new Map();
for (const s of songs) {
  const k = s.artist.toLowerCase().trim();
  if (!nameVariants.has(k)) nameVariants.set(k, new Map());
  const v = nameVariants.get(k);
  v.set(s.artist, (v.get(s.artist) || 0) + 1);
}
const canonical = new Map();
for (const [k, v] of nameVariants) {
  canonical.set(k, [...v.entries()].sort((a, b) => b[1] - a[1])[0][0]);
}
const merged = [...nameVariants.entries()].filter(([, v]) => v.size > 1);

const catalogs = new Map();
for (const s of songs) {
  const artistName = canonical.get(s.artist.toLowerCase().trim());
  const key = `${artistName.toLowerCase()}|${s.volume.toLowerCase()}`;
  if (!catalogs.has(key)) {
    catalogs.set(key, { artist: artistName, artistId: s.artistId, volume: s.volume, songs: [] });
  }
  catalogs.get(key).songs.push(s);
}

const extOf = u => {
  const e = (decodeURIComponent(u.split('?')[0]).split('.').pop() || '').toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(e) ? e : 'bin';
};

const items = [];       // audio downloads
const artItems = [];    // artwork downloads
const seenArt = new Set();

for (const [, cat] of catalogs) {
  const artistDir = path.join(DEST_ROOT, safe(cat.artist));
  const catDir = path.join(artistDir, safe(cat.volume));
  const width = String(cat.songs.length).length < 2 ? 2 : String(cat.songs.length).length;
  cat.songs.forEach((s, i) => {
    const track = String(i + 1).padStart(width, '0');
    items.push({
      ...s,
      track: i + 1,
      dest: path.join(catDir, `${track} - ${safe(s.title)}.${extOf(s.url)}`),
      catalogDir: catDir,
    });
    // per-track artwork when it differs from the catalog's first cover
    if (s.coverUrl && s.coverUrl !== cat.songs[0].coverUrl) {
      const d = path.join(catDir, `${track} - ${safe(s.title)}.${extOf(s.coverUrl)}`);
      if (!seenArt.has(d.toLowerCase())) { seenArt.add(d.toLowerCase()); artItems.push({ url: s.coverUrl, dest: d, kind: 'track-art' }); }
    }
  });
  const cover = cat.songs.find(s => s.coverUrl)?.coverUrl;
  if (cover) {
    const d = path.join(catDir, `artwork.${extOf(cover)}`);
    if (!seenArt.has(d.toLowerCase())) { seenArt.add(d.toLowerCase()); artItems.push({ url: cover, dest: d, kind: 'catalog-art' }); }
  }
}

// artist-level image, from ARTWORK_BY_ARTIST, one per canonical artist
for (const artist of new Set([...canonical.values()])) {
  const variants = [...(nameVariants.get(artist.toLowerCase().trim())?.keys() ?? [artist])];
  const u = variants.map(v => artByArtist.get(v) || artByArtist.get(v.toUpperCase())).find(Boolean);
  if (!u) continue;
  const d = path.join(DEST_ROOT, safe(artist), `artist.${extOf(u)}`);
  if (!seenArt.has(d.toLowerCase())) { seenArt.add(d.toLowerCase()); artItems.push({ url: u, dest: d, kind: 'artist-art' }); }
}

// ---- collision check: two songs must never target the same file
const destCount = new Map();
for (const it of [...items, ...artItems]) {
  const k = it.dest.toLowerCase();
  destCount.set(k, (destCount.get(k) || 0) + 1);
}
const collisions = [...destCount.entries()].filter(([, n]) => n > 1);

const unresolved = songs.filter(s => !s.coverUrl);
console.log(`songs:      ${songs.length}`);
console.log(`artists:    ${new Set(songs.map(s => s.artist)).size}`);
console.log(`catalogs:   ${catalogs.size}`);
console.log(`artwork:    ${artItems.length} files (${unresolved.length} songs have no resolvable cover)`);
if (unresolved.length) console.log('  unresolved cover exprs:', [...new Set(unresolved.map(s => s.rawCover))].slice(0, 6));
if (merged.length) {
  console.log('\nmerged duplicate artist spellings:');
  for (const [k, v] of merged) console.log(`  ${canonical.get(k)}  <-  ${[...v.keys()].join('  |  ')}`);
}
console.log(`\nfilename collisions: ${collisions.length}`);
for (const [d] of collisions.slice(0, 10)) console.log('  ' + d);

console.log('\nlayout preview:');
let shown = 0;
for (const [, cat] of catalogs) {
  if (shown++ >= 6) break;
  console.log(`  ${safe(cat.artist)}\\${safe(cat.volume)}\\  (${cat.songs.length} tracks)`);
}
console.log('\nper artist:');
const perArtist = {};
for (const [, c] of catalogs) {
  perArtist[c.artist] ??= { catalogs: 0, tracks: 0 };
  perArtist[c.artist].catalogs++;
  perArtist[c.artist].tracks += c.songs.length;
}
for (const [a, v] of Object.entries(perArtist).sort((x, y) => y[1].tracks - x[1].tracks)) {
  console.log(`  ${a.padEnd(24)} ${String(v.catalogs).padStart(2)} catalogs, ${String(v.tracks).padStart(3)} tracks`);
}

fs.writeFileSync(OUT, JSON.stringify({ root: DEST_ROOT, items, artItems }, null, 2));
console.log(`\nwrote ${OUT}`);
