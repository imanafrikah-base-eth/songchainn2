// Download the artwork set (catalog covers, per-track covers, artist images).
// Small files, so this runs separately from the audio pass.
import fs from 'node:fs';
import path from 'node:path';

const DIR = import.meta.dirname;
const { artItems } = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));

let ok = 0, skip = 0, fail = 0;
const failures = [];

async function grab(it) {
  if (fs.existsSync(it.dest) && fs.statSync(it.dest).size > 0) { skip++; return; }
  for (let a = 0; a < 5; a++) {
    try {
      const r = await fetch(it.url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const expected = Number(r.headers.get('content-length') || 0);
      if (expected && buf.length !== expected) throw new Error(`short read ${buf.length}/${expected}`);
      if (!buf.length) throw new Error('empty body');
      fs.mkdirSync(path.dirname(it.dest), { recursive: true });
      fs.writeFileSync(it.dest + '.part', buf);
      fs.renameSync(it.dest + '.part', it.dest);
      ok++;
      return;
    } catch (e) {
      if (a === 4) { fail++; failures.push(`${it.kind}  ${decodeURIComponent(it.url).slice(-60)}  ${e.message}`); }
      else await new Promise(r => setTimeout(r, 1500 * (a + 1)));
    }
  }
}

const q = [...artItems];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (q.length) await grab(q.shift());
}));

console.log(`artwork: ${ok} downloaded, ${skip} already present, ${fail} failed (of ${artItems.length})`);
for (const f of failures) console.log('  FAIL ' + f);
