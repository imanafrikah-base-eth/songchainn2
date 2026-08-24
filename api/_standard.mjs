// The SONGCHAINN standard.
//
// These numbers are not opinions and they were not hand-written. They come
// from measuring all 230 catalog tracks and then isolating the 56 that are
// genuinely lossless masters (full spectrum, no encoder brick wall). That
// subset is tight and consistent, and it IS the standard:
//
//   integrated loudness  -17.9 .. -13.5 LUFS   (median -14.6)
//   true peak            -5.00 .. -2.40 dBTP   (median -3.71, never above -2.4)
//   crest factor          11.5 .. 15.4 dB
//   loudness range         3.1 .. 8.0 LU
//   stereo correlation   0.774 .. 0.959
//   spectral cutoff     20,238 .. 22,043 Hz
//
// THE STANDARD IS A LADDER, NOT A WALL.
//
// It used to be a wall: anything outside GATE went to the workshop and was
// never heard. Held honestly that rejected most of the founding catalog (129
// of 230 fail on true peak alone) and it rejected normal, finished records,
// because a limiter ceilinged at -0.1 dBFS lands around +0.8 dBTP after
// intersample reconstruction. That is delivery practice, not damage.
//
// So there are now three rungs:
//
//   GATE     what is measurably BROKEN. The only thing that stops a release.
//            Audible clipping, a low bitrate rip, mono cancellation, DC.
//   DELIVERY clean, professional delivery. Publishes either way, but this is
//            what earns placement: New Releases hero, editorial, coining.
//   STANDARD the founding catalog's own bar. The top rung. A mark, not a door.
//
// Nothing about the standard was lowered. What changed is what it gates.
// Tighten or loosen by editing GATE and DELIVERY, nothing else.
//
// Loudness is NEVER a reason to reject. A quiet master is a choice; a clipped
// one is damage.

/** The founding catalog's measured bar. Top rung: earns the mark. */
export const STANDARD = {
  integratedLufs:    { min: -17.9, max: -13.5, median: -14.6 },
  truePeakDbtp:      { min: -5.0,  max: -2.4,  median: -3.71 },
  crestFactorDb:     { min: 11.5,  max: 15.4 },
  loudnessRangeLu:   { min: 3.1,   max: 8.0 },
  stereoCorrelation: { min: 0.774, max: 0.959 },
  spectralCutoffHz:  { min: 20238, max: 22043 },
};

/**
 * Clean delivery. Middle rung. A record that clears this is fit to sit next to
 * the catalog and is eligible for placement. These are the universal delivery
 * numbers (-1 dBTP is what Spotify and Apple both ask for), not our own taste.
 */
export const DELIVERY = {
  truePeakMaxDbtp: -1.0,
  crestMinDb: 8.0,
  lraMinLu: 2.0,
  correlationMin: 0.7,
  cutoffMinHz: 19000,
  lufsMin: -18.0,
  lufsMax: -13.0,
};

/**
 * Broken. Bottom rung, and the ONLY thing that stops a release.
 *
 * Every number here means "you can hear that this is wrong", not "this is not
 * how we would have done it".
 */
export const GATE = {
  // Overs alone are not damage. Overs plus sustained clipped runs are.
  truePeakOverDbtp: 1.5,
  clippedRunsMax: 25,
  // Past this the file is damaged whatever the run count says.
  truePeakHardDbtp: 3.0,
  crestMinDb: 5.0,
  lraMinLu: 1.0,
  correlationMin: 0.0,
  dcOffsetMax: 0.003,
  minDurationSec: 30,
  // A brick wall this low is a low bitrate rip or a stream capture.
  lossyCutoffHz: 16000,
};

export const TIER_LABEL = {
  master: 'Mastered to standard',
  release: 'Release ready',
  raw: 'Published, with notes',
};

const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const within = (v, r) => v !== null && v >= r.min && v <= r.max;

/**
 * Apply the ladder to a measured track.
 *
 * Returns { passed, tier, failures[], advisories[], shortfalls[] }.
 *
 *   passed      false only when the record is broken. False sends it to the
 *               artist's private workshop. True publishes it.
 *   tier        'master' | 'release' | 'raw'. Placement reads this.
 *   failures    why it was stopped. Always carries the measured number.
 *   advisories  what to fix next time. Never stops anything.
 *   shortfalls  exactly what stands between this track and the rung above.
 */
export function judge(m) {
  const failures = [];
  const advisories = [];
  const shortfalls = [];

  const tp = n(m.truePeakDbtp);
  const dur = n(m.durationSec);
  const crest = n(m.crestFactorDb);
  const lra = n(m.loudnessRangeLu);
  const corr = n(m.stereoCorrelation);
  const cutoff = n(m.spectralCutoffHz);
  const lufs = n(m.integratedLufs);
  const runs = n(m.clippedRuns) ?? 0;
  const dc = Math.max(Math.abs(n(m.dcOffsetL) ?? 0), Math.abs(n(m.dcOffsetR) ?? 0));

  /* ------------------------------------------------------------ broken --- */

  if (tp !== null && tp > GATE.truePeakHardDbtp) {
    failures.push({
      code: 'true_peak',
      metric: 'truePeakDbtp',
      measured: tp,
      limit: GATE.truePeakHardDbtp,
      plain: `The master peaks at ${tp.toFixed(2)} dBTP. That is far past full scale and the distortion is baked into the file, not something a player can undo. Pull the ceiling down to about -1 dBTP and export again.`,
    });
  } else if (tp !== null && tp > GATE.truePeakOverDbtp && runs > GATE.clippedRunsMax) {
    failures.push({
      code: 'true_peak',
      metric: 'truePeakDbtp',
      measured: tp,
      limit: GATE.truePeakOverDbtp,
      plain: `This peaks at ${tp.toFixed(2)} dBTP with ${runs} runs of clipped samples, so these are not just intersample overs, the waveform is squared off. Pull the ceiling down to about -1 dBTP and export again.`,
    });
  }

  if (dur !== null && dur < GATE.minDurationSec) {
    failures.push({
      code: 'too_short',
      metric: 'durationSec',
      measured: dur,
      limit: GATE.minDurationSec,
      plain: `This is ${Math.round(dur)} seconds long. Send the finished record, not the snippet.`,
    });
  }

  if (crest !== null && crest < GATE.crestMinDb) {
    failures.push({
      code: 'crest',
      metric: 'crestFactorDb',
      measured: crest,
      limit: GATE.crestMinDb,
      plain: `Crest factor is ${crest.toFixed(1)} dB. There are no transients left at all, the whole record is one solid block. Back the limiter off and let it breathe.`,
    });
  }

  if (lra !== null && lra < GATE.lraMinLu) {
    failures.push({
      code: 'lra',
      metric: 'loudnessRangeLu',
      measured: lra,
      limit: GATE.lraMinLu,
      plain: `Loudness range is ${lra.toFixed(1)} LU, so the track sits at exactly one level from the first bar to the last. A record needs somewhere to go.`,
    });
  }

  if (corr !== null && corr < GATE.correlationMin) {
    failures.push({
      code: 'phase',
      metric: 'stereoCorrelation',
      measured: corr,
      limit: GATE.correlationMin,
      plain: `The left and right channels are out of phase (correlation ${corr.toFixed(2)}). On a phone speaker or any mono system, parts of this song will disappear.`,
    });
  }

  if (dc >= GATE.dcOffsetMax) {
    failures.push({
      code: 'dc_offset',
      metric: 'dcOffset',
      measured: dc,
      limit: GATE.dcOffsetMax,
      plain: `There is a DC offset of ${dc.toFixed(4)} on this file. It eats headroom and it will click. A high-pass at 20 Hz clears it.`,
    });
  }

  if (m.lossySourceLikely && cutoff !== null && cutoff < GATE.lossyCutoffHz) {
    failures.push({
      code: 'lossy_source',
      metric: 'spectralCutoffHz',
      measured: cutoff,
      limit: GATE.lossyCutoffHz,
      plain: `The spectrum falls off a cliff at ${Math.round(cutoff).toLocaleString()} Hz. That is a low bitrate rip, not a master. Go back to the session and export from source.`,
    });
  }

  /* ---------------------------------------------------------- delivery --- */
  // Everything below publishes. It shapes the tier and the note, nothing else.

  const miss = (code, metric, measured, target, plain) => {
    const item = { code, metric, measured, target, plain };
    shortfalls.push(item);
    advisories.push(item);
  };

  const broke = (code) => failures.some((f) => f.code === code);

  if (tp !== null && tp > DELIVERY.truePeakMaxDbtp && !broke('true_peak')) {
    miss('true_peak', 'truePeakDbtp', tp, `${DELIVERY.truePeakMaxDbtp} dBTP`,
      tp > 0
        ? `This peaks at ${tp.toFixed(2)} dBTP, just past full scale. Playback is levelled so nothing clips on the way out, but a ceiling at -1 dBTP is what the record deserves.`
        : `True peak is ${tp.toFixed(2)} dBTP. Leave a full dB of headroom and lossy encoders stop guessing.`);
  }

  if (crest !== null && crest < DELIVERY.crestMinDb && !broke('crest')) {
    miss('crest', 'crestFactorDb', crest, `${DELIVERY.crestMinDb} dB`,
      `Crest factor is ${crest.toFixed(1)} dB. It is holding together, but the limiter is doing more work than the arrangement is.`);
  }

  if (lra !== null && lra < DELIVERY.lraMinLu && !broke('lra')) {
    miss('lra', 'loudnessRangeLu', lra, `${DELIVERY.lraMinLu} LU`,
      `Loudness range is ${lra.toFixed(1)} LU. The record barely moves between its quietest and its loudest moment.`);
  }

  if (corr !== null && corr < DELIVERY.correlationMin && !broke('phase')) {
    miss('width', 'stereoCorrelation', corr, `above ${DELIVERY.correlationMin}`,
      `The stereo image is very wide (correlation ${corr.toFixed(2)}). It will hold up, but check it in mono before you call it done.`);
  }

  if (cutoff !== null && cutoff < DELIVERY.cutoffMinHz && !broke('lossy_source')) {
    miss('lossy_source', 'spectralCutoffHz', cutoff, `${DELIVERY.cutoffMinHz.toLocaleString()} Hz`,
      `The top end stops at ${Math.round(cutoff).toLocaleString()} Hz, so this went through an encoder before it reached us. It plays fine. A WAV straight from the session plays better.`);
  }

  if (lufs !== null && (lufs < DELIVERY.lufsMin || lufs > DELIVERY.lufsMax)) {
    miss('loudness', 'integratedLufs', lufs, `${DELIVERY.lufsMin} to ${DELIVERY.lufsMax} LUFS`,
      lufs > DELIVERY.lufsMax
        ? `At ${lufs.toFixed(1)} LUFS this is louder than the catalog sits. Every track gets levelled on playback, so pushing it this hard buys nothing and costs punch.`
        : `At ${lufs.toFixed(1)} LUFS this is quieter than the catalog sits. Playback levels it up so it will not sound small, but there is room to master it properly.`);
  }

  if (runs > 0 && !broke('true_peak')) {
    advisories.push({
      code: 'clipping',
      metric: 'clippedRuns',
      measured: runs,
      target: '0',
      plain: `There are ${runs} runs of clipped samples in here. Something upstream is hitting the wall before the master bus does.`,
    });
  }

  /* -------------------------------------------------------------- tier --- */

  const passed = failures.length === 0;

  const meetsStandard = passed
    && within(lufs, STANDARD.integratedLufs)
    && tp !== null && tp <= STANDARD.truePeakDbtp.max
    && crest !== null && crest >= STANDARD.crestFactorDb.min
    && within(lra, STANDARD.loudnessRangeLu)
    && corr !== null && corr >= STANDARD.stereoCorrelation.min
    && cutoff !== null && cutoff >= STANDARD.spectralCutoffHz.min
    && !m.lossySourceLikely;

  const meetsDelivery = passed && shortfalls.length === 0;

  const tier = !passed ? 'raw' : meetsStandard ? 'master' : meetsDelivery ? 'release' : 'raw';

  return { passed, tier, failures, advisories, shortfalls };
}

/** True when a track has earned placement: hero slots, editorial, coining. */
export function eligibleForPlacement(tier) {
  return tier === 'master' || tier === 'release';
}
