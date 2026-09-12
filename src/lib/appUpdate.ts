/**
 * One place that knows a newer build of the app is waiting.
 *
 * The banner used to be the only sign, and it could be dismissed; after that
 * a person carried on in the old build with no way back to the prompt. Now
 * the fact lives here, the banner and the navigation both read it, and the
 * navigation keeps a small Update button on screen until the update is
 * actually applied, which reloads the page and clears it by nature.
 */

interface UpdateState {
  available: boolean;
  /** A service worker installed and waiting to take over, when there is one. */
  waiting: ServiceWorker | null;
  applying: boolean;
}

let state: UpdateState = { available: false, waiting: null, applying: false };
const listeners = new Set<() => void>();

function set(next: Partial<UpdateState>): void {
  state = { ...state, ...next };
  listeners.forEach((cb) => cb());
}

export function subscribeAppUpdate(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getAppUpdate(): UpdateState {
  return state;
}

/** Called by whoever notices a newer build: the deploy check or the service worker. */
export function markUpdateAvailable(waiting: ServiceWorker | null = null): void {
  set({ available: true, waiting: waiting ?? state.waiting });
}

/**
 * Take the update, and always land on the newest build.
 *
 * One tap has to be enough however many updates somebody ignored. This used to
 * message `state.waiting`, a worker reference captured at the moment the
 * button first appeared. Someone who left the prompt sitting while two more
 * builds shipped could tap it and activate a worker that was no longer the
 * newest, then be asked to update all over again. So the registration is read
 * again here and asked for the latest first; whatever is waiting after that is
 * the newest there is.
 *
 * A waiting worker is told to step in and the controllerchange listener in
 * main.tsx does the reload. With no worker at all, a plain reload fetches the
 * new index.html and its bundles, which is the same outcome by a slower road.
 */
export async function applyAppUpdate(): Promise<void> {
  if (state.applying) return;
  set({ applying: true });
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration) {
      // Ask the server what the newest worker is before taking one.
      await registration.update().catch(() => undefined);
      const waiting = registration.waiting ?? state.waiting;
      if (waiting) {
        waiting.postMessage({ type: 'SKIP_WAITING' });
        // If the worker never takes over (some browsers), fall back to a reload.
        window.setTimeout(() => window.location.reload(), 4000);
        return;
      }
    }
  } catch {
    // Nothing here is worth blocking the update over; the reload below still
    // gets them the new build.
  }
  window.location.reload();
}
