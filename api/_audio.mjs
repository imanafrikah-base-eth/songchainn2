// Decode + measure, for the audition.
//
// The measurement engine itself is scripts/audio-standard/core.mjs, the same
// BS.1770-4 code that measured all 230 catalog tracks and passes 26/26 checks
// in validate.mjs (EBU Tech 3341 conformance reads -22.99 LUFS against the
// required -23.0 +/-0.1). It is imported, never copied: one engine, so the
// standard an artist is held to is the exact standard the catalog was
// measured against.
//
// This runs on Vercel's Node runtime, not a Supabase Edge Function. Decoding a
// full track is real CPU and memory work, and Node gets 300 s and room to
// breathe. Deno Deploy does not.

import { createAnalyser } from '../scripts/audio-standard/core.mjs';

/* ------------------------------------------------------------------ WAV --- */

/** Parses RIFF/WAVE from a whole buffer and pushes every frame at full depth. */
function measureWav(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }

  let off = 12;
  let fmt = null;

  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);

    if (id === 'fmt ') {
      let format = buf.readUInt16LE(off + 8);
      const channels = buf.readUInt16LE(off + 10);
      const sampleRate = buf.readUInt32LE(off + 12);
      const bits = buf.readUInt16LE(off + 22);
      if (format === 0xfffe && size >= 40) format = buf.readUInt16LE(off + 8 + 24); // EXTENSIBLE
      fmt = { format, channels, sampleRate, bits };
      off += 8 + size + (size % 2);
      continue;
    }

    if (id === 'data') {
      if (!fmt) throw new Error('data chunk before fmt');
      const declared = size === 0 || size === 0xffffffff ? Infinity : size;
      const start = off + 8;
      const available = buf.length - start;
      // A truncated upload measured as if complete is worse than a failure.
      if (Number.isFinite(declared) && available < declared) {
        throw new Error(`truncated: ${declared - available} of ${declared} audio bytes missing`);
      }
      const dataLen = Number.isFinite(declared) ? declared : available;
      return { ...pcm(buf, start, dataLen, fmt), sourceBits: fmt.bits, codec: fmt.format === 3 ? 'pcm_f' : `pcm_s${fmt.bits}` };
    }

    if (off + 8 + size > buf.length) break; // malformed trailing chunk, nothing left to find
    off += 8 + size + (size % 2);
  }

  throw new Error('no data chunk found');
}

function pcm(buf, start, dataLen, fmt) {
  const { format, channels, sampleRate, bits } = fmt;
  const bytesPerSample = bits >> 3;
  const frameBytes = bytesPerSample * channels;
  const frames = Math.floor(dataLen / frameBytes);
  if (!frames) throw new Error('no audio frames');

  const a = createAnalyser(sampleRate, channels);
  const nch = Math.min(2, channels);

  const read = (p) => {
    if (format === 3) return bits === 64 ? buf.readDoubleLE(p) : buf.readFloatLE(p);
    if (bits === 16) return buf.readInt16LE(p) / 32768;
    if (bits === 24) return ((buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16)) << 8) / 2147483648;
    if (bits === 32) return buf.readInt32LE(p) / 2147483648;
    if (bits === 8) return (buf[p] - 128) / 128;
    throw new Error(`unsupported bit depth ${bits}`);
  };

  for (let i = 0; i < frames; i++) {
    const o = start + i * frameBytes;
    const L = read(o);
    const R = nch > 1 ? read(o + bytesPerSample) : L;
    a.pushFrame(L, R);
  }

  return a.finish();
}

/* ------------------------------------------------------------------ MP3 --- */

async function measureMp3(buf) {
  const { MPEGDecoder } = await import('mpg123-decoder');
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    const { channelData, samplesDecoded, sampleRate } = decoder.decode(new Uint8Array(buf));
    if (!samplesDecoded) throw new Error('decoder returned no samples');
    const nch = channelData.length;
    const a = createAnalyser(sampleRate, nch);
    const L = channelData[0];
    const R = nch > 1 ? channelData[1] : channelData[0];
    for (let i = 0; i < samplesDecoded; i++) a.pushFrame(L[i], R[i]);
    const out = a.finish();
    return {
      ...out,
      codec: 'mp3',
      containerBitrateKbps: out.durationSec ? Math.round((buf.length * 8) / out.durationSec / 1000) : null,
    };
  } finally {
    decoder.free();
  }
}

/* ----------------------------------------------------------------- main --- */

/**
 * Measure an audio buffer. Returns the full metric set from core.mjs plus the
 * codec it came from. Throws with a plain-language reason if it cannot decode.
 */
export async function measure(buf, storageKey = '') {
  const ext = (storageKey.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  const looksWav = buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF';

  if (looksWav || ext === 'wav') return { ...measureWav(buf), fileBytes: buf.length };
  if (ext === 'mp3' || ext === 'mpeg') return { ...(await measureMp3(buf)), fileBytes: buf.length };

  // FLAC/M4A/AAC are accepted at upload but cannot be decoded here yet. Say so
  // honestly rather than failing the artist for something they did not do.
  throw new Error(`UNSUPPORTED_CODEC:${ext || 'unknown'}`);
}
