// Prove the measurement core before trusting it on the catalog.
import { createAnalyser, kWeightFilters } from './core.mjs';

let fails = 0;
const check = (name, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} got ${Number(got).toFixed(4)}  want ${want} +/-${tol}`);
};

// 1. K-weighting coefficients at 48 kHz must reduce to the values tabulated in BS.1770-4
const { shelfB, shelfA, hpB, hpA } = kWeightFilters(48000);
check('shelf b0 @48k', shelfB[0], 1.53512485958697, 1e-9);
check('shelf b1 @48k', shelfB[1], -2.69169618940638, 1e-9);
check('shelf b2 @48k', shelfB[2], 1.19839281085285, 1e-9);
check('shelf a1 @48k', shelfA[1], -1.69065929318241, 1e-9);
check('shelf a2 @48k', shelfA[2], 0.73248077421585, 1e-9);
check('hp a1 @48k', hpA[1], -1.99004745483398, 1e-8);
check('hp a2 @48k', hpA[2], 0.99007225036621, 1e-8);

// 2. EBU Tech 3341 case 1: 1 kHz sine, peak amplitude -23 dBFS, both channels -> -23.0 LUFS
function sineLufs(fs, seconds, peakDbfs, freq = 1000, stereo = true) {
  const a = createAnalyser(fs, stereo ? 2 : 1);
  const amp = Math.pow(10, peakDbfs / 20);
  const n = Math.round(fs * seconds);
  for (let i = 0; i < n; i++) {
    const v = amp * Math.sin((2 * Math.PI * freq * i) / fs);
    a.pushFrame(v, stereo ? v : v);
  }
  return a.finish();
}

let r = sineLufs(48000, 20, -23);
check('EBU 3341 case 1: -23 dBFS 1k sine -> LUFS', r.integratedLufs, -23.0, 0.1);

// True peak is deliberately only measured near loud samples (TP_GATE = -12 dBFS), because
// the oversampler dominates runtime. Contract: accurate above the gate, not reported below
// it. Assert both halves so the tradeoff stays honest rather than silently drifting.
r = sineLufs(48000, 5, -6);
check('true peak accurate above the gate (-6 dBFS sine)', r.truePeakDbtp, -6.0, 0.15);
r = sineLufs(48000, 5, -30);
check('true peak not claimed below the gate (-30 dBFS)', r.truePeakDbtp === null ? 1 : 0, 1, 0);

r = sineLufs(48000, 20, -33);
check('EBU 3341 case 2: -33 dBFS 1k sine -> LUFS', r.integratedLufs, -33.0, 0.1);

// 3. same signal at 44.1 kHz must give the same answer (coefficients re-derived per rate)
r = sineLufs(44100, 20, -23);
check('44.1 kHz gives same LUFS as 48 kHz', r.integratedLufs, -23.0, 0.1);

// 4. full-scale sine: true peak ~0 dBTP, sample peak 0 dBFS
r = sineLufs(48000, 5, 0);
check('full-scale sine sample peak (dBFS)', r.samplePeakDbfs, 0.0, 0.05);
check('full-scale sine true peak (dBTP)', r.truePeakDbtp, 0.0, 0.2);

// 5. intersample overshoot: a sine at exactly fs/4 with a 45 degree phase offset never
//    lands on its own crest. Every sample sits at +/-0.7071 (-3.01 dBFS) while the real
//    waveform still reaches full scale, so true peak must read ~3 dB above sample peak.
{
  const fs = 48000, freq = 12000, amp = 1.0;
  const a = createAnalyser(fs, 2);
  const n = fs * 2;
  for (let i = 0; i < n; i++) {
    const v = amp * Math.sin((2 * Math.PI * freq * i) / fs + Math.PI / 4);
    a.pushFrame(v, v);
  }
  const res = a.finish();
  const lift = res.truePeakDbtp - res.samplePeakDbfs;
  console.log(`      intersample: sample peak ${res.samplePeakDbfs} dBFS, true peak ${res.truePeakDbtp} dBTP, lift ${lift.toFixed(2)} dB`);
  check('true peak catches intersample overshoot', lift > 1.5 ? 1 : 0, 1, 0);
}

// 6. crest factor of a sine is 3.01 dB
r = sineLufs(48000, 5, -6);
check('sine crest factor (dB)', r.crestFactorDb, 3.01, 0.05);

// 7. stereo correlation: identical channels = 1, inverted = -1, independent noise ~ 0
{
  const mk = mode => {
    const a = createAnalyser(48000, 2);
    for (let i = 0; i < 48000 * 3; i++) {
      const L = Math.random() * 2 - 1;
      const R = mode === 'same' ? L : mode === 'inv' ? -L : Math.random() * 2 - 1;
      a.pushFrame(L, R);
    }
    return a.finish();
  };
  check('correlation, identical channels', mk('same').stereoCorrelation, 1.0, 0.01);
  check('correlation, inverted channels', mk('inv').stereoCorrelation, -1.0, 0.01);
  check('correlation, independent noise', mk('rand').stereoCorrelation, 0.0, 0.02);
}

// 8. clipping detection: a signal driven past full scale
{
  const a = createAnalyser(48000, 2);
  for (let i = 0; i < 48000; i++) {
    let v = 1.4 * Math.sin((2 * Math.PI * 100 * i) / 48000);
    v = Math.max(-1, Math.min(1, v)); // hard clip
    a.pushFrame(v, v);
  }
  const res = a.finish();
  console.log(`      clipping: ${res.clippedSamples} samples, ${res.clippedRuns} runs`);
  check('clipped runs detected', res.clippedRuns > 100 ? 1 : 0, 1, 0);
}

// 9. spectral band placement: pure tone lands in the expected band
{
  const tone = f => {
    const a = createAnalyser(48000, 2);
    for (let i = 0; i < 48000 * 2; i++) {
      const v = 0.5 * Math.sin((2 * Math.PI * f * i) / 48000);
      a.pushFrame(v, v);
    }
    return a.finish();
  };
  const t = tone(100);
  const loudest = Object.entries(t.bands).sort((x, y) => y[1] - x[1])[0][0];
  check('100 Hz tone lands in "bass" band', loudest === 'bass' ? 1 : 0, 1, 0);
  const t2 = tone(8000);
  const loudest2 = Object.entries(t2.bands).sort((x, y) => y[1] - x[1])[0][0];
  check('8 kHz tone lands in "presence" band', loudest2 === 'presence' ? 1 : 0, 1, 0);
  console.log(`      8 kHz tone: centroid ${t2.spectralCentroidHz} Hz, rolloff99 ${t2.rolloff99Hz} Hz`);
}

// 9b. lossy-source detection: a brick wall at 16 kHz must be flagged, a full-band
//     signal must not. Built as a sum of sines so the band limit is a true hard wall.
{
  const build = (topHz, fs = 48000, secs = 2) => {
    const a = createAnalyser(fs, 2);
    const freqs = [];
    for (let f = 100; f <= topHz; f += 100) freqs.push(f);
    const phase = freqs.map((_, i) => (i * 1.61803) % (2 * Math.PI));
    const norm = 0.4 / Math.sqrt(freqs.length);
    const n = fs * secs;
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let k = 0; k < freqs.length; k++) v += Math.sin((2 * Math.PI * freqs[k] * i) / fs + phase[k]);
      v *= norm;
      a.pushFrame(v, v);
    }
    return a.finish();
  };
  const walled = build(16000);
  const full = build(21000);
  console.log(`      brick wall @16k: cutoff ${walled.spectralCutoffHz} Hz, cliff ${walled.cutoffCliffDb} dB, flagged ${walled.lossySourceLikely}`);
  console.log(`      full band @21k : cutoff ${full.spectralCutoffHz} Hz, cliff ${full.cutoffCliffDb} dB, flagged ${full.lossySourceLikely}`);
  check('brick-walled signal cutoff found near 16 kHz', walled.spectralCutoffHz, 16000, 600);
  check('brick-walled signal flagged as lossy-like', walled.lossySourceLikely ? 1 : 0, 1, 0);
  check('full-band signal NOT flagged as lossy', full.lossySourceLikely ? 1 : 0, 0, 0);
}

// 10. RMS of a known sine
r = sineLufs(48000, 5, -6);
check('sine RMS (dBFS), -6 dBFS peak', r.rmsDbfs, -9.01, 0.05);

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
