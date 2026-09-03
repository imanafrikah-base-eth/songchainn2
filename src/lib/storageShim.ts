/**
 * Make web storage safe to touch, once, before anything renders.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS EXISTS TO KILL
 * ---------------------------------------------------------------------------
 * Reading window.localStorage does not return null when storage is blocked. It
 * THROWS a SecurityError. In an iframe whose partitioned storage is denied,
 * which is exactly how a Farcaster mini app and most in-app browsers embed us,
 * the very first provider that touched it threw during render and the whole
 * app fell to the error boundary: "Something went wrong". Not a degraded
 * feature, not a lost preference. A blank app, for everyone arriving from a
 * cast.
 *
 * There are around a hundred and thirty direct localStorage calls across the
 * codebase. Wrapping every one of them in a try/catch is a hundred and thirty
 * chances to miss one, and the next person to write localStorage.getItem in a
 * component brings the bug straight back.
 *
 * So the storage itself is made safe instead of the callers. If the real thing
 * throws, an in-memory Storage stands in its place on window, and every call
 * site in the app keeps working unchanged with no idea anything happened.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS LOST, AND WHY THAT IS THE RIGHT TRADE
 * ---------------------------------------------------------------------------
 * The stand-in does not survive a reload, so in a blocked context preferences
 * and the cached session live only as long as the page does. That is a real
 * cost and it is nowhere near the cost of the app not opening at all. Where
 * storage works, nothing about this file changes anything.
 */

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(i: number) {
      return Array.from(map.keys())[i] ?? null;
    },
    getItem(k: string) {
      return map.has(k) ? (map.get(k) as string) : null;
    },
    setItem(k: string, v: string) {
      map.set(String(k), String(v));
    },
    removeItem(k: string) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
  } as Storage;
}

/**
 * Is this storage actually usable?
 *
 * Both halves matter. Reading the property throws when access is denied
 * outright, and writing throws separately in Safari private mode and when a
 * quota is full, where the property reads back perfectly well.
 */
function isUsable(kind: 'localStorage' | 'sessionStorage'): boolean {
  try {
    const s = window[kind];
    if (!s) return false;
    const probe = '__songchainn_storage_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function replace(kind: 'localStorage' | 'sessionStorage') {
  try {
    Object.defineProperty(window, kind, {
      value: memoryStorage(),
      configurable: true,
      writable: false,
    });
  } catch {
    // Some engines refuse to redefine it. Nothing further we can do here, and
    // the call sites that already carry their own try/catch still survive.
  }
}

let installed = false;

export function installStorageShim() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  if (!isUsable('localStorage')) replace('localStorage');
  if (!isUsable('sessionStorage')) replace('sessionStorage');
}
