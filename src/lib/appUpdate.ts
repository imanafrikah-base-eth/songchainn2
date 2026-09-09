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
 * Take the update. A waiting service worker is told to step in and the
 * controllerchange listener reloads; otherwise a plain reload fetches the
 * new index.html and its bundles.
 */
export function applyAppUpdate(): void {
  if (state.applying) return;
  set({ applying: true });
  if (state.waiting) {
    state.waiting.postMessage({ type: 'SKIP_WAITING' });
    // If the worker never takes over (some browsers), fall back to a reload.
    window.setTimeout(() => window.location.reload(), 4000);
    return;
  }
  window.location.reload();
}
