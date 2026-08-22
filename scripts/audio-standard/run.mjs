// Streams every catalog track and measures it. WAV is parsed natively (no decoder);
// anything else is decoded by ffmpeg if a binary is available. Appends one JSON object
// per track to results.jsonl, and is resumable.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createAnalyser } from './core.mjs';

const DIR = import.meta.dirname;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const has = n => argv.includes(`--${n}`);

const LIMIT = Number(arg('limit', 0));
const CONC = Number(arg('conc', 3));
const ONLY = arg('only', '');            // 'wav' | 'mp3' | ''
const RESULTS = path.join(DIR, arg('out', 'results.jsonl'));
const FFMPEG = arg('ffmpeg', path.join(DIR, 'ffmpeg', 'bin', 'ffmpeg.exe'));
const HAVE_FFMPEG = fs.existsSync(FFMPEG);

// ---------------------------------------------------------------- WAV parsing
class WavStream {
  constructor() {
    this.buf = Buffer.alloc(0);
    this.fmt = null;
    this.inData = false;
    this.dataLeft = Infinity;
    this.analyser = null;
    this.rem = Buffer.alloc(0);
  }
  push(chunk) {
    if (!this.inData) {
      this.buf = Buffer.concat([this.buf, chunk]);
      if (!this.parseHeader()) return;
      chunk = this.buf; // remainder after header
      this.buf = Buffer.alloc(0);
    }
    if (!this.inData) return;
    this.feed(chunk);
  }
  parseHeader() {
    const b = this.buf;
    if (b.length < 12) return false;
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('not a RIFF/WAVE file');
    }
    let off = 12;
    while (off + 8 <= b.length) {
      const id = b.toString('ascii', off, off + 4);
      const size = b.readUInt32LE(off + 4);
      if (id === 'fmt ') {
        if (off + 8 + size > b.length) return false;
        let format = b.readUInt16LE(off + 8);
        const channels = b.readUInt16LE(off + 10);
        const sampleRate = b.readUInt32LE(off + 12);
        const bits = b.readUInt16LE(off + 22);
        if (format === 0xfffe && size >= 40) format = b.readUInt16LE(off + 8 + 24); // EXTENSIBLE
        this.fmt = { format, channels, sampleRate, bits };
        off += 8 + size + (size % 2);
      } else if (id === 'data') {
        if (!this.fmt) throw new Error('data chunk before fmt');
        this.dataTotal = size;
        this.dataLeft = size === 0 || size === 0xffffffff ? Infinity : size;
        this.inData = true;
        this.analyser = createAnalyser(this.fmt.sampleRate, this.fmt.channels);
        this.buf = b.subarray(off + 8);
        return true;
      } else {
        if (off + 8 + size > b.length) return false; // need more to skip this chunk
        off += 8 + size + (size % 2);
      }
    }
    return false;
  }
  feed(chunk) {
    if (this.dataLeft <= 0) return;
    if (chunk.length > this.dataLeft) chunk = chunk.subarray(0, this.dataLeft);
    this.dataLeft -= chunk.length;
    if (this.rem.length) { chunk = Buffer.concat([this.rem, chunk]); this.rem = Buffer.alloc(0); }

    const { format, channels, bits } = this.fmt;
    const bytesPerSample = bits >> 3;
    const frameBytes = bytesPerSample * channels;
    const frames = Math.floor(chunk.length / frameBytes);
    const used = frames * frameBytes;
    if (used < chunk.length) this.rem = Buffer.from(chunk.subarray(used));
    if (!frames) return;

    const a = this.analyser;
    for (let i = 0; i < frames; i++) {
      const o = i * frameBytes;
      let L = 0, R = 0;
      for (let c = 0; c < Math.min(2, channels); c++) {
        const p = o + c * bytesPerSample;
        let v;
        if (format === 3) {
          v = bits === 64 ? chunk.readDoubleLE(p) : chunk.readFloatLE(p);
        } else if (bits === 16) {
          v = chunk.readInt16LE(p) / 32768;
        } else if (bits === 24) {
          v = ((chunk[p] | (chunk[p + 1] << 8) | (chunk[p + 2] << 16)) << 8) / 2147483648;
        } else if (bits === 32) {
          v = chunk.readInt32LE(p) / 2147483648;
        } else if (bits === 8) {
          v = (chunk[p] - 128) / 128;
        } else {
          throw new Error(`unsupported bit depth ${bits}`);
        }
        if (c === 0) L = v; else R = v;
      }
      a.pushFrame(L, channels > 1 ? R : L);
    }
  }
  finish() {
    if (!this.analyser) throw new Error('no data chunk found');
    // Integrity gate: if the connection dropped mid-track we have measured a partial
    // file. Silently reporting that as a finished analysis is worse than failing.
    if (Number.isFinite(this.dataLeft) && this.dataLeft > 0) {
      throw new Error(`truncated: ${this.dataLeft} of ${this.dataTotal} data bytes missing`);
    }
    const out = this.analyser.finish();
    return { ...out, sourceFormatTag: this.fmt.format, sourceBits: this.fmt.bits, codec: this.fmt.format === 3 ? 'pcm_f' : `pcm_s${this.fmt.bits}` };
  }
}

// ---------------------------------------------------------------- fetch with retry
// The retry MUST rebuild all parser/analyser state. Retrying inside a single stream
// would replay bytes into an analyser that already consumed the first attempt's data
// and silently produce garbage that still looks like a valid result.
// Failures against r2.dev are UND_ERR_CONNECT_TIMEOUT and ENOTFOUND, i.e. the link and
// the resolver buckling under sustained load rather than anything being down (every host
// shows both successes and failures). So: patient backoff, and run the sweep at conc 1.
const ATTEMPTS = Number(arg('attempts', 10));
const detail = e => {
  let s = String(e.message || e);
  let c = e.cause, d = 0;
  while (c && d++ < 3) { s += ` <- ${c.code || c.name || ''} ${c.message || ''}`.trimEnd(); c = c.cause; }
  return s;
};

async function withRetry(label, fn) {
  let lastErr;
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < ATTEMPTS - 1) {
        // exponential backoff with jitter, capped at 45s, so a flaky resolver gets time
        // to recover instead of being hammered by tightly spaced retries
        const base = Math.min(45000, 2000 * Math.pow(2, i));
        await new Promise(r => setTimeout(r, base + Math.floor(Math.random() * 1500)));
      }
    }
  }
  throw new Error(detail(lastErr));
}

// Archive destinations: measure and save in the same pass so the catalog crosses the
// wire once. Written to <dest>.part and renamed only on a clean, complete read.
const MANIFEST = path.join(DIR, 'manifest.json');
const destByUrl = new Map();
if (fs.existsSync(MANIFEST) && !has('no-save')) {
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  for (const it of man.items) destByUrl.set(it.url, it.dest);
}
const archived = url => {
  const d = destByUrl.get(url);
  return d && fs.existsSync(d) ? d : null;
};

function openSink(url, expectedBytes) {
  const dest = destByUrl.get(url);
  if (!dest) return null;
  if (fs.existsSync(dest) && expectedBytes && fs.statSync(dest).size === expectedBytes) return null;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  return { dest, tmp, stream: fs.createWriteStream(tmp) };
}
async function commitSink(sink, expectedBytes) {
  if (!sink) return;
  await new Promise((res, rej) => sink.stream.end(err => (err ? rej(err) : res())));
  const got = fs.statSync(sink.tmp).size;
  if (expectedBytes && got !== expectedBytes) {
    fs.unlinkSync(sink.tmp);
    throw new Error(`archive size mismatch: wrote ${got} of ${expectedBytes}`);
  }
  fs.renameSync(sink.tmp, sink.dest);
}
function abortSink(sink) {
  if (!sink) return;
  try { sink.stream.destroy(); } catch {}
  try { if (fs.existsSync(sink.tmp)) fs.unlinkSync(sink.tmp); } catch {}
}

async function analyseWav(song) {
  return withRetry(song.title, async () => {
    const w = new WavStream();               // fresh state every attempt
    const res = await fetch(song.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const expected = Number(res.headers.get('content-length') || 0);
    const sink = openSink(song.url, expected);
    let seen = 0;
    try {
      for await (const chunk of res.body) {
        const b = Buffer.from(chunk);
        seen += b.length;
        w.push(b);
        if (sink && !sink.stream.write(b)) {
          await new Promise(r => sink.stream.once('drain', r));
        }
      }
      if (expected && seen !== expected) throw new Error(`short read: ${seen} of ${expected} bytes`);
      const out = w.finish();                 // throws if the wav data chunk is incomplete
      await commitSink(sink, expected);
      return { ...out, archivedTo: sink ? sink.dest : archived(song.url) };
    } catch (e) {
      abortSink(sink);
      throw e;
    }
  });
}

// MP3 via the mpg123 wasm decoder, fed through the identical measurement core so the
// mp3 and wav halves of the catalog are directly comparable.
async function analyseMp3(song) {
  const { MPEGDecoder } = await import('mpg123-decoder');
  return withRetry(song.title, async () => {
    const res = await fetch(song.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const expected = Number(res.headers.get('content-length') || 0);
    if (expected && bytes.length !== expected) {
      throw new Error(`truncated: got ${bytes.length} of ${expected} bytes`);
    }
    const dest = destByUrl.get(song.url);
    if (dest && !(fs.existsSync(dest) && fs.statSync(dest).size === bytes.length)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest + '.part', bytes);
      fs.renameSync(dest + '.part', dest);
    }
    const decoder = new MPEGDecoder();
    await decoder.ready;
    try {
      const { channelData, samplesDecoded, sampleRate } = decoder.decode(bytes);
      if (!samplesDecoded) throw new Error('decoder returned no samples');
      const nch = channelData.length;
      const a = createAnalyser(sampleRate, nch);
      const L = channelData[0], R = nch > 1 ? channelData[1] : channelData[0];
      for (let i = 0; i < samplesDecoded; i++) a.pushFrame(L[i], R[i]);
      const out = a.finish();
      // rough bitrate from file size and decoded duration
      const kbps = out.durationSec ? Math.round((bytes.length * 8) / out.durationSec / 1000) : null;
      return { ...out, codec: 'mp3', containerBitrateKbps: kbps, fileBytes: bytes.length, archivedTo: dest || null };
    } finally {
      decoder.free();
    }
  });
}

// Re-measure from the E: archive. Same core, zero network, so metrics can be revised
// or added without re-downloading the catalog.
async function analyseLocal(song, isWav) {
  const src = destByUrl.get(song.url);
  if (!src) throw new Error('not in manifest');
  if (!fs.existsSync(src)) throw new Error('not archived locally');
  if (isWav) {
    const w = new WavStream();
    await new Promise((res, rej) => {
      const rs = fs.createReadStream(src);
      rs.on('data', c => w.push(c));
      rs.on('error', rej);
      rs.on('end', res);
    });
    return { ...w.finish(), archivedTo: src, source: 'local' };
  }
  const { MPEGDecoder } = await import('mpg123-decoder');
  const bytes = new Uint8Array(fs.readFileSync(src));
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    const { channelData, samplesDecoded, sampleRate } = decoder.decode(bytes);
    if (!samplesDecoded) throw new Error('decoder returned no samples');
    const nch = channelData.length;
    const a = createAnalyser(sampleRate, nch);
    const L = channelData[0], R = nch > 1 ? channelData[1] : channelData[0];
    for (let i = 0; i < samplesDecoded; i++) a.pushFrame(L[i], R[i]);
    const out = a.finish();
    const kbps = out.durationSec ? Math.round((bytes.length * 8) / out.durationSec / 1000) : null;
    return { ...out, codec: 'mp3', containerBitrateKbps: kbps, fileBytes: bytes.length, archivedTo: src, source: 'local' };
  } finally {
    decoder.free();
  }
}

// (kept for reference; unused unless an ffmpeg binary is present)
function analyseViaFfmpeg(song) {
  return new Promise((resolve, reject) => {
    // probe rate/channels from the banner, then analyse the decoded stream
    const p = spawn(FFMPEG, [
      '-hide_banner', '-nostdin', '-i', song.url,
      '-map', '0:a:0', '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1',
    ], { windowsHide: true });

    let banner = '';
    let analyser = null;
    let srcRate = 44100, srcCh = 2, codec = null, bitrate = null;
    let rem = Buffer.alloc(0);
    let started = false;

    p.stderr.on('data', b => { if (banner.length < 8000) banner += b.toString(); });

    const ensure = () => {
      if (started) return;
      const m = banner.match(/Stream #0:\d+.*?:\s*Audio:\s*([a-z0-9_]+)[^,]*,\s*(\d+)\s*Hz,\s*([a-z0-9.() ]+?),/i);
      if (m) { codec = m[1]; srcRate = +m[2]; srcCh = /mono/i.test(m[3]) ? 1 : 2; }
      const br = banner.match(/Duration:.*?bitrate:\s*(\d+)\s*kb\/s/);
      if (br) bitrate = +br[1];
      analyser = createAnalyser(srcRate, srcCh);
      started = true;
    };

    p.stdout.on('data', b => {
      ensure();
      if (rem.length) { b = Buffer.concat([rem, b]); rem = Buffer.alloc(0); }
      const frameBytes = 4 * srcCh;
      const frames = Math.floor(b.length / frameBytes);
      const used = frames * frameBytes;
      if (used < b.length) rem = Buffer.from(b.subarray(used));
      for (let i = 0; i < frames; i++) {
        const o = i * frameBytes;
        const L = b.readFloatLE(o);
        const R = srcCh > 1 ? b.readFloatLE(o + 4) : L;
        analyser.pushFrame(L, R);
      }
    });

    p.on('error', reject);
    p.on('close', code => {
      if (!analyser) return reject(new Error(`ffmpeg produced no audio (code ${code}): ${banner.slice(-300)}`));
      const out = analyser.finish();
      if (!out) return reject(new Error('no frames decoded'));
      resolve({ ...out, codec, containerBitrateKbps: bitrate });
    });
  });
}

// ---------------------------------------------------------------- runner
const catalog = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8'));
const seenUrl = new Set();
let todo = catalog
  .filter(s => s.status === 200)
  .filter(s => (seenUrl.has(s.url) ? false : (seenUrl.add(s.url), true)));

if (ONLY === 'wav') todo = todo.filter(s => /\.wav$/i.test(s.url));
if (ONLY === 'mp3') todo = todo.filter(s => !/\.wav$/i.test(s.url));
const nonAudio = todo.filter(s => !/\.(wav|mp3)$/i.test(s.url));
if (nonAudio.length) {
  console.log(`note: skipping ${nonAudio.length} tracks that are neither wav nor mp3`);
  todo = todo.filter(s => /\.(wav|mp3)$/i.test(s.url));
}

const done = new Set();
if (fs.existsSync(RESULTS)) {
  for (const line of fs.readFileSync(RESULTS, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.ok) done.add(r.url); } catch {}
  }
}
// Re-fetch anything that is measured but not yet archived, so one pass satisfies both.
todo = todo.filter(s => !(done.has(s.url) && (!destByUrl.has(s.url) || archived(s.url))));
if (LIMIT) todo = todo.slice(0, LIMIT);

const totalMb = todo.reduce((a, s) => a + (s.bytes || 0), 0) / 1048576;
console.log(`ffmpeg: ${HAVE_FFMPEG ? FFMPEG : 'NOT AVAILABLE (wav only)'}`);
console.log(`to analyse: ${todo.length}   already done: ${done.size}   conc ${CONC}   ${(totalMb / 1024).toFixed(2)} GB\n`);

const out = fs.createWriteStream(RESULTS, { flags: 'a' });
const t0 = Date.now();
let n = 0, failed = 0, mbDone = 0;
const queue = [...todo];
const num = v => (v === null || v === undefined ? '  ?  ' : Number(v).toFixed(1).padStart(6));

await Promise.all(Array.from({ length: CONC }, async () => {
  while (queue.length) {
    const song = queue.shift();
    let rec;
    try {
      const isWav = /\.wav$/i.test(song.url);
      const m = has('local') ? await analyseLocal(song, isWav)
        : isWav ? await analyseWav(song) : await analyseMp3(song);
      rec = { ...song, ok: true, path: isWav ? 'wav-native' : 'mp3-mpg123', ...m };
    } catch (e) {
      rec = { ...song, ok: false, error: String(e.message || e) };
      failed++;
    }
    out.write(JSON.stringify(rec) + '\n');
    n++;
    mbDone += (song.bytes || 0) / 1048576;
    const mins = (Date.now() - t0) / 60000;
    const eta = n > 0 ? ((todo.length - n) * mins) / n : 0;
    console.log(
      `[${String(n).padStart(3)}/${todo.length}] ${rec.ok ? 'ok ' : 'ERR'} ` +
      `${num(rec.integratedLufs)} LUFS  TP${num(rec.truePeakDbtp)}  crest${num(rec.crestFactorDb)}  ` +
      `${(song.artist || '').slice(0, 14).padEnd(15)}${(song.title || '').slice(0, 28).padEnd(29)}` +
      `${(mbDone / (mins * 60)).toFixed(2)}MB/s eta ${eta.toFixed(0)}m` +
      (rec.ok ? '' : `  <-- ${rec.error}`)
    );
  }
}));

out.end();
console.log(`\ndone: ${n - failed} ok, ${failed} failed, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
