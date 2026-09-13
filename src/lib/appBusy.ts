/**
 * Something on screen must not be reloaded out from under the person.
 *
 * The Studio sets this while a file is on its way up or tracks are waiting to
 * be sent. Anything that would reload the page on its own (a new service
 * worker taking over, the stale-build recovery, the update banner popping up
 * over the form) asks here first and waits. A person who taps Update
 * themselves still gets the update: that is their choice to make.
 */

const reasons = new Set<string>();
const listeners = new Set<() => void>();

export function setAppBusy(reason: string, busy: boolean): void {
  const had = reasons.has(reason);
  if (busy === had) return;
  if (busy) reasons.add(reason);
  else reasons.delete(reason);
  listeners.forEach((cb) => cb());
}

export function isAppBusy(): boolean {
  return reasons.size > 0;
}

export function subscribeAppBusy(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Run `fn` now, or the moment nothing is busy any more. */
export function whenAppIdle(fn: () => void): void {
  if (!isAppBusy()) {
    fn();
    return;
  }
  const off = subscribeAppBusy(() => {
    if (isAppBusy()) return;
    off();
    fn();
  });
}
