// Turn results.jsonl into the SONGCHAINN standard envelope: percentile distributions,
// a wav-vs-mp3 split (they may be two different mastering populations), hygiene counts,
// and the outliers on each axis.
import fs from 'node:fs';
import path from 'node:path';

const DIR = import.meta.dirname;
const argv = process.argv.slice(2);
const i = argv.indexOf('--in');
const INFILE = i === -1 ? 'results.jsonl' : argv[i + 1];
const rows = fs.readFileSync(path.join(DIR, INFILE), 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l));

// last record per url wins (resume/retry can append more than once)
const byUrl = new Map();
for (const r of rows) byUrl.set(r.url, r);
const all = [...byUrl.values()];
const ok = all.filter(r => r.ok);
const bad = all.filter(r => !r.ok);
const isWav = r => r.path === 'wav-native';

const num = a => a.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y);
const P = (a, q) => (a.length ? a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))] : NaN);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '  n/a');

const lines = [];
const say = s => { lines.push(s); console.log(s); };

const METRICS = [
  ['integratedLufs', 'Integrated loudness', 'LUFS', 1],
  ['truePeakDbtp', 'True peak', 'dBTP', 2],
  ['samplePeakDbfs', 'Sample peak', 'dBFS', 2],
  ['loudnessRangeLu', 'Loudness range (LRA)', 'LU', 1],
  ['crestFactorDb', 'Crest factor', 'dB', 1],
  ['psrDb', 'Peak to loudness (PSR)', 'dB', 1],
  ['rmsDbfs', 'RMS', 'dBFS', 1],
  ['quietP5Dbfs', 'Quietest 5% of 100ms blocks', 'dBFS', 1],
  ['minBlockDbfs', 'Quietest single 100ms block', 'dBFS', 1],
  ['stereoCorrelation', 'Stereo correlation', '', 3],
  ['sideToMidDb', 'Side vs mid', 'dB', 1],
  ['monoSumDeltaDb', 'Mono-sum level change', 'dB', 2],
  ['channelBalanceDb', 'L/R balance', 'dB', 2],
  ['spectralCentroidHz', 'Spectral centroid', 'Hz', 0],
  ['spectralTiltDb', 'Spectral tilt (highs vs lows)', 'dB', 1],
  ['rolloff99Hz', 'Rolloff 99%', 'Hz', 0],
  ['rolloff999Hz', 'Rolloff 99.9%', 'Hz', 0],
  ['spectralCutoffHz', 'Spectral cutoff (brick wall)', 'Hz', 0],
  ['cutoffCliffDb', 'Cutoff cliff steepness', 'dB', 1],
  ['durationSec', 'Duration', 's', 0],
];
const BANDS = ['sub', 'bass', 'lowMid', 'mid', 'highMid', 'presence', 'top'];

say(`SONGCHAINN CATALOG STANDARD`);
say(`${ok.length} tracks measured, ${bad.length} failed  (${ok.filter(isWav).length} wav, ${ok.filter(r => !isWav(r)).length} mp3)`);
say(`Loudness per ITU-R BS.1770-4, validated against EBU Tech 3341 (-22.99 vs -23.0 required).\n`);

const tally = (arr, key) => {
  const t = {};
  for (const r of arr) t[r[key] ?? '?'] = (t[r[key] ?? '?'] || 0) + 1;
  return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  ');
};
say(`codecs:       ${tally(ok, 'codec')}`);
say(`sample rates: ${tally(ok, 'sampleRate')}`);
say(`channels:     ${tally(ok, 'channels')}`);
say(`bit depth:    ${tally(ok.filter(isWav), 'sourceBits')} (wav only)\n`);

// ------------------------------------------------------------------ distributions
const stats = {};
say('WHOLE CATALOG                          p5      p10     p25     med     p75     p90     p95    mean');
say('-'.repeat(98));
for (const [key, label, unit, d] of METRICS) {
  const a = num(ok.map(r => r[key]));
  if (!a.length) continue;
  stats[key] = { p5: P(a, .05), p10: P(a, .10), p25: P(a, .25), p50: P(a, .5), p75: P(a, .75), p90: P(a, .90), p95: P(a, .95), mean: mean(a), min: a[0], max: a[a.length - 1], n: a.length };
  const s = stats[key];
  say(`${(label + (unit ? ` (${unit})` : '')).padEnd(36)}${f(s.p5, d).padStart(8)}${f(s.p10, d).padStart(8)}${f(s.p25, d).padStart(8)}${f(s.p50, d).padStart(8)}${f(s.p75, d).padStart(8)}${f(s.p90, d).padStart(8)}${f(s.p95, d).padStart(8)}${f(s.mean, d).padStart(8)}`);
}

// ------------------------------------------------------------------ wav vs mp3
say('\nWAV MASTERS vs MP3 MASTERS  (median, and p5..p95 spread)');
say('-'.repeat(98));
say(`${''.padEnd(36)}${'WAV median'.padStart(14)}${'WAV p5..p95'.padStart(20)}${'MP3 median'.padStart(14)}${'MP3 p5..p95'.padStart(20)}`);
const wavRows = ok.filter(isWav), mp3Rows = ok.filter(r => !isWav(r));
const splitStats = { wav: {}, mp3: {} };
for (const [key, label, unit, d] of METRICS) {
  const w = num(wavRows.map(r => r[key]));
  const m = num(mp3Rows.map(r => r[key]));
  if (!w.length && !m.length) continue;
  splitStats.wav[key] = { p5: P(w, .05), p50: P(w, .5), p95: P(w, .95), n: w.length };
  splitStats.mp3[key] = { p5: P(m, .05), p50: P(m, .5), p95: P(m, .95), n: m.length };
  say(
    `${(label + (unit ? ` (${unit})` : '')).padEnd(36)}` +
    `${f(P(w, .5), d).padStart(14)}` +
    `${`${f(P(w, .05), d)}..${f(P(w, .95), d)}`.padStart(20)}` +
    `${f(P(m, .5), d).padStart(14)}` +
    `${`${f(P(m, .05), d)}..${f(P(m, .95), d)}`.padStart(20)}`
  );
}

// ------------------------------------------------------------------ spectrum
say('\nSPECTRAL BALANCE  (dB relative to that track total energy)');
say(`${'BAND'.padEnd(36)}${'p5'.padStart(8)}${'p25'.padStart(8)}${'med'.padStart(8)}${'p75'.padStart(8)}${'p95'.padStart(8)}`);
say('-'.repeat(98));
const bandStats = {};
for (const b of BANDS) {
  const a = num(ok.map(r => r.bands?.[b]));
  if (!a.length) continue;
  bandStats[b] = { p5: P(a, .05), p25: P(a, .25), p50: P(a, .5), p75: P(a, .75), p95: P(a, .95) };
  say(`${b.padEnd(36)}${f(P(a, .05)).padStart(8)}${f(P(a, .25)).padStart(8)}${f(P(a, .5)).padStart(8)}${f(P(a, .75)).padStart(8)}${f(P(a, .95)).padStart(8)}`);
}

// ------------------------------------------------------------------ hygiene
const pctOf = n => `${((n / ok.length) * 100).toFixed(0)}%`;
const cnt = (label, arr) => say(`${label.padEnd(62)}${String(arr.length).padStart(4)} / ${ok.length}  ${pctOf(arr.length).padStart(4)}`);
say('\nHYGIENE');
say('-'.repeat(98));
const clipped = ok.filter(r => (r.clippedRuns || 0) > 0);
cnt('clipped runs (>=4 consecutive full-scale samples)', clipped);
cnt('any sample above full scale', ok.filter(r => (r.samplesOverFullScale || 0) > 0));
cnt('true peak above -1.0 dBTP', ok.filter(r => (r.truePeakDbtp ?? -99) > -1));
cnt('true peak above  0.0 dBTP (distorts on lossy encode)', ok.filter(r => (r.truePeakDbtp ?? -99) > 0));
cnt('effectively mono (correlation > 0.995)', ok.filter(r => (r.stereoCorrelation ?? 0) > 0.995));
cnt('phase risk (correlation < 0.2)', ok.filter(r => (r.stereoCorrelation ?? 1) < 0.2));
cnt('mono-sum loss worse than -1 dB', ok.filter(r => (r.monoSumDeltaDb ?? 0) < -1));
cnt('L/R imbalance worse than 1 dB', ok.filter(r => Math.abs(r.channelBalanceDb ?? 0) > 1));
cnt('DC offset above 0.001', ok.filter(r => Math.abs(r.dcOffsetL ?? 0) > 0.001 || Math.abs(r.dcOffsetR ?? 0) > 0.001));
// Brick-wall test, NOT energy rolloff: rolloff reads ~14 kHz on any normal master
// because treble carries little energy, so it cannot identify a lossy source.
cnt('brick wall in spectrum (lossy-encoded source)', ok.filter(r => r.lossySourceLikely));
cnt('  ...of those, delivered as WAV (lossy master in a wav wrapper)', ok.filter(r => isWav(r) && r.lossySourceLikely));
cnt('spectral cutoff below 17 kHz', ok.filter(r => (r.spectralCutoffHz ?? 99999) < 17000));
cnt('crest factor below 8 dB (heavily squashed)', ok.filter(r => (r.crestFactorDb ?? 99) < 8));
cnt('LRA below 3 LU (very flat dynamics)', ok.filter(r => (r.loudnessRangeLu ?? 99) < 3));

// ------------------------------------------------------------------ outliers
const show = (title, arr, fmt) => {
  say(`\n${title}`);
  if (!arr.length) { say('  (none)'); return; }
  for (const r of arr) say(`  ${(r.artist || '?').slice(0, 18).padEnd(19)}${(r.title || '?').slice(0, 30).padEnd(31)}${isWav(r) ? 'wav' : 'mp3'}  ${fmt(r)}`);
};
const by = (k, dir) => (a, b) => dir * ((a[k] ?? 0) - (b[k] ?? 0));
const L = r => `${f(r.integratedLufs)} LUFS  TP ${f(r.truePeakDbtp, 2)}  crest ${f(r.crestFactorDb)}`;
show('LOUDEST 12', [...ok].sort(by('integratedLufs', -1)).slice(0, 12), L);
show('QUIETEST 12', [...ok].sort(by('integratedLufs', 1)).slice(0, 12), L);
show('HOTTEST TRUE PEAKS', [...ok].sort(by('truePeakDbtp', -1)).slice(0, 12), r => `${f(r.truePeakDbtp, 2)} dBTP  ${r.clippedRuns} clip runs  ${f(r.integratedLufs)} LUFS`);
show('MOST CLIPPED', [...ok].sort(by('clippedRuns', -1)).slice(0, 12), r => `${r.clippedRuns} runs  ${r.clippedSamples} samples (${f(r.clippedPct, 4)}%)  TP ${f(r.truePeakDbtp, 2)}`);
show('MOST SQUASHED (lowest crest)', [...ok].sort(by('crestFactorDb', 1)).slice(0, 12), r => `crest ${f(r.crestFactorDb)}  LRA ${f(r.loudnessRangeLu)}  ${f(r.integratedLufs)} LUFS`);
show('LOWEST SPECTRAL CUTOFF (brick-wall candidates)', [...ok].sort(by('spectralCutoffHz', 1)).slice(0, 12), r => `cutoff ${f(r.spectralCutoffHz, 0)} Hz  cliff ${f(r.cutoffCliffDb)} dB  ${r.lossySourceLikely ? 'LOSSY-LIKE' : 'natural rolloff'}  (${r.containerBitrateKbps ? r.containerBitrateKbps + 'kbps' : r.sourceBits + 'bit'})`);
show('WIDEST / PHASE RISK', [...ok].sort(by('stereoCorrelation', 1)).slice(0, 12), r => `corr ${f(r.stereoCorrelation, 3)}  side/mid ${f(r.sideToMidDb)} dB  mono sum ${f(r.monoSumDeltaDb, 2)} dB`);
show('NARROWEST STEREO', [...ok].sort(by('stereoCorrelation', -1)).slice(0, 12), r => `corr ${f(r.stereoCorrelation, 3)}  side/mid ${f(r.sideToMidDb)} dB`);
show('HIGHEST QUIET-FLOOR (never drops out)', [...ok].sort(by('minBlockDbfs', -1)).slice(0, 12), r => `min block ${f(r.minBlockDbfs)} dBFS  LRA ${f(r.loudnessRangeLu)}`);

if (bad.length) {
  say('\nFAILED TO MEASURE');
  for (const r of bad) say(`  ${(r.title || r.url).slice(0, 44).padEnd(45)}${String(r.error).slice(0, 90)}`);
}

// ------------------------------------------------------------------ the envelope
say('\n' + '='.repeat(98));
say('THE SONGCHAINN ENVELOPE  —  central 90% of the catalog (p5..p95)');
say('This is the standard, expressed as numbers rather than as one person\'s ear.');
say('='.repeat(98));
const env = (key, label, d = 1) => {
  const s = stats[key];
  if (s) say(`${label.padEnd(44)}${f(s.p5, d).padStart(10)}  to ${f(s.p95, d).padStart(10)}      (median ${f(s.p50, d)})`);
};
env('integratedLufs', 'Integrated loudness (LUFS)');
env('truePeakDbtp', 'True peak (dBTP)', 2);
env('crestFactorDb', 'Crest factor (dB)');
env('psrDb', 'Peak to loudness (dB)');
env('loudnessRangeLu', 'Loudness range (LU)');
env('stereoCorrelation', 'Stereo correlation', 3);
env('monoSumDeltaDb', 'Mono-sum level change (dB)', 2);
env('spectralCentroidHz', 'Spectral centroid (Hz)', 0);
env('spectralTiltDb', 'Spectral tilt (dB)');
env('rolloff999Hz', 'Rolloff 99.9% (Hz)', 0);
say('');
for (const b of BANDS) {
  const s = bandStats[b];
  if (s) say(`  band ${b.padEnd(38)}${f(s.p5).padStart(10)}  to ${f(s.p95).padStart(10)}      (median ${f(s.p50)})`);
}

fs.writeFileSync(path.join(DIR, 'report.txt'), lines.join('\n'));
fs.writeFileSync(path.join(DIR, 'stats.json'), JSON.stringify({
  n: ok.length, failed: bad.length,
  nWav: ok.filter(isWav).length, nMp3: ok.filter(r => !isWav(r)).length,
  stats, splitStats, bandStats,
}, null, 2));
console.log('\nwrote report.txt and stats.json');
