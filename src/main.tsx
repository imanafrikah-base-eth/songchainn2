"use client";
import "./ses-compat";
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { checkSupabaseReachability } from "./lib/networkCheck";

declare global {
  interface Window {
    __songchainnDeferredInstallPrompt?: any;
  }
}

// Shared query client for wagmi and app
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

if (import.meta.env.DEV) {
  checkSupabaseReachability();
}

if (typeof window !== "undefined" && import.meta.env.PROD) {
  const AUTO_RELOAD_COUNT_KEY = "__songchainn_reload_count";
  const AUTO_RELOAD_TS_KEY = "__songchainn_reload_at";
  const AUTO_RELOAD_WINDOW_MS = 60_000;
  const MAX_AUTO_RELOADS = 2;

  const canAutoReload = () => {
    try {
      const count = Number(sessionStorage.getItem(AUTO_RELOAD_COUNT_KEY) || "0");
      if (count >= MAX_AUTO_RELOADS) return false;
      const last = Number(sessionStorage.getItem(AUTO_RELOAD_TS_KEY) || "0");
      return !last || Date.now() - last > AUTO_RELOAD_WINDOW_MS;
    } catch {
      return false;
    }
  };

  const markAutoReload = () => {
    try {
      const count = Number(sessionStorage.getItem(AUTO_RELOAD_COUNT_KEY) || "0");
      sessionStorage.setItem(AUTO_RELOAD_COUNT_KEY, String(count + 1));
      sessionStorage.setItem(AUTO_RELOAD_TS_KEY, String(Date.now()));
    } catch {
      void 0;
    }
  };

  const isRecoverableLoadError = (value: unknown) => {
    const message =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && "message" in value
          ? String((value as any).message)
          : "";

    const normalized = message.toLowerCase();
    return (
      normalized.includes("loading chunk") ||
      normalized.includes("chunkloaderror") ||
      normalized.includes("failed to fetch dynamically imported module") ||
      normalized.includes("importing a module script failed") ||
      normalized.includes("error loading dynamically imported module")
    );
  };

  const tryAutoReload = () => {
    if (!canAutoReload()) return;
    markAutoReload();
    const reload = () => window.location.reload();
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      Promise.all([
        navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister()))),
        typeof caches !== "undefined" && caches.keys ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))) : Promise.resolve([]),
      ])
        .catch((err) => { if (import.meta.env.DEV) console.warn('[sw-reset]', err); })
        .finally(reload);
      return;
    }
    reload();
  };

  window.addEventListener("error", (event) => {
    if (isRecoverableLoadError((event as ErrorEvent).error) || isRecoverableLoadError((event as ErrorEvent).message)) {
      tryAutoReload();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isRecoverableLoadError((event as PromiseRejectionEvent).reason)) {
      tryAutoReload();
    }
  });
}

if (typeof window !== "undefined" && typeof window.fetch === "function") {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : String(input);

    // Silence noisy WalletConnect telemetry pings
    if (url.includes("pulse.walletconnect.org/batch")) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }

    const isSupabase =
      url.includes(".supabase.co/rest/v1/") ||
      url.includes(".supabase.co/functions/v1/") ||
      url.includes(".supabase.co/auth/v1/");

    const runFetch = () => originalFetch(input, init);

    if (!isSupabase) return runFetch();

    // Single retry for transient network failures; real errors propagate to callers
    return runFetch().catch(async (error: any) => {
      const message = String(error?.message ?? error ?? "").toLowerCase();
      const isTransient =
        error?.name !== "AbortError" &&
        (message.includes("failed to fetch") ||
          message.includes("network changed") ||
          message.includes("http2") ||
          message.includes("timeout") ||
          message.includes("name not resolved"));

      if (isTransient) {
        return runFetch();
      }
      throw error;
    });
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: any) => {
    e.preventDefault();
    window.__songchainnDeferredInstallPrompt = e;
    window.dispatchEvent(new Event("pwa:installprompt"));
  });

  window.addEventListener("appinstalled", () => {
    window.__songchainnDeferredInstallPrompt = null;
    window.dispatchEvent(new Event("pwa:appinstalled"));
  });
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  // Capture the controller that was active before registration so we can tell
  // the difference between a fresh install (no prior controller) and an upgrade.
  const existingController = navigator.serviceWorker.controller;

  navigator.serviceWorker.register("/sw.js").then((registration) => {
    // Whenever the tab becomes visible, ask the browser to check for a new SW.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) registration.update().catch((err) => { if (import.meta.env.DEV) console.warn('[sw-update]', err); });
    });
  }).catch((err) => { if (import.meta.env.DEV) console.warn('[sw-register]', err); });

  // When a new SW finishes activating and claims this client, reload once so
  // the page runs the latest bundles. Guard against looping on fresh install
  // (existingController is null when there was no previous SW).
  let swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swRefreshing || !existingController) return;
    swRefreshing = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
        <SpeedInsights />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
