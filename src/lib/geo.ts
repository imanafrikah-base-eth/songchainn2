/**
 * Where a listener is, to the city, for the activity board.
 *
 * Nobody types this in. Vercel puts the city and country of every request in
 * headers, /api/geo reads them back, and the answer is kept for the session.
 * Locally, and anywhere the headers are absent, it is simply unknown, and a
 * play is counted without a city rather than with a guessed one.
 */

export interface Geo {
  city: string | null;
  country: string | null;
}

const KEY = 'songchainn:geo:v1';
const UNKNOWN: Geo = { city: null, country: null };

let cached: Geo | null = null;
let inFlight: Promise<Geo> | null = null;

function readSession(): Geo | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Geo;
    return { city: parsed.city ?? null, country: parsed.country ?? null };
  } catch {
    return null;
  }
}

/** What we know right now, without waiting. */
export function geoSync(): Geo {
  if (cached) return cached;
  const fromSession = readSession();
  if (fromSession) cached = fromSession;
  return cached ?? UNKNOWN;
}

/** Fetch once per session; safe to call many times. */
export function prefetchGeo(): Promise<Geo> {
  if (cached) return Promise.resolve(cached);
  const fromSession = readSession();
  if (fromSession) {
    cached = fromSession;
    return Promise.resolve(cached);
  }
  if (!inFlight) {
    inFlight = fetch('/api/geo', { credentials: 'omit' })
      .then(async (r) => {
        if (!r.ok) return UNKNOWN;
        const data = (await r.json()) as Partial<Geo>;
        return { city: data.city ?? null, country: data.country ?? null };
      })
      .catch(() => UNKNOWN)
      .then((geo) => {
        cached = geo;
        try {
          sessionStorage.setItem(KEY, JSON.stringify(geo));
        } catch {
          /* private mode; the in-memory copy still works */
        }
        return geo;
      });
  }
  return inFlight;
}
