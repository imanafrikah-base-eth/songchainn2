// Recovery from a stale build.
//
// Every deploy renames the hashed chunks under /assets. A tab that was opened
// before the deploy still holds the old index.html in memory, so the first
// lazy route it visits afterwards asks for a chunk that no longer exists and
// the browser reports "Failed to fetch dynamically imported module". Nothing is
// wrong with the code; the page is simply out of date. The fix is to fetch the
// new index.html, which means a reload, after dropping the service worker and
// its caches so the reload cannot be served the same stale copy.
//
// The reload is rate-limited through sessionStorage so a genuinely broken
// deploy cannot send a phone into a reload loop.

import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { markUpdateAvailable } from "@/lib/appUpdate";

const AUTO_RELOAD_COUNT_KEY = "__songchainn_reload_count";
const AUTO_RELOAD_TS_KEY = "__songchainn_reload_at";
const AUTO_RELOAD_WINDOW_MS = 60_000;
const MAX_AUTO_RELOADS = 2;

export function isRecoverableLoadError(value: unknown): boolean {
  const message =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "message" in value
        ? String((value as { message?: unknown }).message)
        : "";
  const normalized = message.toLowerCase();
  return (
    normalized.includes("loading chunk") ||
    normalized.includes("chunkloaderror") ||
    normalized.includes("failed to fetch dynamically imported module") ||
    normalized.includes("importing a module script failed") ||
    normalized.includes("error loading dynamically imported module") ||
    normalized.includes("loading css chunk")
  );
}

function canAutoReload(): boolean {
  try {
    const count = Number(sessionStorage.getItem(AUTO_RELOAD_COUNT_KEY) || "0");
    if (count >= MAX_AUTO_RELOADS) return false;
    const last = Number(sessionStorage.getItem(AUTO_RELOAD_TS_KEY) || "0");
    return !last || Date.now() - last > AUTO_RELOAD_WINDOW_MS;
  } catch {
    return false;
  }
}

function markAutoReload(): void {
  try {
    const count = Number(sessionStorage.getItem(AUTO_RELOAD_COUNT_KEY) || "0");
    sessionStorage.setItem(AUTO_RELOAD_COUNT_KEY, String(count + 1));
    sessionStorage.setItem(AUTO_RELOAD_TS_KEY, String(Date.now()));
  } catch {
    void 0;
  }
}

let reloadStarted = false;

/**
 * Drop the service worker and every cache, then reload. Returns true when a
 * reload has been started (or is already under way), false when the limit has
 * been reached and the caller should show its own error instead.
 */
export function recoverFromStaleBuild(): boolean {
  if (typeof window === "undefined") return false;
  if (reloadStarted) return true;
  if (!canAutoReload()) return false;
  markAutoReload();
  reloadStarted = true;
  const reload = () => window.location.reload();
  if ("serviceWorker" in navigator) {
    Promise.all([
      navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister()))),
      // Everything except the songs somebody saved for offline. Wiping those
      // to fix a stale bundle costs them their music on a bad line, which is
      // the one thing offline play exists for.
      typeof caches !== "undefined" && caches.keys
        ? caches.keys().then((keys) => Promise.all(keys.filter((k) => !/audio/i.test(k)).map((k) => caches.delete(k))))
        : Promise.resolve([]),
    ])
      .catch((err) => {
        if (import.meta.env.DEV) console.warn("[sw-reset]", err);
      })
      .finally(reload);
    return true;
  }
  reload();
  return true;
}

/**
 * Window-level catch for chunk failures that escape React: a background
 * prefetch, an event handler, a wallet SDK loading itself.
 *
 * These do NOT reload the page. Nothing on screen is broken when a prefetch
 * fails, and reloading under somebody who is typing or uploading to fix a file
 * they never asked for is the rudest thing the app can do. It raises the
 * Update button instead, and they take it when they are ready. A screen that
 * really is broken still recovers: lazyWithRecovery below, and the error
 * boundary, both still reload.
 */
export function installLoadErrorRecovery(): void {
  if (typeof window === "undefined" || !import.meta.env.PROD) return;
  window.addEventListener("error", (event) => {
    const e = event as ErrorEvent;
    if (isRecoverableLoadError(e.error) || isRecoverableLoadError(e.message)) markUpdateAvailable();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isRecoverableLoadError((event as PromiseRejectionEvent).reason)) markUpdateAvailable();
  });
}

/**
 * React.lazy that recovers from a stale build instead of crashing to the
 * error boundary. On a chunk failure it starts the reload and leaves the
 * Suspense fallback on screen until the new page arrives; when the reload
 * limit is spent the error is rethrown so the boundary can explain it.
 */
export function lazyWithRecovery<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    importer().catch((err: unknown) => {
      if (import.meta.env.PROD && isRecoverableLoadError(err) && recoverFromStaleBuild()) {
        return new Promise<{ default: T }>(() => undefined);
      }
      throw err;
    }),
  );
}
