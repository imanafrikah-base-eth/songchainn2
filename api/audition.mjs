// audition — the ladder.
//
// An artist finishes their upload and calls this. It measures the actual audio
// against the SONGCHAINN standard, then hands the numbers to $HIKULU and NAKULU
// so a human being gets told what to fix in words instead of a table.
//
// The standard is a ladder, not a door. Almost everything publishes:
//
//   published -> to New Releases the same minute, on one of three rungs.
//                'master' meets the full standard, 'release' is clean
//                delivery, 'raw' is out and playable but not yet tight. The
//                rung decides eligibility for featured placement, editorial
//                and coining. It never decides whether the record exists.
//                Nobody approves it. The founder is not in the loop.
//   workshop  -> only when the file is measurably BROKEN: audible clipping, a
//                low bitrate rip, mono cancellation, DC offset, a snippet.
//                It goes to the artist's own private workshop with the note.
//                There is no public reject bin. Nobody can browse who did not
//                make it, and the artist can re-upload as many times as they
//                like.
//
// This is a production-standard gate, not a taste gate. It measures whether a
// record was finished properly. It has no opinion on whether a song is good.

import { createClient } from '@supabase/supabase-js';
import { measure } from './_audio.mjs';
import { judge, STANDARD, DELIVERY, GATE, TIER_LABEL } from './_standard.mjs';

const MAX_DOWNLOAD = 105 * 1024 * 1024; // a shade over the 100 MB upload cap
// Keep in step with AUDITION_STALE_MS in src/hooks/useArtistStudio.ts.
const STALE_AFTER_MS = 20 * 60 * 1000;

export const config = { maxDuration: 300 };

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method Not Allowed' });

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) {
    return send(res, 503, { error: 'The audition is not configured on this deployment.' });
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return send(res, 401, { error: 'Sign in first.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const songId = typeof body.songId === 'string' ? body.songId : '';
  if (!songId) return send(res, 400, { error: 'Which track?' });

  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asUser.auth.getUser();
  const user = userData?.user;
  if (!user) return send(res, 401, { error: 'Sign in first.' });

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: song, error: songErr } = await db
    .from('songs')
    .select('id, title, artist_name, owner_id, status, audio_url, storage_key, audition, created_at, cover_art_url')
    .eq('id', songId)
    .single();

  if (songErr || !song) return send(res, 404, { error: 'Track not found.' });
  if (song.owner_id !== user.id) return send(res, 403, { error: 'That is not your track.' });
  if (song.status === 'published') return send(res, 409, { error: 'This one is already out.' });
  // Nothing goes live without its artwork. The database refuses it too; this
  // says so in words before the judges spend a minute on the file.
  if (!song.cover_art_url) return send(res, 422, { error: 'Add the cover art first. Nothing goes live without it.', code: 'NO_COVER' });

  // "Still listening" is only true for twenty minutes. Past that the tab
  // closed on it or the function died, and the artist can ask again rather
  // than stare at "With the judges" forever.
  if (song.status === 'auditioning') {
    const startedAt = Date.parse(song.audition?.stage === 'listening' ? song.audition?.at : song.created_at) || 0;
    if (Date.now() - startedAt < STALE_AFTER_MS) {
      return send(res, 409, { error: 'The judges are still listening.' });
    }
  }

  await db
    .from('songs')
    .update({ status: 'auditioning', audition: { ok: false, stage: 'listening', at: new Date().toISOString() } })
    .eq('id', songId);

  /* --------------------------------------------------------- measure --- */

  let metrics;
  try {
    const audioRes = await fetch(song.audio_url);
    if (!audioRes.ok) throw new Error(`could not read the uploaded file (${audioRes.status})`);

    const len = Number(audioRes.headers.get('content-length') || 0);
    if (len > MAX_DOWNLOAD) throw new Error('file is larger than the 100 MB limit');

    const buf = Buffer.from(await audioRes.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD) throw new Error('file is larger than the 100 MB limit');

    metrics = await measure(buf, song.storage_key || song.audio_url);
    if (!metrics) throw new Error('there was no audio in that file');
  } catch (err) {
    const raw = String(err?.message || err);
    const plain = raw.startsWith('UNSUPPORTED_CODEC:')
      ? 'We could not read that file. Send a WAV or an MP3 exported straight from your session.'
      : `We could not read that file: ${raw}`;

    // A file we cannot decode is not a failed audition, it is a failed upload.
    // Send it back to the workshop with the truth and let them try again.
    await db.from('songs').update({
      status: 'workshop',
      audition: { ok: false, stage: 'decode', error: raw, plain, at: new Date().toISOString() },
    }).eq('id', songId);

    return send(res, 422, { status: 'workshop', error: plain });
  }

  /* ------------------------------------------------------------ judge --- */

  const verdict = judge(metrics);

  /* --------------------------------------- the judges put it in words --- */

  let note = null;
  try {
    const judgeRes = await fetch(`${url}/functions/v1/hikulu-judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        action: 'audition',
        song: { title: song.title, artistName: song.artist_name },
        metrics,
        verdict,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (judgeRes.ok) note = await judgeRes.json();
  } catch (err) {
    console.error('audition: judges unreachable', err);
  }

  const audition = {
    ok: true,
    passed: verdict.passed,
    // Which rung the record landed on: master | release | raw. Placement reads
    // this. A 'raw' track is still published and still playable, it just does
    // not get pushed into hero slots, editorial or coining until it is fixed.
    tier: verdict.tier,
    tierLabel: TIER_LABEL[verdict.tier],
    at: new Date().toISOString(),
    metrics,
    failures: verdict.failures,
    advisories: verdict.advisories,
    // Exactly what stands between this track and the next rung up.
    shortfalls: verdict.shortfalls,
    standard: STANDARD,
    delivery: DELIVERY,
    gate: GATE,
    // Null when the judges could not be reached. The measured result still
    // stands on its own; the artist is never blocked on the AI being up.
    hikulu: note?.hikulu ?? null,
    nakulu: note?.nakulu ?? null,
  };

  const { error: updateErr } = await db
    .from('songs')
    .update({ status: verdict.passed ? 'published' : 'workshop', audition, duration_seconds: metrics.durationSec ?? null })
    .eq('id', songId);

  if (updateErr) {
    console.error('audition: could not write result', updateErr);
    return send(res, 500, { error: 'The audition ran but we could not save it. Try again.' });
  }

  return send(res, 200, {
    status: verdict.passed ? 'published' : 'workshop',
    passed: verdict.passed,
    tier: verdict.tier,
    tierLabel: TIER_LABEL[verdict.tier],
    failures: verdict.failures,
    advisories: verdict.advisories,
    shortfalls: verdict.shortfalls,
    hikulu: audition.hikulu,
    nakulu: audition.nakulu,
    metrics,
  });
}
