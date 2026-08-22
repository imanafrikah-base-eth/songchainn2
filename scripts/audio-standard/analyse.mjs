// SONGCHAINN catalog audio analyser.
// Streams each track through ffmpeg once: ebur128 (loudness/true peak) on one branch,
// raw f32le PCM on the other, and measures the rest here. Appends one JSON object per
// track to results.jsonl so the run is resumable.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DIR = import.meta.dirname;
const CATALOG = path.join(DIR, 'catalog.json');
const RESULTS = path.join(DIR, 'results.jsonl');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};
const LIMIT = Number(arg('limit', 0));
const CONC = Number(arg('conc', 4));
const FFMPEG = arg('ffmpeg', path.join(DIR, 'ffmpeg', 'bin', 'ffmpeg.exe'));

const SR = 44100;            // analysis sample rate
const FFT_N = 4096;          // window size
const FFT_STRIDE = 4;        // analyse every Nth window (CPU saver)
const BLOCK_MS = 100;        // block size for noise-floor percentiles

// ---------------------------------------------------------------- FFT (radix-2)
function makeFFT(n) {
  const levels = Math.log2(n) | 0;
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i, r = 0;
    for (let j = 0; j < levels; j++) { r = (r << 1) | (x & 1); x >>= 1; }
    rev[i] = r;
  }
  return function fft(re, im) {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tre = re[l] * cos[k] + im[l] * sin[k];
          const tim = -re[l] * sin[k] + im[l] * cos[k];
          re[l] = re[j] - tre; im[l] = im[j] - tim;
          re[j] += tre; im[j] += tim;
        }
      }
    }
  };
}
const fft = makeFFT(FFT_N);
const hann = new Float64Array(FFT_N);
for (let i = 0; i < FFT_N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1));
// coherent gain of the Hann window, so band levels stay comparable to time-domain RMS
const HANN_POWER = hann.reduce((a, w) => a + w * w, 0) / FFT_N;

const BANDS = [
  ['sub', 20, 60],
  ['bass', 60, 250],
  ['lowMid', 250, 500],
  ['mid', 500, 2000],
  ['highMid', 2000, 6000],
  ['presence', 6000, 12000],
  ['top', 12000, 20000],
];

const db = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const dbp = v => (v > 0 ? 10 * Math.log10(v) : -Infinity);

// ---------------------------------------------------------------- per-track analysis
function newState() {
  return {
    n: 0,
    peakL: 0, peakR: 0,
    sumL2: 0, sumR2: 0, sumLR: 0,
    sumM2: 0, sumS2: 0,
    dcL: 0, dcR: 0,
    clipL: 0, clipR: 0, over: 0,
    clipRuns: 0, runL: 0, runR: 0,
    blockAcc: 0, blockN: 0, blockSize: Math.round((SR * BLOCK_MS) / 1000),
    blocks: [],
    fftBuf: new Float64Array(FFT_N), fftFill: 0, fftIdx: 0,
    spec: new Float64Array(FFT_N / 2 + 1), specCount: 0,
    leftover: Buffer.alloc(0),
  };
}

const FS = 0.9999695; // 32767/32768 — full scale for 16-bit sourced material

function consume(st, buf) {
  if (st.leftover.length) { buf = Buffer.concat([st.leftover, buf]); st.leftover = Buffer.alloc(0); }
  const frames = Math.floor(buf.length / 8); // 2ch * 4 bytes
  const rem = buf.length - frames * 8;
  for (let i = 0; i < frames; i++) {
    const o = i * 8;
    const L = buf.readFloatLE(o);
    const R = buf.readFloatLE(o + 4);
    const aL = Math.abs(L), aR = Math.abs(R);

    st.n++;
    if (aL > st.peakL) st.peakL = aL;
    if (aR > st.peakR) st.peakR = aR;
    st.sumL2 += L * L; st.sumR2 += R * R; st.sumLR += L * R;
    st.dcL += L; st.dcR += R;
    const M = (L + R) * 0.5, S = (L - R) * 0.5;
    st.sumM2 += M * M; st.sumS2 += S * S;

    if (aL >= FS) { st.clipL++; st.runL++; } else { if (st.runL >= 4) st.clipRuns++; st.runL = 0; }
    if (aR >= FS) { st.clipR++; st.runR++; } else { if (st.runR >= 4) st.clipRuns++; st.runR = 0; }
    if (aL > 1 || aR > 1) st.over++;

    st.blockAcc += M * M;
    if (++st.blockN >= st.blockSize) {
      st.blocks.push(st.blockAcc / st.blockN);
      st.blockAcc = 0; st.blockN = 0;
    }

    st.fftBuf[st.fftFill++] = M;
    if (st.fftFill === FFT_N) {
      if (st.fftIdx % FFT_STRIDE === 0) {
        const re = new Float64Array(FFT_N), im = new Float64Array(FFT_N);
        for (let k = 0; k < FFT_N; k++) re[k] = st.fftBuf[k] * hann[k];
        fft(re, im);
        for (let k = 0; k <= FFT_N / 2; k++) {
          st.spec[k] += (re[k] * re[k] + im[k] * im[k]);
        }
        st.specCount++;
      }
      st.fftIdx++;
      st.fftFill = 0;
    }
  }
  if (rem) st.leftover = buf.subarray(frames * 8);
}

function finish(st) {
  if (!st.n) return null;
  const rmsL = Math.sqrt(st.sumL2 / st.n);
  const rmsR = Math.sqrt(st.sumR2 / st.n);
  const rms = Math.sqrt((st.sumL2 + st.sumR2) / (2 * st.n));
  const peak = Math.max(st.peakL, st.peakR);
  const corr = st.sumLR / (Math.sqrt(st.sumL2) * Math.sqrt(st.sumR2) || 1);
  const rmsM = Math.sqrt(st.sumM2 / st.n);
  const rmsS = Math.sqrt(st.sumS2 / st.n);

  // noise floor: 5th percentile of 100 ms block RMS, ignoring digital silence
  const nz = st.blocks.filter(b => b > 0).sort((a, b) => a - b);
  const pct = p => (nz.length ? nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] : 0);
  const silentBlocks = st.blocks.length - nz.length;

  // spectrum
  const bandE = {};
  let totalE = 0, centroidNum = 0, centroidDen = 0;
  const binHz = SR / FFT_N;
  const power = new Float64Array(FFT_N / 2 + 1);
  for (let k = 0; k <= FFT_N / 2; k++) {
    // normalise: window power, FFT length, number of windows, and one-sided doubling
    let p = st.spec[k] / (st.specCount || 1) / (FFT_N * FFT_N * HANN_POWER);
    if (k > 0 && k < FFT_N / 2) p *= 2;
    power[k] = p;
    totalE += p;
    const f = k * binHz;
    centroidNum += f * p; centroidDen += p;
  }
  for (const [name, lo, hi] of BANDS) {
    let e = 0;
    for (let k = Math.ceil(lo / binHz); k <= Math.min(FFT_N / 2, Math.floor(hi / binHz)); k++) e += power[k];
    bandE[name] = e;
  }
  // spectral rolloff: frequency below which 99% / 99.9% of energy sits (catches band-limited/lossy masters)
  const roll = target => {
    let acc = 0;
    for (let k = 0; k <= FFT_N / 2; k++) {
      acc += power[k];
      if (acc >= target * totalE) return k * binHz;
    }
    return SR / 2;
  };

  const out = {
    durationSec: +(st.n / SR).toFixed(2),
    samplePeakDbfs: +db(peak).toFixed(2),
    samplePeakLDbfs: +db(st.peakL).toFixed(2),
    samplePeakRDbfs: +db(st.peakR).toFixed(2),
    rmsDbfs: +db(rms).toFixed(2),
    crestFactorDb: +(db(peak) - db(rms)).toFixed(2),
    clippedSamples: st.clipL + st.clipR,
    clippedRuns: st.clipRuns,
    samplesOverFullScale: st.over,
    clippedPct: +(((st.clipL + st.clipR) / (2 * st.n)) * 100).toFixed(5),
    noiseFloorDbfs: +dbp(pct(0.05)).toFixed(2),
    blockRmsP50Dbfs: +dbp(pct(0.5)).toFixed(2),
    silentBlockPct: +((silentBlocks / (st.blocks.length || 1)) * 100).toFixed(2),
    stereoCorrelation: +corr.toFixed(4),
    sideToMidDb: +(db(rmsS) - db(rmsM)).toFixed(2),
    monoSumDeltaDb: +(db(rmsM) - db(rms)).toFixed(2),
    dcOffsetL: +(st.dcL / st.n).toFixed(6),
    dcOffsetR: +(st.dcR / st.n).toFixed(6),
    channelBalanceDb: +(db(rmsL) - db(rmsR)).toFixed(2),
    spectralCentroidHz: +(centroidNum / (centroidDen || 1)).toFixed(0),
    rolloff99Hz: +roll(0.99).toFixed(0),
    rolloff999Hz: +roll(0.999).toFixed(0),
    bands: {},
    bandsAbsDb: {},
  };
  for (const [name] of BANDS) {
    out.bands[name] = +(10 * Math.log10((bandE[name] || 1e-30) / (totalE || 1e-30))).toFixed(2);
    out.bandsAbsDb[name] = +dbp(bandE[name]).toFixed(2);
  }
  // tilt: presence+top energy vs sub+bass energy, a one-number "brightness" of the master
  const lowE = (bandE.sub || 0) + (bandE.bass || 0);
  const highE = (bandE.presence || 0) + (bandE.top || 0);
  out.spectralTiltDb = +(10 * Math.log10((highE || 1e-30) / (lowE || 1e-30))).toFixed(2);
  return out;
}

// ---------------------------------------------------------------- ffmpeg driver
function parseEbur128(stderr) {
  const out = {};
  const grab = (re, key, mul = 1) => {
    const m = stderr.match(re);
    if (m) out[key] = +(parseFloat(m[1]) * mul).toFixed(2);
  };
  const tail = stderr.slice(-6000);
  grab(/Integrated loudness:[\s\S]*?I:\s*(-?[\d.]+)\s*LUFS/, 'integratedLufs');
  grab(/Integrated loudness:[\s\S]*?Threshold:\s*(-?[\d.]+)\s*LUFS/, 'integratedThresholdLufs');
  grab(/Loudness range:[\s\S]*?LRA:\s*(-?[\d.]+)\s*LU/, 'loudnessRangeLu');
  grab(/LRA low:\s*(-?[\d.]+)\s*LUFS/, 'lraLowLufs');
  grab(/LRA high:\s*(-?[\d.]+)\s*LUFS/, 'lraHighLufs');
  const tp = tail.match(/True peak:[\s\S]*?Peak:\s*(-?[\d.]+)\s*dBFS/);
  if (tp) out.truePeakDbtp = +parseFloat(tp[1]).toFixed(2);
  return out;
}

function parseBanner(stderr) {
  const out = {};
  const dur = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (dur) out.containerDurationSec = +(+dur[1] * 3600 + +dur[2] * 60 + parseFloat(dur[3])).toFixed(2);
  const br = stderr.match(/Duration:.*?bitrate:\s*(\d+)\s*kb\/s/);
  if (br) out.containerBitrateKbps = +br[1];
  const st = stderr.match(/Stream #0:0.*?:\s*Audio:\s*([a-z0-9_]+)[^,]*,\s*(\d+)\s*Hz,\s*([a-z0-9.() ]+?),\s*([a-z0-9]+)(?:,\s*(\d+)\s*kb\/s)?/i);
  if (st) {
    out.codec = st[1];
    out.sourceSampleRate = +st[2];
    out.sourceChannels = st[3].trim();
    out.sourceSampleFmt = st[4];
    if (st[5]) out.streamBitrateKbps = +st[5];
  }
  return out;
}

function analyseOne(song) {
  return new Promise(resolve => {
    const st = newState();
    let errHead = '', errTail = '';
    const args = [
      '-hide_banner', '-nostdin',
      '-i', song.url,
      '-filter_complex', '[0:a]asplit=2[a1][a2];[a2]ebur128=peak=true:framelog=quiet[a2o]',
      '-map', '[a1]', '-ac', '2', '-ar', String(SR), '-f', 'f32le', 'pipe:1',
      '-map', '[a2o]', '-f', 'null', '-',
    ];
    const p = spawn(FFMPEG, args, { windowsHide: true });
    p.stdout.on('data', b => consume(st, b));
    p.stderr.on('data', b => {
      const s = b.toString();
      if (errHead.length < 6000) errHead += s;
      errTail = (errTail + s).slice(-8000);
    });
    p.on('error', e => resolve({ ...song, ok: false, error: `spawn: ${e.message}` }));
    p.on('close', code => {
      const stderr = errHead + '\n' + errTail;
      const measured = finish(st);
      if (!measured) return resolve({ ...song, ok: false, code, error: 'no audio decoded', stderrTail: errTail.slice(-800) });
      resolve({
        ...song,
        ok: code === 0,
        code,
        ...parseBanner(stderr),
        ...parseEbur128(stderr),
        ...measured,
      });
    });
  });
}

// ---------------------------------------------------------------- runner
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
let todo = catalog.filter(s => s.status === 200);
// dedupe by url
const seenUrl = new Set();
todo = todo.filter(s => (seenUrl.has(s.url) ? false : (seenUrl.add(s.url), true)));

const already = new Set();
if (fs.existsSync(RESULTS)) {
  for (const line of fs.readFileSync(RESULTS, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.ok) already.add(r.url); } catch {}
  }
}
todo = todo.filter(s => !already.has(s.url));
if (LIMIT) todo = todo.slice(0, LIMIT);

console.log(`ffmpeg: ${FFMPEG}`);
console.log(`to analyse: ${todo.length}  (already done: ${already.size})  concurrency ${CONC}`);
const totalMb = todo.reduce((a, s) => a + (s.bytes || 0), 0) / 1048576;
console.log(`bytes to stream: ${(totalMb / 1024).toFixed(2)} GB\n`);

const out = fs.createWriteStream(RESULTS, { flags: 'a' });
const t0 = Date.now();
let done = 0, failed = 0;
const queue = [...todo];

await Promise.all(
  Array.from({ length: CONC }, async () => {
    while (queue.length) {
      const song = queue.shift();
      const r = await analyseOne(song);
      out.write(JSON.stringify(r) + '\n');
      done++;
      if (!r.ok) failed++;
      const mins = (Date.now() - t0) / 60000;
      const rate = done / mins;
      const eta = rate > 0 ? (todo.length - done) / rate : 0;
      console.log(
        `[${String(done).padStart(3)}/${todo.length}] ${r.ok ? 'ok  ' : 'FAIL'} ` +
        `${(r.integratedLufs ?? '?').toString().padStart(6)} LUFS  ` +
        `TP ${(r.truePeakDbtp ?? '?').toString().padStart(5)}  ` +
        `crest ${(r.crestFactorDb ?? '?').toString().padStart(5)}  ` +
        `${(song.title || '').slice(0, 34)}` +
        (r.ok ? '' : `  <-- ${(r.error || 'code ' + r.code)}`) +
        `   [eta ${eta.toFixed(0)}m]`
      );
    }
  })
);

out.end();
console.log(`\ndone. ${done - failed} ok, ${failed} failed, in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
