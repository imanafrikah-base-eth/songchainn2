import { supabase } from '@/integrations/supabase/client';
import { getEnv } from '@/lib/env';

/**
 * Getting a file into storage, with a second road when the first one fails.
 *
 * Every upload (a record, a cover, a gallery piece, world art) gets its row
 * reserved by upload-url and a signed link straight into the bucket. That
 * direct road is fast and stays first. On 10 Sep 2026 it stopped working for
 * one artist on her connection: every file stalled or errored on the way in,
 * nothing recorded why, and she was told to try smaller files. So now:
 *
 *   1. The direct send runs, and a send that makes no progress for a while
 *      counts as failed rather than hanging forever.
 *   2. If it fails, why is written to upload_failures.
 *   3. The same file goes again through upload-relay, over the connection the
 *      app already uses for everything else, and that failure is written down
 *      too if it happens.
 *
 * XHR rather than fetch throughout: a real progress bar matters when the
 * connection is slow, and plenty of the artists this is built for are on
 * slow connections.
 */

export type StorageTarget = { kind: 'visual' | 'song' | 'episode'; id: string };

/** Largest file the relay carries. Keep in step with RELAY_MAX_BYTES in upload-relay. */
export const RELAY_MAX_BYTES = 25 * 1024 * 1024;

/** No bytes moving for this long means stalled, not slow. */
const STALL_MS = 45_000;
/** Once every byte is sent, how long the other end may take to say it has them. */
const ANSWER_MS = 120_000;

type Stage = 'send' | 'relay';

class SendError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

function xhrSend(
  method: 'PUT' | 'POST',
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (err?: SendError) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) reject(err); else resolve();
    };
    const wait = (ms: number, why: string) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        xhr.abort();
        finish(new SendError(why, null));
      }, ms);
    };

    xhr.open(method, url, true);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      wait(STALL_MS, 'stalled: no bytes moved for 45 seconds');
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.upload.onload = () => wait(ANSWER_MS, 'sent, but no answer came back');
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) finish();
      else finish(new SendError(`refused with ${xhr.status}: ${(xhr.responseText || '').slice(0, 200)}`, xhr.status));
    };
    xhr.onerror = () => finish(new SendError('network error before any answer', 0));
    wait(STALL_MS, 'stalled: never started moving');
    xhr.send(file);
  });
}

/** Why a send stopped, written where the founder and Mo$ha can read it. Never throws. */
async function recordFailure(target: StorageTarget, file: File, stage: Stage, err: unknown): Promise<void> {
  try {
    const status = err instanceof SendError ? err.status : null;
    await supabase.from('upload_failures' as never).insert({
      kind: target.kind,
      row_id: target.id,
      stage,
      message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      http_status: status,
      bytes: file.size,
      content_type: file.type || null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
      online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    } as never);
  } catch {
    /* a failure to write down a failure must not become the error the artist sees */
  }
}

/**
 * Put one file where its reserved row says it belongs. Resolves once the bytes
 * are in storage; throws a plain sentence when neither road got them there.
 */
export async function sendFile(
  uploadUrl: string,
  file: File,
  target: StorageTarget,
  onProgress?: (pct: number) => void,
): Promise<void> {
  try {
    await xhrSend('PUT', uploadUrl, file, { 'Content-Type': file.type }, onProgress);
    return;
  } catch (err) {
    void recordFailure(target, file, 'send', err);
    if (file.size > RELAY_MAX_BYTES) {
      const mb = Math.round(file.size / (1024 * 1024));
      throw new Error(
        `That did not upload. At ${mb} MB it is too big for the second way in, so try again on a steadier connection, or send a shorter clip.`,
      );
    }
  }

  onProgress?.(0);
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new SendError('no session for the relay', 401);
    const { supabaseUrl, supabaseAnonKey } = getEnv();
    await xhrSend(
      'POST',
      `${supabaseUrl}/functions/v1/upload-relay?kind=${target.kind}&id=${encodeURIComponent(target.id)}`,
      file,
      {
        'Content-Type': file.type || 'application/octet-stream',
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      onProgress,
    );
  } catch (err) {
    void recordFailure(target, file, 'relay', err);
    throw new Error(
      'That did not upload. We tried two different ways and both stopped. Try again on a steadier connection, and if it keeps happening, songchaindao@gmail.com will look into it with you.',
    );
  }
}
