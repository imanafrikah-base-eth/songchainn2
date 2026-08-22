// Shared measurement core. Feed it interleaved Float32 frames at the file's native rate;
// it returns the full metric set. Loudness follows ITU-R BS.1770-4 (K-weighting +
// gated 400 ms blocks), true peak uses 4x polyphase oversampling.

// ---------------------------------------------------------------- biquad
function biquad(b, a) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return function step(x) {
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// BS.1770-4 K-weighting, coefficients derived for the actual sample rate
// (same derivation libebur128/pyloudnorm use; reduces to the spec's tabulated
// 48 kHz values exactly).
export function kWeightFilters(fs) {
  const shelfF0 = 1681.974450955533, shelfQ = 0.7071752369554196, shelfDb = 3.999843853973347;
  let K = Math.tan((Math.PI * shelfF0) / fs);
  const Vh = Math.pow(10, shelfDb / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / shelfQ + K * K;
  const shelfB = [
    (Vh + (Vb * K) / shelfQ + K * K) / a0,
    (2 * (K * K - Vh)) / a0,
    (Vh - (Vb * K) / shelfQ + K * K) / a0,
  ];
  const shelfA = [1, (2 * (K * K - 1)) / a0, (1 - K / shelfQ + K * K) / a0];

  const hpF0 = 38.13547087602444, hpQ = 0.5003270373218204;
  K = Math.tan((Math.PI * hpF0) / fs);
  const den = 1 + K / hpQ + K * K;
  const hpB = [1, -2, 1];
  const hpA = [1, (2 * (K * K - 1)) / den, (1 - K / hpQ + K * K) / den];

  return { shelfB, shelfA, hpB, hpA };
}

// ---------------------------------------------------------------- true peak (4x)
// Windowed-sinc polyphase interpolator, 4 phases x 24 taps.
const TP_OS = 4, TP_TAPS = 24;
const TP_GATE = 0.25;   // -12 dBFS; below this no window can overshoot into the range we gate on
function makeTpFilter() {
  const phases = [];
  for (let p = 0; p < TP_OS; p++) {
    const h = new Float64Array(TP_TAPS);
    let sum = 0;
    for (let n = 0; n < TP_TAPS; n++) {
      const t = n - TP_TAPS / 2 + 1 - p / TP_OS;
      const s = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (TP_TAPS - 1)); // Hamming
      h[n] = s * w;
      sum += h[n];
    }
    for (let n = 0; n < TP_TAPS; n++) h[n] /= sum; // unity DC gain per phase
    phases.push(h);
  }
  return phases;
}
const TP_PHASES = makeTpFilter();

// ---------------------------------------------------------------- FFT
function makeFFT(n) {
  const levels = Math.log2(n) | 0;
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
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
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
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
const FFT_N = 4096;
const fft = makeFFT(FFT_N);
const HANN = new Float64Array(FFT_N);
for (let i = 0; i < FFT_N; i++) HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1));
const HANN_POWER = HANN.reduce((a, w) => a + w * w, 0) / FFT_N;
const FFT_STRIDE = 4;

const BANDS = [
  ['sub', 20, 60], ['bass', 60, 250], ['lowMid', 250, 500], ['mid', 500, 2000],
  ['highMid', 2000, 6000], ['presence', 6000, 12000], ['top', 12000, 20000],
];

const db = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const dbp = v => (v > 0 ? 10 * Math.log10(v) : -Infinity);
const r2 = v => (Number.isFinite(v) ? +v.toFixed(2) : null);

// ---------------------------------------------------------------- analyser
export function createAnalyser(fs, channels) {
  const nch = Math.min(2, channels);
  const { shelfB, shelfA, hpB, hpA } = kWeightFilters(fs);
  const kf = [];
  for (let c = 0; c < nch; c++) kf.push({ s: biquad(shelfB, shelfA), h: biquad(hpB, hpA) });

  const blockLen = Math.round(0.4 * fs);       // 400 ms
  const hopLen = Math.round(0.1 * fs);         // 75% overlap
  const lraBlockLen = Math.round(3.0 * fs);
  const lraHopLen = Math.round(1.0 * fs);

  const st = {
    fs, channels, nch, n: 0,
    peak: [0, 0], sumSq: [0, 0], dc: [0, 0],
    sumLR: 0, sumM2: 0, sumS2: 0,
    clip: [0, 0], run: [0, 0], clipRuns: 0, over: 0,
    // loudness
    kAcc: new Float64Array(2), kN: 0, kRing: [], blockZ: [],
    lraAcc: new Float64Array(2), lraN: 0, lraZ: [],
    // true peak
    tpHist: [new Float64Array(TP_TAPS), new Float64Array(TP_TAPS)], truePeak: [0, 0], tpHot: [0, 0],
    // short-term rms blocks for noise floor
    nfAcc: 0, nfN: 0, nfLen: Math.round(0.1 * fs), nfBlocks: [],
    // spectrum
    fftBuf: new Float64Array(FFT_N), fftFill: 0, fftIdx: 0,
    spec: new Float64Array(FFT_N / 2 + 1), specCount: 0,
  };

  // sliding accumulators for gated blocks
  let kBlockPos = 0;
  const kHistory = [[], []]; // per-channel squared k-weighted, as hop-sized partial sums
  let hopAcc = new Float64Array(2), hopN = 0;
  let lraHopAcc = new Float64Array(2), lraHopN = 0;
  const kHops = [], lraHops = [];
  const HOPS_PER_BLOCK = Math.round(blockLen / hopLen);
  const LRA_HOPS_PER_BLOCK = Math.round(lraBlockLen / lraHopLen);

  const FS_LIMIT = 0.9999695;

  function pushFrame(L, R) {
    const ch = [L, nch > 1 ? R : L];
    st.n++;
    for (let c = 0; c < nch; c++) {
      const v = ch[c], a = Math.abs(v);
      if (a > st.peak[c]) st.peak[c] = a;
      st.sumSq[c] += v * v;
      st.dc[c] += v;
      if (a >= FS_LIMIT) { st.clip[c]++; st.run[c]++; }
      else { if (st.run[c] >= 4) st.clipRuns++; st.run[c] = 0; }
      if (a > 1) st.over++;

      // True peak: 4x oversample. Running the 24-tap polyphase filter on every sample
      // dominates total runtime, so only run it in the neighbourhood of loud samples.
      // Intersample overshoot is bounded well under +3 dB in practice, so a window whose
      // samples all sit below TP_GATE cannot produce a true peak above roughly -9 dBFS.
      // Everything we gate on (clipping, peaks near 0 dBFS) is far above that.
      const h = st.tpHist[c];
      h.copyWithin(0, 1);
      h[TP_TAPS - 1] = v;
      // Adaptive gate: only samples close to the running peak can raise it. A sample at
      // 0.7x the current peak cannot interpolate above it, since intersample overshoot
      // stays well under +3 dB (x1.41). Converges within the first loud passage.
      if (a >= TP_GATE && a >= 0.7 * st.truePeak[c]) st.tpHot[c] = TP_TAPS;
      if (st.tpHot[c] > 0) {
        st.tpHot[c]--;
        for (let p = 0; p < TP_OS; p++) {
          const ph = TP_PHASES[p];
          let acc = 0;
          for (let n = 0; n < TP_TAPS; n++) acc += h[n] * ph[n];
          const aa = acc < 0 ? -acc : acc;
          if (aa > st.truePeak[c]) st.truePeak[c] = aa;
        }
      }

      // K-weighted energy
      const y = kf[c].h(kf[c].s(v));
      hopAcc[c] += y * y;
      lraHopAcc[c] += y * y;
    }

    const M = nch > 1 ? (L + R) * 0.5 : L;
    const S = nch > 1 ? (L - R) * 0.5 : 0;
    st.sumLR += L * (nch > 1 ? R : L);
    st.sumM2 += M * M; st.sumS2 += S * S;

    st.nfAcc += M * M;
    if (++st.nfN >= st.nfLen) { st.nfBlocks.push(st.nfAcc / st.nfN); st.nfAcc = 0; st.nfN = 0; }

    st.fftBuf[st.fftFill++] = M;
    if (st.fftFill === FFT_N) {
      if (st.fftIdx % FFT_STRIDE === 0) {
        const re = new Float64Array(FFT_N), im = new Float64Array(FFT_N);
        for (let k = 0; k < FFT_N; k++) re[k] = st.fftBuf[k] * HANN[k];
        fft(re, im);
        for (let k = 0; k <= FFT_N / 2; k++) st.spec[k] += re[k] * re[k] + im[k] * im[k];
        st.specCount++;
      }
      st.fftIdx++;
      st.fftFill = 0;
    }

    // close a loudness hop
    if (++hopN >= hopLen) {
      kHops.push(Float64Array.from(hopAcc));
      hopAcc = new Float64Array(2); hopN = 0;
      if (kHops.length >= HOPS_PER_BLOCK) {
        const z = new Float64Array(2);
        for (let i = kHops.length - HOPS_PER_BLOCK; i < kHops.length; i++)
          for (let c = 0; c < nch; c++) z[c] += kHops[i][c];
        for (let c = 0; c < nch; c++) z[c] /= blockLen;
        st.blockZ.push(Float64Array.from(z));
        if (kHops.length > HOPS_PER_BLOCK * 2) kHops.splice(0, kHops.length - HOPS_PER_BLOCK);
      }
    }
    if (++lraHopN >= lraHopLen) {
      lraHops.push(Float64Array.from(lraHopAcc));
      lraHopAcc = new Float64Array(2); lraHopN = 0;
      if (lraHops.length >= LRA_HOPS_PER_BLOCK) {
        const z = new Float64Array(2);
        for (let i = lraHops.length - LRA_HOPS_PER_BLOCK; i < lraHops.length; i++)
          for (let c = 0; c < nch; c++) z[c] += lraHops[i][c];
        for (let c = 0; c < nch; c++) z[c] /= lraBlockLen;
        st.lraZ.push(Float64Array.from(z));
        if (lraHops.length > LRA_HOPS_PER_BLOCK * 2) lraHops.splice(0, lraHops.length - LRA_HOPS_PER_BLOCK);
      }
    }
  }

  // interleaved Float32Array / Array of frames
  function push(interleaved, frames, srcChannels) {
    for (let i = 0; i < frames; i++) {
      const o = i * srcChannels;
      const L = interleaved[o];
      const R = srcChannels > 1 ? interleaved[o + 1] : L;
      pushFrame(L, R);
    }
  }

  function loudnessFrom(blocks) {
    if (!blocks.length) return { lufs: null, kept: 0 };
    const l = blocks.map(z => {
      let s = 0;
      for (let c = 0; c < nch; c++) s += z[c]; // G = 1.0 for L and R
      return { z, l: s > 0 ? -0.691 + 10 * Math.log10(s) : -Infinity };
    });
    const abs = l.filter(x => x.l > -70);
    if (!abs.length) return { lufs: null, kept: 0 };
    let mean = new Float64Array(2);
    for (const x of abs) for (let c = 0; c < nch; c++) mean[c] += x.z[c];
    for (let c = 0; c < nch; c++) mean[c] /= abs.length;
    let ms = 0; for (let c = 0; c < nch; c++) ms += mean[c];
    const gamma = -0.691 + 10 * Math.log10(ms) - 10;
    const rel = abs.filter(x => x.l > gamma);
    if (!rel.length) return { lufs: null, kept: 0 };
    mean = new Float64Array(2);
    for (const x of rel) for (let c = 0; c < nch; c++) mean[c] += x.z[c];
    for (let c = 0; c < nch; c++) mean[c] /= rel.length;
    ms = 0; for (let c = 0; c < nch; c++) ms += mean[c];
    return { lufs: -0.691 + 10 * Math.log10(ms), kept: rel.length, threshold: gamma, all: l };
  }

  function finish() {
    if (!st.n) return null;
    const integrated = loudnessFrom(st.blockZ);

    // LRA: 3 s blocks, absolute gate -70, relative gate -20 LU
    let lra = null, lraLow = null, lraHigh = null;
    if (st.lraZ.length) {
      const l = st.lraZ.map(z => {
        let s = 0; for (let c = 0; c < nch; c++) s += z[c];
        return { z, l: s > 0 ? -0.691 + 10 * Math.log10(s) : -Infinity };
      });
      const abs = l.filter(x => x.l > -70);
      if (abs.length) {
        const mean = new Float64Array(2);
        for (const x of abs) for (let c = 0; c < nch; c++) mean[c] += x.z[c];
        let ms = 0; for (let c = 0; c < nch; c++) ms += mean[c] / abs.length;
        const gamma = -0.691 + 10 * Math.log10(ms) - 20;
        const rel = abs.filter(x => x.l > gamma).map(x => x.l).sort((a, b) => a - b);
        if (rel.length) {
          const at = q => rel[Math.min(rel.length - 1, Math.max(0, Math.round(q * (rel.length - 1))))];
          lraLow = at(0.10); lraHigh = at(0.95); lra = lraHigh - lraLow;
        }
      }
    }

    const rms = Math.sqrt((st.sumSq[0] + st.sumSq[nch > 1 ? 1 : 0]) / (2 * st.n));
    const rmsL = Math.sqrt(st.sumSq[0] / st.n);
    const rmsR = Math.sqrt(st.sumSq[nch > 1 ? 1 : 0] / st.n);
    const peak = Math.max(st.peak[0], st.peak[nch > 1 ? 1 : 0]);
    const truePeak = Math.max(st.truePeak[0], st.truePeak[nch > 1 ? 1 : 0]);
    const corr = nch > 1 ? st.sumLR / (Math.sqrt(st.sumSq[0]) * Math.sqrt(st.sumSq[1]) || 1) : 1;
    const rmsM = Math.sqrt(st.sumM2 / st.n);
    const rmsS = Math.sqrt(st.sumS2 / st.n);

    const nz = st.nfBlocks.filter(b => b > 0).sort((a, b) => a - b);
    const pct = q => (nz.length ? nz[Math.min(nz.length - 1, Math.floor(q * nz.length))] : 0);

    // spectrum
    const binHz = fs / FFT_N;
    const power = new Float64Array(FFT_N / 2 + 1);
    let totalE = 0, cNum = 0;
    for (let k = 0; k <= FFT_N / 2; k++) {
      let pw = st.spec[k] / (st.specCount || 1) / (FFT_N * FFT_N * HANN_POWER);
      if (k > 0 && k < FFT_N / 2) pw *= 2;
      power[k] = pw; totalE += pw; cNum += k * binHz * pw;
    }
    const bandE = {};
    for (const [name, lo, hi] of BANDS) {
      let e = 0;
      const kHi = Math.min(FFT_N / 2, Math.floor(Math.min(hi, fs / 2) / binHz));
      for (let k = Math.ceil(lo / binHz); k <= kHi; k++) e += power[k];
      bandE[name] = e;
    }
    const roll = t => {
      let acc = 0;
      for (let k = 0; k <= FFT_N / 2; k++) { acc += power[k]; if (acc >= t * totalE) return k * binHz; }
      return fs / 2;
    };

    // Lossy-source detection. Energy rolloff is NOT a valid test: high frequencies carry
    // a tiny share of total energy, so a 99.9%-energy rolloff sits low on any normal
    // master. What actually identifies a lossy encode is a BRICK WALL - the spectrum
    // falling off a cliff at a fixed frequency and staying at the floor above it.
    // Measure the cliff, not the energy share.
    const smooth = new Float64Array(FFT_N / 2 + 1);
    const W = 4; // +/- 4 bins ~ +/- 43 Hz at 44.1k/4096
    for (let k = 0; k <= FFT_N / 2; k++) {
      let s = 0, n = 0;
      for (let j = Math.max(0, k - W); j <= Math.min(FFT_N / 2, k + W); j++) { s += power[j]; n++; }
      smooth[k] = s / n;
    }
    // reference: strongest part of the spectrum in the musical band
    let ref = 0;
    for (let k = Math.ceil(100 / binHz); k <= Math.floor(Math.min(8000, fs / 2 - 1) / binHz); k++) {
      if (smooth[k] > ref) ref = smooth[k];
    }
    const relDb = k => (smooth[k] > 0 && ref > 0 ? 10 * Math.log10(smooth[k] / ref) : -200);
    // cutoff: highest frequency still above -75 dB relative to that reference
    const FLOOR_DB = -75;
    let cutK = 0;
    for (let k = Math.floor(Math.min(fs / 2 - 1, 22050) / binHz); k >= 1; k--) {
      if (relDb(k) > FLOOR_DB) { cutK = k; break; }
    }
    const cutoffHz = cutK * binHz;
    // steepness: how far the spectrum falls across the 1 kHz straddling the cutoff
    const kAt = hz => Math.max(0, Math.min(FFT_N / 2, Math.round(hz / binHz)));
    const below = relDb(kAt(cutoffHz - 1000));
    const above = relDb(kAt(Math.min(fs / 2 - binHz, cutoffHz + 1000)));
    const cliffDb = below - above;
    const cliff = {
      spectralCutoffHz: Math.round(cutoffHz),
      cutoffCliffDb: r2(cliffDb),
      // a real codec wall: cliff lands where encoders put it, and it is a wall not a slope
      lossySourceLikely: cutoffHz >= 14000 && cutoffHz <= 20600 && cliffDb >= 25 && (fs / 2 - cutoffHz) > 800,
    };

    const out = {
      sampleRate: fs,
      channels: st.channels,
      durationSec: r2(st.n / fs),
      integratedLufs: integrated.lufs === null ? null : r2(integrated.lufs),
      integratedThresholdLufs: r2(integrated.threshold),
      gatedBlocks: integrated.kept,
      loudnessRangeLu: r2(lra),
      lraLowLufs: r2(lraLow),
      lraHighLufs: r2(lraHigh),
      truePeakDbtp: r2(db(truePeak)),
      samplePeakDbfs: r2(db(peak)),
      rmsDbfs: r2(db(rms)),
      crestFactorDb: r2(db(peak) - db(rms)),
      psrDb: integrated.lufs === null ? null : r2(db(truePeak) - integrated.lufs), // peak-to-loudness
      clippedSamples: st.clip[0] + st.clip[1],
      clippedRuns: st.clipRuns,
      samplesOverFullScale: st.over,
      clippedPct: +(((st.clip[0] + st.clip[1]) / (2 * st.n)) * 100).toFixed(5),
      // NB: p5 of 100 ms blocks is a "quietest moments" level, not a true noise floor.
      // On a track that never drops out it is still music. minBlockDbfs is the real
      // quietest 100 ms, which is where tape hiss / room noise actually shows up.
      quietP5Dbfs: r2(dbp(pct(0.05))),
      quietP1Dbfs: r2(dbp(pct(0.01))),
      minBlockDbfs: r2(dbp(nz.length ? nz[0] : 0)),
      blockRmsP50Dbfs: r2(dbp(pct(0.5))),
      silentBlockPct: +(((st.nfBlocks.length - nz.length) / (st.nfBlocks.length || 1)) * 100).toFixed(2),
      stereoCorrelation: +corr.toFixed(4),
      sideToMidDb: r2(db(rmsS) - db(rmsM)),
      monoSumDeltaDb: r2(db(rmsM) - db(rms)),
      channelBalanceDb: r2(db(rmsL) - db(rmsR)),
      dcOffsetL: +(st.dc[0] / st.n).toFixed(6),
      dcOffsetR: +(st.dc[nch > 1 ? 1 : 0] / st.n).toFixed(6),
      spectralCentroidHz: Math.round(cNum / (totalE || 1)),
      rolloff99Hz: Math.round(roll(0.99)),
      rolloff999Hz: Math.round(roll(0.999)),
      ...cliff,
      bands: {}, bandsAbsDb: {},
    };
    for (const [name] of BANDS) {
      out.bands[name] = r2(10 * Math.log10((bandE[name] || 1e-30) / (totalE || 1e-30)));
      out.bandsAbsDb[name] = r2(dbp(bandE[name]));
    }
    const lowE = (bandE.sub || 0) + (bandE.bass || 0);
    const highE = (bandE.presence || 0) + (bandE.top || 0);
    out.spectralTiltDb = r2(10 * Math.log10((highE || 1e-30) / (lowE || 1e-30)));
    return out;
  }

  return { push, pushFrame, finish };
}
