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
// LAUNCH SETTING: the gate below rejects only what is measurably broken, not
// everything outside that range. Applied at full tightness the standard would
// reject most of the founding catalog (129 of 230 fail on true peak alone),
// which would be dishonest to hold new artists to while the old catalog rides.
// So the bar starts at "nothing broken" and the full standard is published as
// the direction of travel. Tighten by editing GATE, nothing else.
//
// Loudness is ALWAYS advisory. A quiet master is a choice; a clipped one is
// damage.

export const STANDARD = {
  integratedLufs:    { min: -17.9, max: -13.5, median: -14.6 },
  truePeakDbtp:      { min: -5.0,  max: -2.4,  median: -3.71 },
  crestFactorDb:     { min: 11.5,  max: 15.4 },
  loudnessRangeLu:   { min: 3.1,   max: 8.0 },
  stereoCorrelation: { min: 0.774, max: 0.959 },
  spectralCutoffHz:  { min: 20238, max: 22043 },
};

export const GATE = {
  truePeakMaxDbtp: 0.0,
  crestMinDb: 8.0,
  lraMinLu: 2.0,
  correlationMin: 0.0,
  dcOffsetMax: 0.003,
  minDurationSec: 45,
  lossyCutoffHz: 19000,
};

/** Advisory bounds: noted in the artist's report, never a reason to reject. */
export const ADVISORY = {
  lufsMin: STANDARD.integratedLufs.min,
  lufsMax: STANDARD.integratedLufs.max,
  correlationMin: 0.7,
};

const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Apply the gate to a measured track.
 *
 * Returns { passed, failures[], advisories[] } where each entry carries the
 * measurement that triggered it, so the artist is always told the number and
 * not just the word "no".
 */
export function judge(m) {
  const failures = [];
  const advisories = [];

  const tp = n(m.truePeakDbtp);
  if (tp !== null && tp > GATE.truePeakMaxDbtp) {
    failures.push({
      code: 'true_peak',
      metric: 'truePeakDbtp',
      measured: tp,
      limit: GATE.truePeakMaxDbtp,
      plain: `The master peaks at ${tp.toFixed(2)} dBTP, above full scale. That is distortion baked into the file, and every player will make it worse. Pull the ceiling down to about -1 dBTP and re-export.`,
    });
  }

  const dur = n(m.durationSec);
  if (dur !== null && dur < GATE.minDurationSec) {
    failures.push({
      code: 'too_short',
      metric: 'durationSec',
      measured: dur,
      limit: GATE.minDurationSec,
      plain: `This is ${Math.round(dur)} seconds long. Send the finished record, not the snippet.`,
    });
  }

  const crest = n(m.crestFactorDb);
  if (crest !== null && crest < GATE.crestMinDb) {
    failures.push({
      code: 'crest',
      metric: 'crestFactorDb',
      measured: crest,
      limit: GATE.crestMinDb,
      plain: `Crest factor is ${crest.toFixed(1)} dB. The life has been squeezed out of the dynamics. Back the limiter off and let the transients breathe.`,
    });
  }

  const lra = n(m.loudnessRangeLu);
  if (lra !== null && lra < GATE.lraMinLu) {
    failures.push({
      code: 'lra',
      metric: 'loudnessRangeLu',
      measured: lra,
      limit: GATE.lraMinLu,
      plain: `Loudness range is ${lra.toFixed(1)} LU, so the track sits at one level from start to finish. A record needs somewhere to go.`,
    });
  }

  const corr = n(m.stereoCorrelation);
  if (corr !== null && corr < GATE.correlationMin) {
    failures.push({
      code: 'phase',
      metric: 'stereoCorrelation',
      measured: corr,
      limit: GATE.correlationMin,
      plain: `The left and right channels are out of phase (correlation ${corr.toFixed(2)}). On a phone speaker or any mono system, parts of this song will disappear.`,
    });
  }

  const dc = Math.max(Math.abs(n(m.dcOffsetL) ?? 0), Math.abs(n(m.dcOffsetR) ?? 0));
  if (dc >= GATE.dcOffsetMax) {
    failures.push({
      code: 'dc_offset',
      metric: 'dcOffset',
      measured: dc,
      limit: GATE.dcOffsetMax,
      plain: `There is a DC offset of ${dc.toFixed(4)} on this file. It eats headroom and it will click. A high-pass at 20 Hz clears it.`,
    });
  }

  const cutoff = n(m.spectralCutoffHz);
  if (m.lossySourceLikely && cutoff !== null && cutoff < GATE.lossyCutoffHz) {
    failures.push({
      code: 'lossy_source',
      metric: 'spectralCutoffHz',
      measured: cutoff,
      limit: GATE.lossyCutoffHz,
      plain: `The spectrum falls off a cliff at ${Math.round(cutoff).toLocaleString()} Hz, which means this was made from an MP3 somewhere along the way, not from the master. Go back to the session and export again from source.`,
    });
  }

  /* -------------------------------------------------------- advisories --- */

  const lufs = n(m.integratedLufs);
  if (lufs !== null && (lufs < ADVISORY.lufsMin || lufs > ADVISORY.lufsMax)) {
    advisories.push({
      code: 'loudness',
      metric: 'integratedLufs',
      measured: lufs,
      target: `${ADVISORY.lufsMin} to ${ADVISORY.lufsMax} LUFS`,
      plain: lufs > ADVISORY.lufsMax
        ? `At ${lufs.toFixed(1)} LUFS this is louder than the catalog sits. Streaming platforms will turn it down anyway, and it will sound flatter than the records around it.`
        : `At ${lufs.toFixed(1)} LUFS this is quieter than the catalog sits. It will feel small next to the track that plays after it.`,
    });
  }

  if (corr !== null && corr >= GATE.correlationMin && corr < ADVISORY.correlationMin) {
    advisories.push({
      code: 'width',
      metric: 'stereoCorrelation',
      measured: corr,
      target: `above ${ADVISORY.correlationMin}`,
      plain: `The stereo image is very wide (correlation ${corr.toFixed(2)}). It will hold up, but check it in mono before you call it done.`,
    });
  }

  const runs = n(m.clippedRuns);
  if (runs !== null && runs > 0 && !failures.some((f) => f.code === 'true_peak')) {
    advisories.push({
      code: 'clipping',
      metric: 'clippedRuns',
      measured: runs,
      target: '0',
      plain: `There are ${runs} runs of clipped samples in here. It stayed under the ceiling overall, but something upstream is hitting the wall.`,
    });
  }

  return { passed: failures.length === 0, failures, advisories };
}
