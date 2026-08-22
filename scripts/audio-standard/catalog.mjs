// Parse songs out of musicData.ts, then HEAD every audio URL to get exact sizes.
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'C:/Users/7 RECORDS/Desktop/desktop/$ONGCHAINN/src/data/musicData.ts';
const OUT = path.join(import.meta.dirname, 'catalog.json');

const text = fs.readFileSync(SRC, 'utf8');

// Song object literals look like:  { id: '13', title: '7', artist: '7ROO7H BASED', ... audioUrl: '...' , ... }
// Split on audioUrl occurrences and walk backwards/forwards for the sibling fields.
const field = (blob, name) => {
  const m = blob.match(new RegExp(`\\b${name}:\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`));
  return m ? m[2] : null;
};

const songs = [];
// crude but reliable: split the file into brace-balanced object chunks that contain audioUrl
const re = /audioUrl:\s*(['"])((?:\\.|(?!\1).)*)\1/g;
let m;
while ((m = re.exec(text)) !== null) {
  const url = m[2];
  if (!/^https?:\/\//.test(url)) continue; // skips the `audioUrl: string;` interface line
  // window back to the opening brace of this object, forward to its close
  let start = text.lastIndexOf('{', m.index);
  let end = text.indexOf('}', m.index);
  // extend end past nested objects if needed
  const blob = text.slice(start, end + 1);
  songs.push({
    id: field(blob, 'id'),
    title: field(blob, 'title'),
    artist: field(blob, 'artist'),
    genre: field(blob, 'genre'),
    url,
  });
}

console.log(`parsed ${songs.length} songs from musicData.ts`);
const byExt = {};
for (const s of songs) {
  const ext = (s.url.split('?')[0].split('.').pop() || '?').toLowerCase();
  byExt[ext] = (byExt[ext] || 0) + 1;
}
console.log('by extension:', byExt);

const dupes = songs.length - new Set(songs.map(s => s.url)).size;
console.log(`duplicate urls: ${dupes}`);

// HEAD every url, 8 at a time
let done = 0;
async function head(s) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(s.url, { method: 'HEAD' });
      s.status = r.status;
      s.bytes = Number(r.headers.get('content-length') || 0);
      s.type = r.headers.get('content-type');
      s.acceptRanges = r.headers.get('accept-ranges');
      break;
    } catch (e) {
      s.status = 'ERR';
      s.error = String(e.message || e);
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  done++;
  if (done % 25 === 0) process.stdout.write(`  ...${done}/${songs.length}\n`);
}

const queue = [...songs];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (queue.length) await head(queue.shift());
  })
);

const ok = songs.filter(s => s.status === 200);
const bad = songs.filter(s => s.status !== 200);
const totalBytes = ok.reduce((a, s) => a + (s.bytes || 0), 0);

console.log(`\nreachable: ${ok.length}   unreachable: ${bad.length}`);
console.log(`total bytes: ${(totalBytes / 1073741824).toFixed(2)} GB`);
const wav = ok.filter(s => /\.wav$/i.test(s.url));
const mp3 = ok.filter(s => /\.mp3$/i.test(s.url));
const sum = a => a.reduce((x, s) => x + s.bytes, 0) / 1048576;
console.log(`  wav: ${wav.length} files, ${sum(wav).toFixed(0)} MB  (avg ${(sum(wav) / (wav.length || 1)).toFixed(1)} MB)`);
console.log(`  mp3: ${mp3.length} files, ${sum(mp3).toFixed(0)} MB  (avg ${(sum(mp3) / (mp3.length || 1)).toFixed(1)} MB)`);
if (bad.length) console.log('\nunreachable:', bad.slice(0, 15).map(s => `${s.title} [${s.status}]`));

fs.writeFileSync(OUT, JSON.stringify(songs, null, 2));
console.log(`\nwrote ${OUT}`);
