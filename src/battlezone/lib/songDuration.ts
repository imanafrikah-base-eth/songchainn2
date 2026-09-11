/**
 * How long a song actually is.
 *
 * The battle clock used to give every song the same 210 second slot, because
 * nothing in the catalogue carried a duration. A battle therefore ran for a
 * length nobody chose and ended while music was still playing, or sat there
 * after it had stopped. The browser can just ask the file: loading only the
 * metadata of an audio URL is a few kilobytes and comes back in well under a
 * second on a normal connection.
 *
 * Nothing here throws. A song we cannot measure comes back null and the clock
 * falls back to its slot, which is the old behaviour and never worse.
 */

/** Long enough for a slow phone, short enough that picking songs stays instant. */
const READ_TIMEOUT_MS = 6000;

const cache = new Map<string, number | null>();

/** Seconds, rounded, or null when the file will not say. */
export function durationFromUrl(url: string | null | undefined): Promise<number | null> {
  if (!url || typeof document === 'undefined') return Promise.resolve(null);
  const cached = cache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);

  return new Promise<number | null>((resolve) => {
    const audio = document.createElement('audio');
    let settled = false;

    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      cache.set(url, value);
      resolve(value);
    };

    const timer = setTimeout(() => done(null), READ_TIMEOUT_MS);

    audio.preload = 'metadata';
    // A cross-origin file still reports its duration without this, but asking
    // anonymously keeps the request cheap and avoids a credentialed preflight.
    audio.crossOrigin = 'anonymous';
    audio.onloadedmetadata = () => {
      const secs = audio.duration;
      done(Number.isFinite(secs) && secs > 0 ? Math.round(secs) : null);
    };
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/** The same for several songs at once, in the order given. */
export function durationsFromUrls(urls: Array<string | null | undefined>): Promise<Array<number | null>> {
  return Promise.all(urls.map((u) => durationFromUrl(u)));
}
